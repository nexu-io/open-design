/**
 * Lane derivation, forbidden-surface detection, seam detection, and the
 * noisy-file filter. These rules track docs/code-review-guidelines.md §2 and
 * §4, and AGENTS.md "Inactive or placeholder directories".
 */

import assert from "node:assert/strict";
import { describe, it } from "node:test";

import {
  deriveForbidden,
  deriveLane,
  deriveSeams,
  isNoisyFile,
} from "../src/lane.js";

describe("deriveLane", () => {
  it("returns default with empty paths", () => {
    const { lane, hits } = deriveLane([]);
    assert.equal(lane, "default");
    assert.deepEqual([...hits], ["default"]);
  });

  it("classifies a single skill-only PR as skill", () => {
    const { lane, hits } = deriveLane(["skills/brief-packager/skill.md"]);
    assert.equal(lane, "skill");
    assert.deepEqual([...hits], ["skill"]);
  });

  it("classifies a single contract-only PR as contract", () => {
    const { lane, hits } = deriveLane(["packages/contracts/src/api/run.ts"]);
    assert.equal(lane, "contract");
    assert.deepEqual([...hits], ["contract"]);
  });

  it("classifies sidecar-proto edits as contract", () => {
    const { lane } = deriveLane(["packages/sidecar-proto/src/messages.ts"]);
    assert.equal(lane, "contract");
  });

  it("classifies a single design-system-only PR as design-system", () => {
    const { lane, hits } = deriveLane(["design-systems/nexu/DESIGN.md"]);
    assert.equal(lane, "design-system");
    assert.deepEqual([...hits], ["design-system"]);
  });

  it("classifies a single craft-only PR as craft", () => {
    const { lane, hits } = deriveLane(["craft/typography.md"]);
    assert.equal(lane, "craft");
    assert.deepEqual([...hits], ["craft"]);
  });

  it("returns docs when every path matches DOCS_ONLY", () => {
    const { lane } = deriveLane(["README.md", "docs/spec.md", "CHANGELOG.md"]);
    assert.equal(lane, "docs");
  });

  it("returns multi when paths cross more than one lane", () => {
    const { lane, hits } = deriveLane([
      "skills/brief-packager/skill.md",
      "packages/contracts/src/api/run.ts",
    ]);
    assert.equal(lane, "multi");
    assert.equal(hits.has("skill"), true);
    assert.equal(hits.has("contract"), true);
  });

  it("returns default for a plain app source change", () => {
    const { lane } = deriveLane(["apps/web/src/foo.ts"]);
    assert.equal(lane, "default");
  });
});

describe("deriveForbidden", () => {
  it("returns an empty array when no forbidden path is touched", () => {
    assert.deepEqual(deriveForbidden(["apps/web/src/foo.ts"]), []);
  });

  it("flags apps/nextjs restoration", () => {
    const hits = deriveForbidden(["apps/nextjs/pages/index.tsx"]);
    assert.deepEqual(hits, ["restores-apps/nextjs"]);
  });

  it("flags packages/shared restoration", () => {
    const hits = deriveForbidden(["packages/shared/src/util.ts"]);
    assert.deepEqual(hits, ["restores-packages/shared"]);
  });

  it("flags both forbidden surfaces independently", () => {
    const hits = deriveForbidden([
      "apps/nextjs/pages/index.tsx",
      "packages/shared/src/util.ts",
    ]);
    assert.deepEqual(hits.sort(), ["restores-apps/nextjs", "restores-packages/shared"]);
  });

  it("does not flag unrelated apps or packages with matching prefixes", () => {
    const hits = deriveForbidden([
      "apps/web/src/foo.ts",
      "packages/contracts/src/api/run.ts",
    ]);
    assert.deepEqual(hits, []);
  });
});

describe("deriveSeams", () => {
  it("returns an empty array when no seam is touched", () => {
    assert.deepEqual(deriveSeams(["apps/web/src/foo.ts"]), []);
  });

  it("flags packages/contracts and daemon HTTP routes together", () => {
    const seams = deriveSeams([
      "packages/contracts/src/api/run.ts",
      "apps/daemon/src/runs/routes.ts",
    ]);
    assert.equal(seams.includes("packages/contracts"), true);
    assert.equal(seams.includes("daemon HTTP/SSE routes"), true);
  });

  it("flags persisted-schema changes via migration / schema / sql tokens", () => {
    assert.deepEqual(deriveSeams(["db/0001_init.sql"]), ["persisted schema"]);
  });

  it("flags root package.json and pnpm-workspace.yaml", () => {
    const seams = deriveSeams(["package.json", "pnpm-workspace.yaml"]);
    assert.equal(seams.includes("workspace layout"), true);
    assert.equal(seams.includes("root package.json"), true);
  });
});

describe("isNoisyFile", () => {
  it("flags pnpm-lock.yaml as noisy", () => {
    assert.equal(isNoisyFile("pnpm-lock.yaml"), true);
  });

  it("flags localized README variants as noisy", () => {
    assert.equal(isNoisyFile("README.zh-CN.md"), true);
  });

  it("flags generated/ output as noisy", () => {
    assert.equal(isNoisyFile("generated/types.ts"), true);
  });

  it("does not flag a regular source file", () => {
    assert.equal(isNoisyFile("apps/web/src/foo.ts"), false);
  });

  it("does not flag the canonical English README", () => {
    assert.equal(isNoisyFile("README.md"), false);
  });
});
