import { readFile, writeFile } from "node:fs/promises";

import {
  STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
  validateStandaloneBootstrapDescriptor,
  type StandaloneBootstrapResult,
} from "@open-design/standalone-proto";

import { StandaloneBootstrapError, resolveStandaloneBootstrap } from "./bootstrap.js";

export const STANDALONE_BOOTSTRAP_INPUT_ENV = "OD_STANDALONE_BOOTSTRAP_INPUT_V1" as const;
export const STANDALONE_BOOTSTRAP_RESULT_ENV = "OD_STANDALONE_BOOTSTRAP_RESULT_V1" as const;

export async function handoffOnce(
  env: NodeJS.ProcessEnv = process.env,
): Promise<StandaloneBootstrapResult> {
  const inputPath = env[STANDALONE_BOOTSTRAP_INPUT_ENV];
  const resultPath = env[STANDALONE_BOOTSTRAP_RESULT_ENV];
  if (inputPath == null || resultPath == null) {
    throw new Error("Standalone bootstrap input and result paths are required");
  }
  const descriptor = validateStandaloneBootstrapDescriptor(
    JSON.parse(await readFile(inputPath, "utf8")) as unknown,
  );
  let result: StandaloneBootstrapResult;
  try {
    result = Object.freeze({
      outcome: "resolved",
      resolution: await resolveStandaloneBootstrap(descriptor),
      schemaVersion: STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
    });
  } catch (error) {
    result = Object.freeze({
      error: Object.freeze({
        code: error instanceof StandaloneBootstrapError ? error.code : "standalone-invalid",
        message: error instanceof Error ? error.message : String(error),
      }),
      outcome: "rejected",
      schemaVersion: STANDALONE_BOOTSTRAP_RESULT_SCHEMA_VERSION,
    });
  }
  await writeFile(resultPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  return result;
}
