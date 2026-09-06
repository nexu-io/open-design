import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { parseContentIdentityRegistry } from "@open-design/metatool";

import { acceptedShellBaselineIdentity, type AcceptedShellBaselinePayload } from "../src/exact/accepted-baseline.js";
import { createExactPlan } from "../src/exact/plan.js";
import { createExactReleasePlan } from "../src/exact/release-plan.js";

const roots: string[] = [];

afterEach(async () => {
  await Promise.all(roots.splice(0).map(async (root) => await rm(root, { force: true, recursive: true })));
});

async function fixture() {
  const root = await mkdtemp(join(tmpdir(), "od-exact-release-plan-"));
  roots.push(root);
  const ids = [
    "electron.contract.build", "electron.contract.test", "electron.shell.build", "electron.shell.test", "closure.build", "closure.test",
    "electron.distribution", "electron.acceptance.full", "closure.acceptance.hot",
  ] as const;
  await Promise.all(ids.map(async (id) => {
    await mkdir(join(root, id), { recursive: true });
    await writeFile(join(root, id, "input.txt"), `${id}\n`);
  }));
  return {
    registry: parseContentIdentityRegistry({
      identities: Object.fromEntries(ids.map((id) => [id, {
        parameters: (id.startsWith("electron.") && !id.startsWith("electron.contract.")) || id === "closure.acceptance.hot" ? ["target", "acceptedShellBaseline"] : ["target"],
        schemaVersion: 1, sourceSets: [id],
      }])),
      schemaVersion: 1,
      sourceSets: Object.fromEntries(ids.map((id) => [id, { paths: [id] }])),
    }),
    root,
  };
}

describe("exact release plan", () => {
  it("derives a cold baseline from Closure inputs and cannot reuse unaccepted work", async () => {
    const input = await fixture();
    const first = await createExactReleasePlan({
      ...input, availableIdentities: new Set([`sha256:${"a".repeat(64)}`]), channel: "betahyx", target: "darwin-arm64",
    });
    expect(first.baseline.mode).toBe("bootstrap");
    expect(first.actions.map(({ id }) => id)).toEqual([
      "electron.contract.build", "electron.contract.test", "electron.shell.build", "electron.shell.test", "closure.build", "closure.test", "electron.distribution",
      "electron.acceptance.full", "exact.compose", "exact.publish", "exact.activate",
    ]);

    await writeFile(join(input.root, "closure.build", "input.txt"), "changed\n");
    const second = await createExactReleasePlan({
      ...input, availableIdentities: new Set(), channel: "betahyx", target: "darwin-arm64",
    });
    expect(second.baseline.baselineIdentity).not.toBe(first.baseline.baselineIdentity);
    expect(second.plan.nodes["electron.shell.build"].identity).not.toBe(first.plan.nodes["electron.shell.build"].identity);
  });

  it("retains accepted Shell identities across a Closure-only change", async () => {
    const input = await fixture();
    const baseline: AcceptedShellBaselinePayload = {
      artifact: { sha256: "a".repeat(64), size: 100 }, channel: "betahyx",
      seed: { closure: { sha256: "b".repeat(64), size: 10 }, standalone: { sha256: "c".repeat(64), size: 20 } },
      shell: { buildHash: "d".repeat(64), type: "electron", version: "0.1.0" }, target: "darwin-arm64",
    };
    const baselineIdentity = acceptedShellBaselineIdentity(baseline);
    const acceptedPlan = await createExactPlan({ ...input, acceptedShellBaseline: baselineIdentity, target: "darwin-arm64" });
    const acceptedIdentities = Object.values(acceptedPlan.nodes).map(({ identity }) => identity);
    const bytes = Buffer.from(`${JSON.stringify({
      acceptedIdentities, baseline, baselineIdentity, operation: "electron.shell-baseline.accepted", schemaVersion: 1,
    })}\n`);
    await writeFile(join(input.root, "closure.build", "input.txt"), "new Closure\n");
    const release = await createExactReleasePlan({
      ...input,
      acceptedReceipt: { bytes, sha256: `sha256:${createHash("sha256").update(bytes).digest("hex")}` },
      availableIdentities: new Set(), channel: "betahyx", target: "darwin-arm64",
    });
    expect(release.baseline.mode).toBe("accepted");
    expect(release.plan.nodes["electron.shell.build"].identity).toBe(acceptedPlan.nodes["electron.shell.build"].identity);
    expect(release.plan.nodes["electron.distribution"].identity).toBe(acceptedPlan.nodes["electron.distribution"].identity);
    expect(release.actions.map(({ id }) => id)).toEqual([
      "closure.build", "closure.test", "closure.acceptance.hot", "exact.compose", "exact.publish", "exact.activate",
    ]);
  });
});
