import { optional, required, storageConfigFromEnv } from "./common.ts";
import { issueStableQualification } from "./stable-qualification.ts";

const result = await issueStableQualification({
  manifestDir: required("RELEASE_MANIFEST_DIR"),
  metadataPath: required("RELEASE_METADATA_PATH"),
  metadataUrl: required("RELEASE_METADATA_URL"),
  outputsPath: required("RELEASE_OUTPUTS_PATH"),
  publicOrigin: required("RELEASE_PUBLIC_ORIGIN"),
  smokeResults: {
    mac_arm64: optional("RELEASE_MAC_ARM64_SMOKE_RESULT"),
    mac_x64: optional("RELEASE_MAC_X64_SMOKE_RESULT"),
    win_x64: optional("RELEASE_WIN_X64_SMOKE_RESULT"),
  },
  storage: storageConfigFromEnv(),
  workDir: required("RELEASE_QUALIFICATION_WORK_DIR"),
});

console.log(JSON.stringify(result, null, 2));
