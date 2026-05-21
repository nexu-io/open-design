import assert from "node:assert/strict";
import test from "node:test";

import {
  extractCraftRequiresSlugs,
  findInvalidCraftReferences,
} from "./lint-craft-references.ts";

test("craft reference parser preserves invalid inline slugs for lint failures", () => {
  const source = `---
craft:
  requires: [typography, typo_graphy]
---
`;

  assert.deepEqual(extractCraftRequiresSlugs(source), ["typography", "typo_graphy"]);
  assert.deepEqual(
    findInvalidCraftReferences([
      { manifestPath: "skills/example/SKILL.md", slug: "typography" },
      { manifestPath: "skills/example/SKILL.md", slug: "typo_graphy" },
    ]),
    [{ manifestPath: "skills/example/SKILL.md", slug: "typo_graphy" }],
  );
});

test("craft reference parser preserves invalid block-list slugs for lint failures", () => {
  const source = `---
craft:
  requires:
    - form-validation
    - state_coverage
---
`;

  assert.deepEqual(extractCraftRequiresSlugs(source), ["form-validation", "state_coverage"]);
  assert.deepEqual(
    findInvalidCraftReferences([
      { manifestPath: "skills/example/SKILL.md", slug: "form-validation" },
      { manifestPath: "skills/example/SKILL.md", slug: "state_coverage" },
    ]),
    [{ manifestPath: "skills/example/SKILL.md", slug: "state_coverage" }],
  );
});
