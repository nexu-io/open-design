import { dirname } from "node:path";

import { required, storageConfigFromEnv, writeJson } from "./common.ts";
import { activateStableRelease } from "./stable-activation.ts";

const metadataPath = required("RELEASE_METADATA_PATH");
const result = await activateStableRelease({
  manifestDir: required("RELEASE_MANIFEST_DIR"),
  metadataDir: dirname(metadataPath),
  metadataPath,
  releaseVersion: required("RELEASE_VERSION"),
  repository: required("RELEASE_REPOSITORY"),
  storage: storageConfigFromEnv(),
  versionTag: required("VERSION_TAG"),
});
writeJson(required("RELEASE_OUTPUTS_PATH"), result);
console.log(JSON.stringify(result, null, 2));
