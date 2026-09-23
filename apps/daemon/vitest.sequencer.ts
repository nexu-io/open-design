import { basename } from 'node:path';

import { BaseSequencer, type TestSpecification } from 'vitest/node';

const PARTITION_COUNT = 4;
const PARTITION_FAMILIES = ['chat-route', 'od-next-automatic-simple-server'] as const;
const PARTITION_PATTERN = /^(chat-route|od-next-automatic-simple-server)-partition-(\d+)\.test\.ts$/;

export class DaemonTestSequencer extends BaseSequencer {
  override async shard(files: TestSpecification[]): Promise<TestSpecification[]> {
    const shard = this.ctx.config.shard;
    if (shard.count !== PARTITION_COUNT) {
      return super.shard(files);
    }

    const partitionsByFamily = new Map<string, Map<number, TestSpecification>>();
    const ordinaryFiles: TestSpecification[] = [];
    for (const file of files) {
      const match = PARTITION_PATTERN.exec(basename(file.moduleId));
      if (!match) {
        ordinaryFiles.push(file);
        continue;
      }

      const family = match[1];
      const partition = Number(match[2]);
      const partitions = partitionsByFamily.get(family) ?? new Map<number, TestSpecification>();
      if (partition < 1 || partition > PARTITION_COUNT || partitions.has(partition)) {
        throw new Error(`Invalid daemon partition entry: ${file.moduleId}`);
      }
      partitions.set(partition, file);
      partitionsByFamily.set(family, partitions);
    }

    const activeFamilies = PARTITION_FAMILIES.filter((family) => partitionsByFamily.has(family));
    for (const family of activeFamilies) {
      const actual = partitionsByFamily.get(family)?.size ?? 0;
      if (actual !== PARTITION_COUNT) {
        throw new Error(`Expected ${PARTITION_COUNT} ${family} partition entries, found ${actual}`);
      }
    }

    const ordinaryShard = await super.shard(ordinaryFiles);
    const pinned = activeFamilies.map((family) =>
      partitionsByFamily.get(family)!.get(shard.index)!);
    return [...ordinaryShard, ...pinned];
  }
}
