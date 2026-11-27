import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, it } from "node:test";

import { APP_KEYS } from "@open-design/sidecar-proto";

import { assertWebProductionBuild } from "../src/prod-build.js";

describe("tools-dev production build preflight", () => {
  let workspaceRoot: string;
  const targets = [APP_KEYS.DAEMON, APP_KEYS.WEB];

  beforeEach(async () => {
    workspaceRoot = await mkdtemp(path.join(tmpdir(), "od-prod-build-"));
  });

  afterEach(async () => {
    await rm(workspaceRoot, { force: true, recursive: true });
  });

  it("rejects --prod with the build command when the web build is missing", async () => {
    await assert.rejects(
      assertWebProductionBuild(workspaceRoot, targets, { prod: true }),
      /--prod requires a web production build.*pnpm --filter @open-design\/web build/s,
    );
  });

  it("rejects an interrupted build that has no BUILD_ID", async () => {
    await mkdir(path.join(workspaceRoot, "apps/web/.next"), { recursive: true });

    await assert.rejects(assertWebProductionBuild(workspaceRoot, targets, { prod: true }));
  });

  it("accepts a completed build", async () => {
    await mkdir(path.join(workspaceRoot, "apps/web/.next"), { recursive: true });
    await writeFile(path.join(workspaceRoot, "apps/web/.next/BUILD_ID"), "test");

    await assertWebProductionBuild(workspaceRoot, targets, { prod: true });
  });

  it("does not require a build without --prod", async () => {
    await assertWebProductionBuild(workspaceRoot, targets, {});
  });

  it("does not require a web build when web is not a target", async () => {
    await assertWebProductionBuild(workspaceRoot, [APP_KEYS.DAEMON], { prod: true });
  });
});
