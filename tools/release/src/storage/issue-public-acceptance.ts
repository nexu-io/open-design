import { required } from "./common.ts";
import { issuePublicWindowsAcceptance } from "./public-acceptance.ts";

const result = await issuePublicWindowsAcceptance({
  credentialPath: required("RELEASE_PUBLIC_ACCEPTANCE_CREDENTIAL_PATH"),
  planPath: required("RELEASE_PUBLIC_ACCEPTANCE_PLAN_PATH"),
  smokeSummaryPath: required("RELEASE_PUBLIC_ACCEPTANCE_SMOKE_SUMMARY_PATH"),
  suiteResultPath: required("RELEASE_PUBLIC_ACCEPTANCE_SUITE_RESULT_PATH"),
});

console.log(JSON.stringify(result, null, 2));
