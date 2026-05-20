import assert from "node:assert/strict";
import test from "node:test";

import {
  DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
  type DesignSystemProjectManifest,
  validateDesignSystemProjectManifest,
} from "../design-systems/_schema/manifest.schema.ts";
import { validateManifestSemantics } from "./check-design-system-manifests.ts";

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

test("design-system project manifest schema accepts import-project optional indexes", () => {
  const result = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "cherry-studio",
    name: "Cherry Studio",
    category: "AI & LLM",
    source: {
      type: "github",
      url: "https://github.com/cherryhq/cherry-studio",
      branch: "main",
      commit: "abc123",
      importedAt: "2026-05-19T00:00:00.000Z",
    },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
      components: "components.html",
    },
    assetsDir: "assets",
    previewDir: "preview",
    usage: "USAGE.md",
    componentsManifest: "components.manifest.json",
    importMode: "hybrid",
    craft: {
      applies: ["color"],
      suggested: ["accessibility-baseline"],
      exemptions: [],
    },
    fonts: [
      { family: "Ubuntu", weight: 400, file: "fonts/ubuntu/Ubuntu-Regular.ttf" },
      { family: "Ubuntu", weight: 500, style: "normal", file: "fonts/ubuntu/Ubuntu-Medium.ttf" },
    ],
    preview: {
      dir: "preview",
      pages: [
        { path: "preview/colors.html", role: "colors", title: "Colors" },
        { path: "preview/app.html", role: "app" },
      ],
    },
    sourceFiles: {
      scanned: "source/scanned-files.json",
      evidence: "source/evidence.md",
      tokens: "source/tokens.source.json",
      snippets: "source/snippets/INDEX.json",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.manifest.usage, "USAGE.md");
    assert.equal(result.manifest.componentsManifest, "components.manifest.json");
    assert.equal(result.manifest.importMode, "hybrid");
    assert.equal(result.manifest.preview?.pages.length, 2);
  }
});

test("design-system project manifest schema requires craft slug format", () => {
  const result = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "cherry-studio",
    name: "Cherry Studio",
    category: "AI & LLM",
    source: { type: "local", path: "/tmp/cherry-studio" },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
    },
    craft: {
      applies: ["Color"],
      suggested: ["accessibility baseline"],
      exemptions: [""],
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    const errors = result.errors.join("\n");
    assert.match(errors, /\$\.craft\.applies\[0\]/);
    assert.match(errors, /\$\.craft\.suggested\[0\]/);
    assert.match(errors, /\$\.craft\.exemptions\[0\]/);
  }
});

test("design-system manifest semantics connect craft and importMode declarations to known evidence", () => {
  const manifest: DesignSystemProjectManifest = {
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "cherry-studio",
    name: "Cherry Studio",
    category: "AI & LLM",
    source: { type: "local", path: "/tmp/cherry-studio" },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
    },
    importMode: "verbatim",
    craft: {
      applies: ["color", "missing-craft"],
      suggested: [],
      exemptions: ["color"],
    },
    sourceFiles: {
      scanned: "source/scanned-files.json",
    },
  };
  const violations: string[] = [];

  validateManifestSemantics(violations, "design-systems/cherry-studio/manifest.json", manifest, new Set(["color"]));

  assert.deepEqual(violations, [
    'design-systems/cherry-studio/manifest.json: $.craft.applies references unknown craft "missing-craft"',
    'design-systems/cherry-studio/manifest.json: craft "color" cannot be both applied and exempted',
    "design-systems/cherry-studio/manifest.json: verbatim imports must declare sourceFiles.tokens",
    "design-systems/cherry-studio/manifest.json: verbatim imports must declare sourceFiles.snippets",
  ]);
});

test("design-system project manifest schema rejects unsafe import-project paths", () => {
  const result = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "cherry-studio",
    name: "Cherry Studio",
    category: "AI & LLM",
    source: { type: "local", path: "/tmp/cherry-studio" },
    files: {
      design: "DESIGN.md",
      tokens: "tokens.css",
    },
    usage: "../USAGE.md",
    componentsManifest: "/tmp/components.manifest.json",
    fonts: [{ family: "Ubuntu", file: "fonts\\Ubuntu-Regular.ttf" }],
    preview: {
      dir: "preview",
      pages: [{ path: "preview//colors.html" }],
    },
    sourceFiles: {
      scanned: "source/../scanned-files.json",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    const errors = result.errors.join("\n");
    assert.match(errors, /\$\.usage/);
    assert.match(errors, /\$\.componentsManifest/);
    assert.match(errors, /\$\.fonts\[0\]\.file/);
    assert.match(errors, /\$\.preview\.pages\[0\]\.path/);
    assert.match(errors, /\$\.sourceFiles\.scanned/);
  }
});
