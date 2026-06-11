import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, it } from "node:test";

import {
  LOCAL_DEVELOPMENT_TELEMETRY_ENV,
  loadWorkspaceLocalEnv,
  parseDotEnvLocal,
  TELEMETRY_ENV_KEY,
} from "../src/local-env.js";

describe("tools-dev local env loading", () => {
  it("parses common .env.local assignment forms", () => {
    assert.deepEqual({ ...parseDotEnvLocal([
      "# comment",
      "POSTHOG_KEY=phc_local",
      "POSTHOG_HOST=https://us.i.posthog.com # trailing comment",
      "export LANGFUSE_PUBLIC_KEY=\"pk local\"",
      "LANGFUSE_SECRET_KEY='sk#local'",
      "BAD-KEY=ignored",
      "",
    ].join("\n")) }, {
      POSTHOG_KEY: "phc_local",
      POSTHOG_HOST: "https://us.i.posthog.com",
      LANGFUSE_PUBLIC_KEY: "pk local",
      LANGFUSE_SECRET_KEY: "sk#local",
    });
  });

  it("loads workspace .env.local over the parent environment and marks telemetry as local dev", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "od-local-env-"));
    await writeFile(path.join(workspaceRoot, ".env.local"), [
      "POSTHOG_KEY=phc_from_file",
      "LANGFUSE_PUBLIC_KEY=pk_from_file",
    ].join("\n"));
    const env: NodeJS.ProcessEnv = { POSTHOG_KEY: "phc_from_parent" };

    const result = loadWorkspaceLocalEnv({ workspaceRoot, env });

    assert.equal(result.loaded, true);
    assert.equal(env.POSTHOG_KEY, "phc_from_file");
    assert.equal(env.LANGFUSE_PUBLIC_KEY, "pk_from_file");
    assert.equal(env[TELEMETRY_ENV_KEY], LOCAL_DEVELOPMENT_TELEMETRY_ENV);
    assert.deepEqual(result.keys, ["LANGFUSE_PUBLIC_KEY", "POSTHOG_KEY"]);
  });

  it("preserves an explicit telemetry environment from .env.local", async () => {
    const workspaceRoot = await mkdtemp(path.join(os.tmpdir(), "od-local-env-"));
    await writeFile(path.join(workspaceRoot, ".env.local"), `${TELEMETRY_ENV_KEY}=dev_smoke\n`);
    const env: NodeJS.ProcessEnv = {};

    loadWorkspaceLocalEnv({ workspaceRoot, env });

    assert.equal(env[TELEMETRY_ENV_KEY], "dev_smoke");
  });
});
