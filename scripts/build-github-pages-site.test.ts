import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";

import { buildGitHubPagesSite } from "./build-github-pages-site.ts";

function writeFixtureRepo(): { outDir: string; repo: string } {
  const repo = mkdtempSync(path.join(tmpdir(), "od-pages-repo-"));
  const outDir = path.join(repo, ".tmp", "pages-site");

  mkdirSync(path.join(repo, "catalog"), { recursive: true });
  mkdirSync(path.join(repo, "design-templates", "dashboard"), { recursive: true });
  mkdirSync(path.join(repo, "design-systems", "quiet-saas"), { recursive: true });
  mkdirSync(path.join(repo, "skills", "visual-skill"), { recursive: true });
  mkdirSync(path.join(repo, "outputs", "local-only"), { recursive: true });

  writeFileSync(
    path.join(repo, "overview.html"),
    [
      "<!doctype html>",
      "<html>",
      "<body>",
      '<iframe src="design-templates/dashboard/example.html"></iframe>',
      '<iframe src="design-systems/quiet-saas/components.html"></iframe>',
      '<iframe src="skills/visual-skill/example.html"></iframe>',
      "</body>",
      "</html>",
    ].join("\n"),
  );
  writeFileSync(path.join(repo, "catalog", "assets.json"), "{}\n");
  writeFileSync(path.join(repo, "design-templates", "dashboard", "example.html"), "<main>Dashboard</main>\n");
  writeFileSync(path.join(repo, "design-systems", "quiet-saas", "components.html"), "<main>System</main>\n");
  writeFileSync(path.join(repo, "skills", "visual-skill", "example.html"), "<main>Skill</main>\n");
  writeFileSync(path.join(repo, "outputs", "local-only", "secret.txt"), "local only\n");

  return { outDir, repo };
}

test("buildGitHubPagesSite packages overview and local iframe dependencies", async () => {
  const { outDir, repo } = writeFixtureRepo();

  const result = await buildGitHubPagesSite({ outDir, repoRoot: repo });

  assert.equal(result.outDir, outDir);
  assert.equal(result.copiedRoots.sort().join(","), "catalog,design-systems,design-templates,skills");
  assert.equal(existsSync(path.join(outDir, "index.html")), true);
  assert.equal(existsSync(path.join(outDir, "overview.html")), true);
  assert.equal(existsSync(path.join(outDir, "design-templates", "dashboard", "example.html")), true);
  assert.equal(existsSync(path.join(outDir, "design-systems", "quiet-saas", "components.html")), true);
  assert.equal(existsSync(path.join(outDir, "skills", "visual-skill", "example.html")), true);
  assert.equal(existsSync(path.join(outDir, "outputs", "local-only", "secret.txt")), false);
  assert.match(readFileSync(path.join(outDir, "index.html"), "utf8"), /design-templates\/dashboard\/example\.html/);
});
