import { readdir } from "node:fs/promises";
import path from "node:path";

const repoRoot = path.resolve(import.meta.dirname, "..");
const residualExtensions = new Set([".js", ".mjs", ".cjs"]);

const skippedDirectories = new Set([
  ".agents",
  ".claude",
  ".claude-sessions",
  ".codex",
  ".cursor",
  ".git",
  ".od",
  ".od-e2e",
  ".opencode",
  ".task",
  ".vite",
  "node_modules",
]);

const allowedPathPrefixes = [
  "apps/daemon/dist/",
  "apps/web/.next/",
  "apps/web/out/",
  "generated/",
  "e2e/playwright-report/",
  "e2e/reports/html/",
  "e2e/reports/playwright-html-report/",
  "e2e/reports/test-results/",
  "test-results/",
  "vendor/",
];

function toRepositoryPath(filePath: string): string {
  return path.relative(repoRoot, filePath).split(path.sep).join("/");
}

function isAllowedOutputPath(repositoryPath: string): boolean {
  return allowedPathPrefixes.some((prefix) => repositoryPath.startsWith(prefix));
}

async function collectResidualJavaScript(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const residualFiles: string[] = [];

  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    const repositoryPath = toRepositoryPath(fullPath);

    if (entry.isDirectory()) {
      if (skippedDirectories.has(entry.name) || isAllowedOutputPath(`${repositoryPath}/`)) {
        continue;
      }

      residualFiles.push(...(await collectResidualJavaScript(fullPath)));
      continue;
    }

    if (!entry.isFile() || !residualExtensions.has(path.extname(entry.name))) {
      continue;
    }

    if (isAllowedOutputPath(repositoryPath)) {
      continue;
    }

    residualFiles.push(repositoryPath);
  }

  return residualFiles;
}

const residualFiles = await collectResidualJavaScript(repoRoot);

if (residualFiles.length > 0) {
  console.error("Residual project-owned JavaScript files found:");
  for (const filePath of residualFiles) {
    console.error(`- ${filePath}`);
  }
  console.error("Convert these files to TypeScript or add a documented generated/vendor/output allowlist entry.");
  process.exitCode = 1;
} else {
  console.log("Residual JavaScript check passed: project-owned code is TypeScript-only.");
}
