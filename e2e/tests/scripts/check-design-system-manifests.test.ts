import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "vitest";

import {
  DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
  type DesignSystemProjectManifest,
  validateDesignSystemProjectManifest,
} from "../../../design-systems/_schema/manifest.schema.ts";
import { TOKEN_SCHEMA } from "../../../design-systems/_schema/tokens.schema.ts";
import {
  DESIGN_SYSTEM_COMPONENTS_SCHEMA_VERSION,
  DESIGN_SYSTEM_COMPONENT_SCHEMA_VERSION,
  DESIGN_SYSTEM_FALLBACK_SCHEMA_VERSION,
  DESIGN_SYSTEM_INTENT_MAP_SCHEMA_VERSION,
  DESIGN_SYSTEM_LINT_SCHEMA_VERSION,
  DesignSystemComponentDefinitionSchema,
  DesignSystemComponentsIndexSchema,
  DesignSystemFallbackRulesSchema,
  DesignSystemIntentMapSchema,
  DesignSystemLintRulesSchema,
  validateDesignSystemRuntimeReferences,
  type LoadedDesignSystemComponent,
} from "../../../design-systems/_schema/runtime.schema.ts";
import {
  renderDesignTokensJson,
  renderTailwindV4Css,
  type DerivedDesignTokenBinding,
} from "../../../packages/contracts/src/design-systems/derived-token-outputs.ts";
import { extractComponentsManifest } from "../../../packages/contracts/src/design-systems/components-manifest.ts";
import {
  validateComponentsManifestCache,
  validateDesignTokensJson,
  validateDesignSystemRuntimeContract,
  validateManifestSemantics,
  validateTailwindV4Css,
} from "../../../scripts/check-design-system-manifests.ts";

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
    runtime: {
      components: "manifests/components.json",
      intents: "manifests/intent-map.json",
      lint: "rules/lint.json",
      fallback: "rules/fallback.json",
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
    assert.equal(result.manifest.runtime?.intents, "manifests/intent-map.json");
  }
});

test("design-system project manifest schema rejects partial and unsafe runtime paths", () => {
  const result = validateDesignSystemProjectManifest({
    schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
    id: "runtime-test",
    name: "Runtime test",
    category: "Test",
    source: { type: "bundled" },
    files: { design: "DESIGN.md", tokens: "tokens.css" },
    runtime: {
      components: "../components.json",
      intents: "manifests/intent-map.json",
      lint: "rules/lint.json",
    },
  });

  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(result.errors.join("\n"), /\$\.runtime\.components/);
    assert.match(result.errors.join("\n"), /\$\.runtime\.fallback/);
  }
});

