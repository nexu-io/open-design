import { required } from "./common.ts";
import { preparePublicWindowsAcceptance } from "./public-acceptance.ts";

const result = await preparePublicWindowsAcceptance({
  buildJsonPath: required("RELEASE_PUBLIC_ACCEPTANCE_BUILD_JSON_PATH"),
  commit: required("RELEASE_COMMIT"),
  downloadDir: required("RELEASE_PUBLIC_ACCEPTANCE_DOWNLOAD_DIR"),
  metadataUrl: required("RELEASE_METADATA_URL"),
  namespace: required("RELEASE_NAMESPACE"),
  planPath: required("RELEASE_PUBLIC_ACCEPTANCE_PLAN_PATH"),
  publicOrigin: required("RELEASE_PUBLIC_ORIGIN"),
  releaseVersion: required("RELEASE_VERSION"),
});

console.log(JSON.stringify(result, null, 2));
