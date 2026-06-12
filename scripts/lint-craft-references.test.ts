import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  collectCraftReferences,
  extractCraftRequiresSlugs,
  findCraftReferenceViolations,
} from "./lint-craft-references.ts";

test("craft reference parser reads only od.craft.requires and preserves malformed entries", () => {
  const inlineSource = `---
od:
  design_system:
    requires: true
  craft:
    requires: [typography, typo_graphy, 42]
---
`;
  const blockSource = `---
od:
  craft:
    requires:
      - form-validation
      - state_coverage
---
`;

  assert.deepEqual(extractCraftRequiresSlugs(inlineSource), ["typography", "typo_graphy", 42]);
  assert.deepEqual(extractCraftRequiresSlugs(blockSource), ["form-validation", "state_coverage"]);
});

test("craft reference violations allow present and planned slugs while reporting typos", () => {
  const violations = findCraftReferenceViolations(
    [
      { manifestPath: "skills/example/SKILL.md", slug: "typography" },
      { manifestPath: "skills/example/SKILL.md", slug: "motion-discipline" },
      { manifestPath: "skills/example/SKILL.md", slug: "typograpy" },
      { manifestPath: "skills/example/SKILL.md", slug: "typo_graphy" },
      { manifestPath: "skills/example/SKILL.md", slug: 42 },
    ],
    new Set(["typography"]),
    new Set(["motion-discipline"]),
  );

  assert.deepEqual(violations, [
    {
      kind: "unresolved",
      manifestPath: "skills/example/SKILL.md",
      slug: "typograpy",
    },
    {
      kind: "invalid",
      manifestPath: "skills/example/SKILL.md",
      slug: "typo_graphy",
    },
    {
      kind: "invalid",
      manifestPath: "skills/example/SKILL.md",
      slug: 42,
    },
  ]);
});

test("bad bundled scenario manifest craft references are reported", async () => {
  const fixtureRoot = fileURLToPath(new URL("./fixtures/lint-craft-references", import.meta.url));
  const references = await collectCraftReferences(fixtureRoot);

  assert.deepEqual(findCraftReferenceViolations(references, new Set(), new Set()), [
    {
      kind: "unresolved",
      manifestPath: "plugins/_official/scenarios/bad-scenario/open-design.json",
      slug: "typograpy",
    },
  ]);
});
