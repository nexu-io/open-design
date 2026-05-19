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
  "scripts/continue-tauri-migration.ts",
  "scripts/create-tauri-migration-bundle.ts",
  "scripts/create-tauri-migration-bundle.test.ts",
  "scripts/download-tauri-m4-reports.ts",
  "scripts/download-tauri-m4-reports.test.ts",
  "scripts/import-tauri-migration-bundle.ts",
  "scripts/import-tauri-migration-bundle.test.ts",
  "scripts/package-tauri-migration-handoff.ts",
  "scripts/package-tauri-migration-handoff.test.ts",
  "scripts/push-tauri-migration-handoff.ts",
  "scripts/push-tauri-migration-handoff.test.ts",
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

test("Tauri migration handoff can manually dispatch native CI", async () => {
  const workflow = await readFile(ciWorkflowPath, "utf8");

  assert.match(workflow, /^\s+workflow_dispatch:\s*$/m, "ci.yml must keep workflow_dispatch for handoff CI runs");
  assert.match(
    workflow,
    /else\n\s+required=true\n\s+daemon_tests_required=true\n\s+web_tests_required=true\n\s+tools_dev_tests_required=true\n\s+tools_pack_tests_required=true\n\s+fi/m,
    "workflow_dispatch must force the packaged scope so Windows/Linux Tauri smoke jobs run",
  );
  assert.match(workflow, /^\s+packaged_smoke_tauri_win:\s*$/m, "ci.yml must define the Windows Tauri smoke job");
  assert.match(workflow, /^\s+packaged_smoke_tauri_linux:\s*$/m, "ci.yml must define the Linux Tauri smoke job");
  assert.match(
    workflow,
    /^\s+if: \$\{\{ needs\.packaged_changes\.outputs\.required == 'true' \}\}\s*$/m,
    "Tauri smoke jobs must remain tied to packaged_changes.required",
  );
});

function quotedPathPattern(filePath: string): RegExp {
  return new RegExp(`"${escapeRegExp(filePath)}"`);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
