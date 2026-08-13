import { required, storageConfigFromEnv, writeJson } from "./common.ts";
import { activateAcceptedPublicRelease } from "./public-acceptance.ts";
import { readdirSync } from "node:fs";
import { join } from "node:path";

const outputsPath = required("RELEASE_OUTPUTS_PATH");
const credentialDir = required("RELEASE_PUBLIC_ACCEPTANCE_CREDENTIAL_DIR");
const result = await activateAcceptedPublicRelease({
  credentialPaths: readdirSync(credentialDir)
    .filter((name) => name.endsWith(".json"))
    .map((name) => join(credentialDir, name)),
  publicOrigin: required("RELEASE_PUBLIC_ORIGIN"),
  storage: storageConfigFromEnv(),
  workDir: required("RELEASE_ACTIVATION_WORK_DIR"),
});
writeJson(outputsPath, result);
console.log(JSON.stringify(result, null, 2));
