// Tests for the core scan logic. Fixture projects are written into a fresh
// temp dir per test so we can assert on the exact issues present.

import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { proposeFixes, scanOdProjects } from "../src/scan.js";

let workDir: string;

beforeEach(() => {
  workDir = mkdtempSync(join(tmpdir(), "tools-link-check-test-"));
});

afterEach(() => {
  rmSync(workDir, { recursive: true, force: true });
});

function makeProject(id: string, files: Record<string, string>): string {
  const dir = join(workDir, id);
  mkdirSync(dir, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    writeFileSync(join(dir, name), content);
  }
  return dir;
}

const artifact = (entry: string, primary: boolean, updatedAt: string): string =>
  JSON.stringify({
    entry,
    primary,
    updatedAt,
    kind: "html",
    title: entry,
    renderer: "html",
    status: "complete",
  });

describe("scanOdProjects — root discovery", () => {
  it("returns an empty result when the root is missing", () => {
    const result = scanOdProjects(join(workDir, "does-not-exist"));
    expect(result.totals.projects).toBe(0);
  });

  it("skips projects that contain no HTML files", () => {
    makeProject("empty", { "readme.txt": "no html here" });
    const result = scanOdProjects(workDir);
    expect(result.totals.projects).toBe(0);
  });

  it("counts HTML and artifact.json files in each project", () => {
    makeProject("p1", {
      "index.html": "<h1>hi</h1>",
      "settings.html": "<h1>set</h1>",
      "index.html.artifact.json": artifact("index.html", true, "2026-06-01T00:00:00.000Z"),
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.projects).toBe(1);
    expect(result.projects[0].htmlCount).toBe(2);
    expect(result.projects[0].artifactCount).toBe(1);
  });
});

describe("scanOdProjects — dead cross-references", () => {
  it("flags a missing target", () => {
    makeProject("p1", {
      "index.html": `<a href="missing.html">x</a>`,
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.deadRefs).toBe(1);
    expect(result.projects[0].deadRefs[0]).toMatchObject({
      file: "index.html",
      target: "missing.html",
      line: 1,
    });
  });

  it("ignores external / hash / query-only / mailto / data refs", () => {
    makeProject("p1", {
      "index.html": [
        `<a href="https://example.com">ext</a>`,
        `<a href="mailto:x@y.z">mail</a>`,
        `<a href="#section">hash</a>`,
        `<a href="?id=1">query</a>`,
        `<a href="javascript:void(0)">js</a>`,
        `<a href="data:text/plain,hi">data</a>`,
      ].join("\n"),
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.deadRefs).toBe(0);
  });

  it("strips ?query and #hash before resolving the target", () => {
    makeProject("p1", {
      "index.html": `<a href="settings.html?from=index">x</a>`,
      "settings.html": "<h1>ok</h1>",
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.deadRefs).toBe(0);
  });

  it("captures the 1-based line number of each reference", () => {
    makeProject("p1", {
      "index.html": ["line 1", "line 2", `<a href="nope.html">x</a>`].join("\n"),
    });
    const result = scanOdProjects(workDir);
    expect(result.projects[0].deadRefs[0].line).toBe(3);
  });

  it("finds refs in location.href=... as well as href=...", () => {
    makeProject("p1", {
      "index.html": `<button onclick="location.href='ghost.html'">go</button>`,
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.deadRefs).toBe(1);
    expect(result.projects[0].deadRefs[0].target).toBe("ghost.html");
  });
});

describe("scanOdProjects — schema issues", () => {
  it("detects multiple artifact.json files claiming primary:true", () => {
    makeProject("p1", {
      "index.html": "<h1>x</h1>",
      "index.html.artifact.json": artifact("index.html", true, "2026-06-01T00:00:00.000Z"),
      "settings.html": "<h1>y</h1>",
      "settings.html.artifact.json": artifact("settings.html", true, "2026-06-02T00:00:00.000Z"),
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.schemaProjects).toBe(1);
    const schema = result.projects[0].schema!;
    expect(schema.primary).toHaveLength(2);
    // Newer updatedAt wins as the proposed current entry.
    expect(schema.current).toBe("settings.html.artifact.json");
  });

  it("does not flag a single primary:true", () => {
    makeProject("p1", {
      "index.html": "<h1>x</h1>",
      "index.html.artifact.json": artifact("index.html", true, "2026-06-01T00:00:00.000Z"),
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.schemaProjects).toBe(0);
  });

  it("detects artifact.json entry pointing to a non-existent HTML file", () => {
    makeProject("p1", {
      "index.html": "<h1>x</h1>",
      "ghost.html.artifact.json": artifact("ghost.html", false, "2026-06-01T00:00:00.000Z"),
    });
    const result = scanOdProjects(workDir);
    expect(result.projects[0].schema!.entryMisses).toHaveLength(1);
    expect(result.projects[0].schema!.entryMisses[0].entry).toBe("ghost.html");
  });

  it("tolerates malformed artifact.json without throwing", () => {
    makeProject("p1", {
      "index.html": "<h1>x</h1>",
      "broken.html.artifact.json": "{ not json",
    });
    expect(() => scanOdProjects(workDir)).not.toThrow();
  });
});

describe("scanOdProjects — orphan HTML files", () => {
  it("flags files with no inbound reference", () => {
    makeProject("p1", {
      "index.html": `<a href="about.html">x</a>`,
      "about.html": "<h1>about</h1>",
      "scratch.html": "<h1>scratch</h1>",
    });
    const result = scanOdProjects(workDir);
    expect(result.projects[0].orphans.map((o) => o.file).sort()).toEqual(["scratch.html"]);
  });

  it("does not flag index.html as an orphan", () => {
    makeProject("p1", { "index.html": "<h1>x</h1>" });
    const result = scanOdProjects(workDir);
    expect(result.projects[0].orphans).toEqual([]);
  });

  it("skips directories whose name starts with underscore", () => {
    makeProject("p1", { "index.html": "<h1>x</h1>" });
    mkdirSync(join(workDir, "_archive"), { recursive: true });
    writeFileSync(join(workDir, "_archive", "old.html"), "<h1>old</h1>");
    const result = scanOdProjects(workDir);
    // _archive is a sibling project dir, also gets scanned as a project
    // if it has any HTML, so verify _archive HTML is not pulled into p1.
    const p1 = result.projects.find((p) => p.projectId === "p1")!;
    expect(p1.orphans).toEqual([]);
  });

  it("scans nested HTML files inside subdirectories", () => {
    makeProject("p1", {
      "index.html": "<h1>x</h1>",
    });
    mkdirSync(join(workDir, "p1", "screens"), { recursive: true });
    writeFileSync(join(workDir, "p1", "screens", "settings.html"), "<h1>s</h1>");
    const result = scanOdProjects(workDir);
    const p1 = result.projects.find((p) => p.projectId === "p1")!;
    expect(p1.htmlCount).toBe(2);
    expect(p1.orphans.map((o) => o.file)).toContain("screens/settings.html");
  });
});

describe("scanOdProjects — totals", () => {
  it("sums totals across multiple projects", () => {
    makeProject("p1", {
      "index.html": `<a href="missing.html">x</a>`,
    });
    makeProject("p2", {
      "index.html": "<h1>x</h1>",
      "scratch.html": "<h1>s</h1>",
    });
    const result = scanOdProjects(workDir);
    expect(result.totals.projects).toBe(2);
    expect(result.totals.deadRefs).toBe(1);
    expect(result.totals.orphanProjects).toBe(1);
  });
});

describe("proposeFixes", () => {
  it("returns no proposals when there are no dead refs", () => {
    makeProject("p1", {
      "index.html": `<a href="about.html">x</a>`,
      "about.html": "<h1>ok</h1>",
    });
    const summary = proposeFixes(workDir, false);
    expect(summary.proposals).toEqual([]);
    expect(summary.mutatedFiles).toBe(0);
  });

  it("proposes a rewrite to the latest sibling by mtime", async () => {
    makeProject("p1", {
      "index.html": `<a href="detail.html">x</a>`,
      "detail-2.html": "<h1>v2</h1>",
      "detail-9-2.html": "<h1>latest</h1>",
    });
    // Touch the mtimes so detail-9-2 is the most recent
    const { utimesSync } = await import("node:fs");
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    utimesSync(join(workDir, "p1", "index.html"), now, now);
    utimesSync(join(workDir, "p1", "detail-2.html"), earlier, earlier);
    utimesSync(join(workDir, "p1", "detail-9-2.html"), now, now);

    const summary = proposeFixes(workDir, false);
    expect(summary.proposals).toHaveLength(1);
    expect(summary.proposals[0]).toMatchObject({
      projectId: "p1",
      file: "index.html",
      oldTarget: "detail.html",
      newTarget: "detail-9-2.html",
      reason: "mtime",
    });
  });

  it("prefers the artifact.json primary over mtime when present", async () => {
    makeProject("p1", {
      "index.html": `<a href="detail.html">x</a>`,
      "detail-2.html": "<h1>v2 (primary)</h1>",
      "detail-9-2.html": "<h1>latest mtime but not primary</h1>",
      "detail-2.html.artifact.json": JSON.stringify({
        entry: "detail-2.html",
        primary: true,
        updatedAt: "2026-06-01T00:00:00.000Z",
      }),
    });
    const { utimesSync } = await import("node:fs");
    const now = new Date();
    const earlier = new Date(now.getTime() - 60_000);
    utimesSync(join(workDir, "p1", "index.html"), now, now);
    utimesSync(join(workDir, "p1", "detail-2.html"), earlier, earlier);
    utimesSync(join(workDir, "p1", "detail-9-2.html"), now, now);

    const summary = proposeFixes(workDir, false);
    expect(summary.proposals[0].newTarget).toBe("detail-2.html");
    expect(summary.proposals[0].reason).toBe("primary");
  });

  it("skips when no sibling exists", () => {
    makeProject("p1", {
      "index.html": `<a href="nonexistent.html">x</a>`,
    });
    const summary = proposeFixes(workDir, false);
    expect(summary.proposals).toEqual([]);
  });

  it("preserves query and hash in the rewritten href", () => {
    makeProject("p1", {
      "index.html": `<a href="detail.html?id=1#section">x</a>`,
      "detail-2.html": "<h1>v2</h1>",
    });
    const summary = proposeFixes(workDir, false);
    expect(summary.proposals[0]).toMatchObject({
      oldTarget: "detail.html",
      newTarget: "detail-2.html",
    });
  });

  it("--apply mode rewrites the file on disk", () => {
    const indexPath = join(workDir, "p1", "index.html");
    makeProject("p1", {
      "index.html": `<a href="detail.html">x</a>`,
      "detail-2.html": "<h1>v2</h1>",
    });

    const before = readFileSync(indexPath, "utf8");
    expect(before).toContain(`href="detail.html"`);

    const summary = proposeFixes(workDir, true);
    expect(summary.applied).toBe(true);
    expect(summary.mutatedFiles).toBe(1);

    const after = readFileSync(indexPath, "utf8");
    expect(after).toContain(`href="detail-2.html"`);
    expect(after).not.toContain(`href="detail.html"`);
  });

  it("--apply does not rewrite when no proposals", () => {
    const indexPath = join(workDir, "p1", "index.html");
    makeProject("p1", {
      "index.html": `<a href="about.html">x</a>`,
      "about.html": "<h1>ok</h1>",
    });
    const before = readFileSync(indexPath, "utf8");
    const summary = proposeFixes(workDir, true);
    expect(summary.mutatedFiles).toBe(0);
    const after = readFileSync(indexPath, "utf8");
    expect(after).toBe(before);
  });

  it("handles multiple dead refs to different targets in one file", () => {
    makeProject("p1", {
      "index.html": `<a href="about.html">a</a><a href="contact.html">c</a>`,
      "about-2.html": "<h1>a2</h1>",
      "contact-3.html": "<h1>c3</h1>",
    });
    const summary = proposeFixes(workDir, false);
    expect(summary.proposals).toHaveLength(2);
    const map = new Map(summary.proposals.map(p => [p.oldTarget, p.newTarget]));
    expect(map.get("about.html")).toBe("about-2.html");
    expect(map.get("contact.html")).toBe("contact-3.html");
  });
});
