import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import test from "node:test";

const repoRoot = resolve(import.meta.dirname, "..");
const ciWorkflowPath = join(repoRoot, ".github", "workflows", "ci.yml");

const tauriEvidencePaths = [
  "scripts/advance-tauri-migration-m4-m5.ts",
  "scripts/advance-tauri-migration-m4-m5.test.ts",
  "scripts/apply-tauri-migration-m5.ts",
  "scripts/apply-tauri-migration-m5.test.ts",
  "scripts/create-tauri-migration-bundle.ts",
  "scripts/create-tauri-migration-bundle.test.ts",
  "scripts/import-tauri-migration-bundle.ts",
  "scripts/import-tauri-migration-bundle.test.ts",
  "scripts/tauri-migration-inventory.ts",
  "scripts/tauri-migration-inventory.test.ts",
  "scripts/tauri-migration-policy.ts",
  "scripts/tauri-migration-policy.test.ts",
  "scripts/tauri-migration-status.ts",
  "scripts/tauri-migration-status.test.ts",
  "scripts/verify-tauri-migration-handoff.ts",
  "scripts/verify-tauri-migration-handoff.test.ts",
  "scripts/verify-tauri-migration-remote.ts",
  "scripts/verify-tauri-migration-remote.test.ts",
  "scripts/verify-tauri-platform-gates.ts",
  "scripts/verify-tauri-platform-gates.test.ts",
] as const;

test("Tauri migration evidence scripts trigger package smoke and tools-pack tests", async () => {
  const workflow = await readFile(ciWorkflowPath, "utf8");
  const packagingScope = workflow.match(/patterns=\(\n(?<body>[\s\S]*?)\n\s*\)/)?.groups?.body;
  assert.ok(packagingScope, "ci.yml must define the packaged_changes patterns array");

  const toolsPackScope = workflow.match(
    /if \[\[ "\$file" == "e2e\/lib\/vitest\/packaged-report\.ts"[\s\S]*?\]\]; then\n\s+tools_pack_tests_required=true/,
  )?.[0];
  assert.ok(toolsPackScope, "ci.yml must define the explicit tools_pack_tests_required condition");

  for (const filePath of tauriEvidencePaths) {
    assert.match(packagingScope, quotedPathPattern(filePath), `${filePath} must set packaged_changes.required=true`);
    assert.match(toolsPackScope, quotedPathPattern(filePath), `${filePath} must set tools_pack_tests_required=true`);
  }
});

function quotedPathPattern(filePath: string): RegExp {
  return new RegExp(`"${escapeRegExp(filePath)}"`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
