import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { required, storageConfigFromEnv, writeText } from "./common.ts";
import { putStorageObject } from "./s3-upload.ts";

const storage = storageConfigFromEnv();
const releaseChannel = required("RELEASE_CHANNEL");
const probeName = required("R2_ACCESS_PROBE_NAME");
const publicOrigin = required("RELEASE_PUBLIC_ORIGIN").replace(/\/+$/, "");
const runId = required("GITHUB_RUN_ID");
const commit = required("GITHUB_SHA");

const probeDir = mkdtempSync(join(tmpdir(), "od-r2-access-"));
const probePath = join(probeDir, "r2-release-access.txt");
const probeKey = `${releaseChannel}/.ci-access-check/${probeName}.txt`;

writeText(probePath, `run=${runId}\nsha=${commit}\nchannel=${releaseChannel}\n`);

await putStorageObject({
  ...storage,
  bodyPath: probePath,
  cacheControl: "no-store",
  contentType: "text/plain; charset=utf-8",
  objectKey: probeKey,
});

console.log(`validated release storage write access: ${publicOrigin}/${probeKey}`);
