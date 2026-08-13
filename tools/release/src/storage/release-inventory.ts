import { join } from "node:path";

import {
  releaseInventoryObjectKey,
  releaseVersionPrefix,
  type ReleaseChannel,
} from "@open-design/release";

import { normalizePublicUrl, writeJson } from "./common.ts";
import { putImmutableStorageObject, type StorageConfig } from "./s3-upload.ts";

export type ReleaseInventoryObject = {
  digest?: string;
  kind: string;
  size?: number;
  target?: string;
  url: string;
};

export async function publishReleaseInventory(input: {
  channel: ReleaseChannel;
  objects: ReleaseInventoryObject[];
  publicOrigin: string;
  releaseVersion: string;
  storage: StorageConfig;
  workDir: string;
}): Promise<string> {
  const objectKey = releaseInventoryObjectKey(input.channel, input.releaseVersion);
  const versionUrl = normalizePublicUrl(
    `${input.publicOrigin.replace(/\/+$/u, "")}/${releaseVersionPrefix(input.channel, input.releaseVersion)}/`,
  );
  const objects = [...new Map(input.objects.map((object) => [normalizePublicUrl(object.url), {
    ...object,
    url: normalizePublicUrl(object.url),
  }])).values()].sort((left, right) => left.url.localeCompare(right.url));
  for (const object of objects) {
    if (!object.url.startsWith(versionUrl)) {
      throw new Error(`release inventory object is outside ${versionUrl}: ${object.url}`);
    }
  }
  const path = join(input.workDir, "inventory.json");
  writeJson(path, {
    channel: input.channel,
    objects,
    releaseVersion: input.releaseVersion,
    schemaVersion: 1,
  });
  await putImmutableStorageObject({
    ...input.storage,
    bodyPath: path,
    cacheControl: "public, max-age=31536000, immutable",
    contentType: "application/json; charset=utf-8",
    objectKey,
  });
  return normalizePublicUrl(`${input.publicOrigin.replace(/\/+$/u, "")}/${objectKey}`);
}
