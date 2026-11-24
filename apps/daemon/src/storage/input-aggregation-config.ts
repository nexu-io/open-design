import { open } from 'node:fs/promises';
import { join } from 'node:path';
import { parseInputAggregationTrial, type InputAggregationTrial } from '@open-design/contracts/analytics';

/** Missing, unreadable, oversized or mismatched configuration always pauses the trial. */
export async function readInputAggregationTrial(dataDir: string, host: string, key: string): Promise<InputAggregationTrial | null> {
  try {
    const file = await open(join(dataDir, 'input-aggregation-trial.json'), 'r');
    try {
      const buffer = Buffer.alloc(2049);
      const { bytesRead } = await file.read(buffer, 0, buffer.length, 0);
      if (bytesRead > 2048) return null;
      return parseInputAggregationTrial(JSON.parse(buffer.subarray(0, bytesRead).toString('utf8')), host, key);
    } finally { await file.close(); }
  } catch { return null; }
}
