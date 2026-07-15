import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
  type DesignSystemProjectManifest,
  validateDesignSystemProjectManifest,
} from "../design-systems/_schema/manifest.schema.ts";
import { TOKEN_SCHEMA } from "../design-systems/_schema/tokens.schema.ts";
import {
  renderDesignTokensJson,
  renderTailwindV4Css,
  type DerivedDesignTokenBinding,
} from "../packages/contracts/src/design-systems/derived-token-outputs.ts";
import { extractComponentsManifest } from "../packages/contracts/src/design-systems/components-manifest.ts";
import {
  validateComponentsManifestCache,
  validateDesignTokensJson,
  validateManifestSemantics,
  validateTailwindV4Css,
} from "./check-design-system-manifests.ts";

const REPORT_PATH = "source/token-contract.report.json";

function writeDerivedTokenFixture(root: string): void {
  const bindings = TOKEN_SCHEMA.map((spec, index): DerivedDesignTokenBinding => ({
    name: spec.name,
    layer: spec.layer,
    value: tokenValueForIndex(index),
    confidence: "high",
    reason: `Fixture source matched ${spec.name}.`,
    sources: [`tokens.css:${index + 2}`],
    sourceName: spec.name,
  }));
  const report = {
    schemaVersion: 1,
    contract: "TOKEN_SCHEMA",
    generatedAt: "2026-05-19T00:00:00.000Z",
    summary: {
      totalTokens: bindings.length,
      declaredTokens: bindings.length,
      sourceBackedTokens: bindings.length,
      sourceBackedA1: bindings.length,
      requiredA1: bindings.length,
      fallbackTokens: 0,
      aliasTokens: 0,
      score: 100,
      grade: "excellent",
      recommendRebuild: false,
    },
    tokens: bindings,
  };
  mkdirSync(path.join(root, "source"), { recursive: true });
  writeFileSync(path.join(root, "tokens.css"), `:root {\n${bindings.map((binding) => `  ${binding.name}: ${binding.value};`).join("\n")}\n}\n`);
  writeFileSync(path.join(root, REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
  writeFileSync(path.join(root, "design-tokens.json"), renderDesignTokensJson({ bindings, report }));
  writeFileSync(path.join(root, "tailwind-v4.css"), renderTailwindV4Css(bindings));
}

function tokenValueForIndex(index: number): string {
  const token = TOKEN_SCHEMA[index]!;
  if (token.name.startsWith("--font-")) return '"Inter", sans-serif';
  if (token.name.startsWith("--leading-")) return "1.4";
  if (token.name.startsWith("--tracking-")) return "0";
  if (token.name.startsWith("--motion-")) return "150ms";
  if (token.name === "--ease-standard") return "cubic-bezier(0.2, 0, 0, 1)";
  if (token.name.startsWith("--elev-")) return "none";
  if (token.name === "--focus-ring") return "0 0 0 2px #111111";
  if (
    token.name.startsWith("--text-")
    || token.name.startsWith("--space-")
    || token.name.startsWith("--section-y-")
    || token.name.startsWith("--radius-")
    || token.name.startsWith("--container-")
  ) {
    return `${index + 1}px`;
  }
  return `#${(index + 1).toString(16).padStart(6, "0").slice(0, 6)}`;
}

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
      designTokens: "tokens.json",
      tailwind: "tailwind.css",
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
    assert.match(errors, /\$\.files\.designTokens/);
    assert.match(errors, /\$\.files\.tailwind/);
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
      designTokens: "design-tokens.json",
      tailwind: "tailwind-v4.css",
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
      report: "source/token-contract.report.json",
      snippets: "source/snippets/INDEX.json",
    },
  });

  assert.equal(result.ok, true);
  if (result.ok) {
    assert.equal(result.manifest.usage, "USAGE.md");
    assert.equal(result.manifest.files.designTokens, "design-tokens.json");
    assert.equal(result.manifest.files.tailwind, "tailwind-v4.css");
    assert.equal(result.manifest.componentsManifest, "components.manifest.json");
    assert.equal(result.manifest.importMode, "hybrid");
    assert.equal(result.manifest.preview?.pages.length, 2);
    assert.equal(result.manifest.sourceFiles?.report, "source/token-contract.report.json");
  }
});

