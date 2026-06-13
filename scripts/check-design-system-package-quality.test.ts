import assert from "node:assert/strict";
import test from "node:test";

import { DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION } from "../design-systems/_schema/manifest.schema.ts";
import type { DesignSystemProjectManifest } from "../design-systems/_schema/manifest.schema.ts";
import { evaluateDesignSystemPackageQuality } from "./check-design-system-package-quality.ts";

const baseManifest: DesignSystemProjectManifest = {
  schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
  id: "sample",
  name: "Sample",
  category: "Starter",
  source: { type: "bundled", origin: "test" },
  files: {
    design: "DESIGN.md",
    tokens: "tokens.css",
    components: "components.html",
  },
  usage: "USAGE.md",
  componentsManifest: "components.manifest.json",
  preview: {
    dir: "preview",
    pages: [
      { path: "preview/colors.html", role: "colors", title: "Colors" },
      { path: "preview/typography.html", role: "typography", title: "Typography" },
      { path: "preview/spacing.html", role: "spacing", title: "Spacing" },
    ],
  },
};

test("design-system package quality scores migrated rich packages", () => {
  const result = evaluateDesignSystemPackageQuality({
    id: "sample",
    manifest: baseManifest,
    designMd: [
      "# Sample",
      "## One",
      "## Two",
      "## Three",
      "## Four",
      "## Five",
      "## Six",
      "## Seven",
    ].join("\n"),
    tokensCss: Array.from({ length: 26 }, (_, index) => `--token-${index}: ${index}px;`).join("\n"),
    usageMd: ["## Read Order", "## Design Highlights", "## Do", "## Avoid"].join("\n\n"),
    componentsHtml: `
      <style>
        .btn { color: var(--token-1); }
        .field { color: var(--token-2); }
        .card { color: var(--token-3); }
        .badge { color: var(--token-4); }
        .link { color: var(--token-5); }
        .icon { color: var(--token-6); }
        .layout { color: var(--token-7); }
        h1 { color: var(--token-8); }
        h2 { color: var(--token-9); }
        section { color: var(--token-10); }
      </style>
      <button class="btn">Button</button>
      <label class="field"><input /></label>
      <article class="card"><span class="badge">New</span><a class="link">Link</a></article>
      <span class="icon"></span><section class="layout"><h1>Title</h1><h2>Subtitle</h2></section>
    `,
  });

  assert.equal(result.migrated, true);
  assert.equal(result.score, 100);
  assert.deepEqual(result.violations, []);
});

test("design-system package quality leaves minimal manifest projects alone", () => {
  const result = evaluateDesignSystemPackageQuality({
    id: "legacy",
    manifest: {
      schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
      id: "legacy",
      name: "Legacy",
      category: "Starter",
      source: { type: "bundled", origin: "test" },
      files: {
        design: "DESIGN.md",
        tokens: "tokens.css",
      },
    },
    designMd: "# Legacy",
    tokensCss: "",
  });

  assert.equal(result.migrated, false);
  assert.deepEqual(result.violations, []);
});
