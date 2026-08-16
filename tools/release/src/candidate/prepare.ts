import { appendFileSync, readFileSync } from "node:fs";

import { optional, required, writeJson } from "../storage/common.ts";
import { releaseCandidateId, validateReleaseCandidateSpec } from "./identity.ts";

const specPath = required("RELEASE_CANDIDATE_SPEC_PATH");
const spec = validateReleaseCandidateSpec(JSON.parse(readFileSync(specPath, "utf8")) as unknown);
const candidateId = releaseCandidateId(spec);
const outputPath = optional("RELEASE_CANDIDATE_OUTPUT_PATH");
const githubOutput = optional("GITHUB_OUTPUT");

if (outputPath.length > 0) writeJson(outputPath, { candidateId, spec });
if (githubOutput.length > 0) {
  appendFileSync(githubOutput, `candidate_id=${candidateId}\n`, "utf8");
}
process.stdout.write(`${candidateId}\n`);