test("design-system design tokens guard rejects stale derived JSON", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-design-tokens-guard-"));
  try {
    writeDerivedTokenFixture(root);
    const okViolations: string[] = [];
    await validateDesignTokensJson(okViolations, "design-systems/test/manifest.json", root, "tokens.css", "design-tokens.json", REPORT_PATH);
    assert.deepEqual(okViolations, []);

    const stale = JSON.parse(readFileSync(path.join(root, "design-tokens.json"), "utf8")) as {
      tokens: Array<{ value: string }>;
    };
    stale.tokens[0]!.value = "#abcdef";
    writeFileSync(path.join(root, "design-tokens.json"), `${JSON.stringify(stale, null, 2)}\n`);
    const violations: string[] = [];
    await validateDesignTokensJson(violations, "design-systems/test/manifest.json", root, "tokens.css", "design-tokens.json", REPORT_PATH);
    assert.deepEqual(violations, [
      "design-systems/test/manifest.json: design-tokens.json is stale; regenerate it from source/token-contract.report.json",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system design tokens guard rejects stale token source line references", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-design-token-source-guard-"));
  try {
    writeDerivedTokenFixture(root);
    const report = JSON.parse(readFileSync(path.join(root, REPORT_PATH), "utf8")) as {
      generatedAt: string;
      summary: unknown;
      tokens: DerivedDesignTokenBinding[];
    };
    report.tokens[0] = {
      ...report.tokens[0]!,
      sources: ["tokens.css:1"],
    };
    writeFileSync(path.join(root, REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(path.join(root, "design-tokens.json"), renderDesignTokensJson({
      bindings: report.tokens,
      report,
    }));

    const violations: string[] = [];
    await validateDesignTokensJson(violations, "design-systems/test/manifest.json", root, "tokens.css", "design-tokens.json", REPORT_PATH);
    assert.deepEqual(violations, [
      "design-systems/test/manifest.json: source/token-contract.report.json token --bg source tokens.css:1 must point to tokens.css:2",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system design tokens guard rejects prefix token source line references", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-design-tokens-prefix-guard-"));
  try {
    writeDerivedTokenFixture(root);
    const report = JSON.parse(readFileSync(path.join(root, REPORT_PATH), "utf8")) as {
      generatedAt: string;
      summary: unknown;
      tokens: DerivedDesignTokenBinding[];
    };
    const fgBinding = report.tokens.find((token) => token.name === "--fg");
    assert.ok(fgBinding);
    fgBinding.sources = ["tokens.css:6"];
    writeFileSync(path.join(root, REPORT_PATH), `${JSON.stringify(report, null, 2)}\n`);
    writeFileSync(path.join(root, "design-tokens.json"), renderDesignTokensJson({
      bindings: report.tokens,
      report,
    }));

    const violations: string[] = [];
    await validateDesignTokensJson(violations, "design-systems/test/manifest.json", root, "tokens.css", "design-tokens.json", REPORT_PATH);
    assert.deepEqual(violations, [
      "design-systems/test/manifest.json: source/token-contract.report.json token --fg source tokens.css:6 must point to tokens.css:5",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system design tokens guard does not flag CRLF-normalized design-tokens.json as stale", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-design-tokens-crlf-"));
  try {
    writeDerivedTokenFixture(root);
    const filePath = path.join(root, "design-tokens.json");
    writeFileSync(filePath, readFileSync(filePath, "utf8").replace(/\n/g, "\r\n"));

    const violations: string[] = [];
    await validateDesignTokensJson(violations, "design-systems/test/manifest.json", root, "tokens.css", "design-tokens.json", REPORT_PATH);
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system design tokens guard still rejects genuinely stale content when the file is CRLF", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-design-tokens-crlf-stale-"));
  try {
    writeDerivedTokenFixture(root);
    const filePath = path.join(root, "design-tokens.json");
    const stale = JSON.parse(readFileSync(filePath, "utf8")) as {
      tokens: Array<{ value: string }>;
    };
    stale.tokens[0]!.value = "#abcdef";
    const staleContent = `${JSON.stringify(stale, null, 2)}\n`;
    writeFileSync(filePath, staleContent.replace(/\n/g, "\r\n"));

    const violations: string[] = [];
    await validateDesignTokensJson(violations, "design-systems/test/manifest.json", root, "tokens.css", "design-tokens.json", REPORT_PATH);
    assert.deepEqual(violations, [
      "design-systems/test/manifest.json: design-tokens.json is stale; regenerate it from source/token-contract.report.json",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system tailwind v4 guard rejects swapped canonical mappings", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-tailwind-guard-"));
  try {
    writeDerivedTokenFixture(root);
    const okViolations: string[] = [];
    await validateTailwindV4Css(okViolations, "design-systems/test/manifest.json", root, "tokens.css", "tailwind-v4.css");
    assert.deepEqual(okViolations, []);

    const filePath = path.join(root, "tailwind-v4.css");
    writeFileSync(
      filePath,
      readFileSync(filePath, "utf8").replace("  --color-accent: var(--accent);", "  --color-accent: var(--bg);"),
    );
    const violations: string[] = [];
    await validateTailwindV4Css(violations, "design-systems/test/manifest.json", root, "tokens.css", "tailwind-v4.css");
    assert.deepEqual(violations, [
      "design-systems/test/manifest.json: tailwind-v4.css is stale; regenerate it from tokens.css",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system tailwind v4 guard does not flag CRLF-normalized tailwind-v4.css as stale", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-tailwind-crlf-"));
  try {
    writeDerivedTokenFixture(root);
    const filePath = path.join(root, "tailwind-v4.css");
    writeFileSync(filePath, readFileSync(filePath, "utf8").replace(/\n/g, "\r\n"));

    const violations: string[] = [];
    await validateTailwindV4Css(violations, "design-systems/test/manifest.json", root, "tokens.css", "tailwind-v4.css");
    assert.deepEqual(violations, []);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system tailwind v4 guard still rejects genuinely stale content when the file is CRLF", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-tailwind-crlf-stale-"));
  try {
    writeDerivedTokenFixture(root);
    const filePath = path.join(root, "tailwind-v4.css");
    const staleContent = readFileSync(filePath, "utf8").replace(
      "  --color-accent: var(--accent);",
      "  --color-accent: var(--bg);",
    );
    writeFileSync(filePath, staleContent.replace(/\n/g, "\r\n"));

    const violations: string[] = [];
    await validateTailwindV4Css(violations, "design-systems/test/manifest.json", root, "tokens.css", "tailwind-v4.css");
    assert.deepEqual(violations, [
      "design-systems/test/manifest.json: tailwind-v4.css is stale; regenerate it from tokens.css",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("design-system components manifest guard rejects undeclared token references", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-components-manifest-guard-"));
  try {
    const fixtureHtml = [
      "<!doctype html>",
      "<style>",
      ".btn { color: var(--accent); border-color: var(--missing-token); }",
      "</style>",
      '<button class="btn">Continue</button>',
    ].join("\n");
    const tokensCss = ":root {\n  --accent: #111111;\n}\n";
    writeFileSync(path.join(root, "components.html"), fixtureHtml);
    writeFileSync(path.join(root, "tokens.css"), tokensCss);
    writeFileSync(
      path.join(root, "components.manifest.json"),
      `${JSON.stringify(extractComponentsManifest({ brandId: "test", fixtureHtml, tokensCss }), null, 2)}\n`,
    );

    const violations: string[] = [];
    await validateComponentsManifestCache(
      violations,
      "design-systems/test/manifest.json",
      root,
      "test",
      "components.manifest.json",
    );

    assert.equal(violations.length, 1);
    assert.match(violations[0]!, /references undeclared component token\(s\): --missing-token$/);
  } finally {
    rmSync(root, { recursive: true, force: true });
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
      report: "../token-contract.report.json",
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
    assert.match(errors, /\$\.sourceFiles\.report/);
  }
});
