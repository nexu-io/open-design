import { required, storageConfigFromEnv, writeJson } from "./common.ts";
import { activateAcceptedPublicRelease } from "./public-acceptance.ts";

const outputsPath = required("RELEASE_OUTPUTS_PATH");
const result = await activateAcceptedPublicRelease({
  credentialPath: required("RELEASE_PUBLIC_ACCEPTANCE_CREDENTIAL_PATH"),
  publicOrigin: required("RELEASE_PUBLIC_ORIGIN"),
  storage: storageConfigFromEnv(),
  workDir: required("RELEASE_ACTIVATION_WORK_DIR"),
});
writeJson(outputsPath, result);
console.log(JSON.stringify(result, null, 2));
