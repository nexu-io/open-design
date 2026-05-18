import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
  validateDesignSystemProjectManifest,
} from "../design-systems/_schema/manifest.schema.ts";

test("design-system project manifest schema accepts the v1 minimum shape", () => {
  const result = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "cherry-studio",
    name: "Cherry Studio",
    category: "Imported",
    description: "Extracted from an existing project.",
    source: {
      type: "github",
      url: "https://github.com/cherryhq/cherry-studio",
      branch: "main",
      commit: "abc123",
      importedAt: "2026-05-18T00:00:00.000Z",
    },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.manifest.files.design, "DESIGN.md");
    assert.equal(result.manifest.files.tokens, "tokens.css");
    assert.equal(result.manifest.files.components, undefined);
  }
});

test("design-system project manifest schema keeps components.html optional but fixed when declared", () => {
  const accepted = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "default",
    name: "Neutral Modern",
    category: "Starter",
    source: { type: "bundled", origin: "hand-authored" },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
      components: "components.html",
    },
  });
  assert.equal(accepted.ok, true);

  const rejected = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "default",
    name: "Neutral Modern",
    category: "Starter",
    source: { type: "bundled" },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
      components: "preview/components.html",
    },
  });
  assert.equal(rejected.ok, false);
  if (!rejected.ok) {
    assert.match(rejected.errors.join("\n"), /\$\.files\.components/);
  }
});

test("design-system project manifest schema rejects path drift and unknown keys", () => {
  const result = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "Bad Slug",
    name: "Bad",
    category: "Imported",
    source: {
      type: "local",
      path: "/tmp/project",
      unexpected: true,
    },
    files: {
      design: "design.md",
      tokens: "colors.css",
    },
    extra: "field",
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    const errors = result.errors.join("\n");
    assert.match(errors, /\$\.id/);
    assert.match(errors, /\$\.source\.unexpected/);
    assert.match(errors, /\$\.files\.design/);
    assert.match(errors, /\$\.files\.tokens/);
    assert.match(errors, /\$\.extra/);
  }
});