test("design-system runtime guard validates cross-file component references", async () => {
  const root = mkdtempSync(path.join(os.tmpdir(), "od-design-system-runtime-"));
  try {
    mkdirSync(path.join(root, "manifests"), { recursive: true });
    mkdirSync(path.join(root, "components", "Button"), { recursive: true });
    mkdirSync(path.join(root, "rules"), { recursive: true });
    writeFileSync(path.join(root, "manifests", "components.json"), JSON.stringify({
      schemaVersion: DESIGN_SYSTEM_COMPONENTS_SCHEMA_VERSION,
      components: [{ id: "Button", path: "components/Button/component.json" }],
    }));
    writeFileSync(path.join(root, "components", "Button", "component.json"), JSON.stringify({
      schemaVersion: DESIGN_SYSTEM_COMPONENT_SCHEMA_VERSION,
      id: "Button",
      name: "Button",
      selectors: [".button"],
      variants: { primary: { selectors: [".button--primary"] } },
      properties: { label: { type: "string" } },
      states: { focus: { selectors: [".button:focus-visible"] } },
      implementation: "<button>{{label}}</button>",
    }));
    writeFileSync(path.join(root, "manifests", "intent-map.json"), JSON.stringify({
      schemaVersion: DESIGN_SYSTEM_INTENT_MAP_SCHEMA_VERSION,
      mappings: [{
        intent: "account.settings.save",
        component: "Button",
        variant: "missing",
        properties: { label: "Save" },
        states: ["focus"],
      }],
    }));
    writeFileSync(path.join(root, "rules", "lint.json"), JSON.stringify({
      schemaVersion: DESIGN_SYSTEM_LINT_SCHEMA_VERSION,
      requireMappedComponentReuse: true,
      requireTokenReferences: true,
      forbidUnauthorizedColorLiteralsOutsideTokenDefinitions: true,
      requireDeclaredStates: true,
    }));
    writeFileSync(path.join(root, "rules", "fallback.json"), JSON.stringify({
      schemaVersion: DESIGN_SYSTEM_FALLBACK_SCHEMA_VERSION,
      noMatch: { action: "request-human-confirmation", allowInventComponent: false },
      multipleMatches: { action: "prefer-highest-priority", allowInventComponent: false },
    }));
    const manifest: DesignSystemProjectManifest = {
      schemaVersion: DESIGN_SYSTEM_PROJECT_SCHEMA_VERSION,
      id: "runtime-test",
      name: "Runtime test",
      category: "Test",
      source: { type: "bundled" },
      files: { design: "DESIGN.md", tokens: "tokens.css" },
      runtime: {
        components: "manifests/components.json",
        intents: "manifests/intent-map.json",
        lint: "rules/lint.json",
        fallback: "rules/fallback.json",
      },
    };
    const violations: string[] = [];

    await validateDesignSystemRuntimeContract(
      violations,
      "design-systems/runtime-test/manifest.json",
      root,
      manifest,
    );

    assert.deepEqual(violations, [
      "design-systems/runtime-test/manifest.json: intent mapping account.settings.save at index 0 references unknown variant missing on Button",
    ]);
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("bundled DS 3.0 regression packages cover the three-task intent set and no-match gate", () => {
  const requiredMappedIntents = [
    "account.settings.section",
    "account.settings.field",
    "account.settings.save",
    "account.settings.cancel",
    "workspace.delete.dialog",
    "workspace.delete.name_field",
    "workspace.delete.warning",
    "workspace.delete.cancel",
    "team.directory.surface",
    "team.directory.search",
    "team.directory.invite",
    "team.member.row",
    "team.member.status",
    "team.member.action",
  ];

  for (const designSystemId of ["hud", "webflow", "uber"]) {
    const root = path.resolve(import.meta.dirname, "../../../design-systems", designSystemId);
    const manifestResult = validateDesignSystemProjectManifest(
      JSON.parse(readFileSync(path.join(root, "manifest.json"), "utf8")),
    );
    assert.equal(manifestResult.ok, true, `${designSystemId} manifest must be valid`);
    if (!manifestResult.ok) continue;
    const runtime = manifestResult.manifest.runtime;
    assert.ok(runtime, `${designSystemId} must declare a runtime`);

    const componentsIndex = DesignSystemComponentsIndexSchema.parse(
      JSON.parse(readFileSync(path.join(root, runtime.components), "utf8")),
    );
    const components: LoadedDesignSystemComponent[] = componentsIndex.components.map((entry) => ({
      path: entry.path,
      definition: DesignSystemComponentDefinitionSchema.parse(
        JSON.parse(readFileSync(path.join(root, entry.path), "utf8")),
      ),
    }));
    const intentMap = DesignSystemIntentMapSchema.parse(
      JSON.parse(readFileSync(path.join(root, runtime.intents), "utf8")),
    );
    DesignSystemLintRulesSchema.parse(
      JSON.parse(readFileSync(path.join(root, runtime.lint), "utf8")),
    );
    const fallback = DesignSystemFallbackRulesSchema.parse(
      JSON.parse(readFileSync(path.join(root, runtime.fallback), "utf8")),
    );

    assert.deepEqual(validateDesignSystemRuntimeReferences({
      componentsIndex,
      components,
      intentMap,
    }), []);
    const mappedIntents = new Set(intentMap.mappings.map((mapping) => mapping.intent));
    for (const intent of requiredMappedIntents) {
      assert.equal(mappedIntents.has(intent), true, `${designSystemId} must map ${intent}`);
    }
    assert.equal(mappedIntents.has("workspace.delete.confirm"), false);
    assert.deepEqual(fallback.noMatch, {
      action: "request-human-confirmation",
      allowInventComponent: false,
      outputMarker: 'data-ds-fallback="no-match"',
    });
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
