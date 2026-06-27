import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("overview refresh serializes product UI project case-library data", () => {
  const repo = mkdtempSync(join(tmpdir(), "od-product-ui-overview-"));
  mkdirSync(join(repo, "skills"));
  mkdirSync(join(repo, "design-templates", "product-ui-projects", "references"), { recursive: true });
  mkdirSync(join(repo, "design-systems"));

  writeFileSync(
    join(repo, "overview.html"),
    [
      "<html><body><script>",
      "const CARDS = [];",
      "const BLOG_PROJECTS = {\"sites\": [], \"pages\": [], \"blocks\": []};",
      "const COMMERCIAL_LAUNCHES = {\"brands\": [], \"pages\": [], \"modules\": [], \"assets\": [], \"motion\": []};",
      "const ICONS = {};",
      "</script></body></html>",
    ].join("\n"),
  );

  writeFileSync(
    join(repo, "design-templates", "product-ui-projects", "references", "catalog.json"),
    JSON.stringify(
      {
        entries: [
          {
            id: "workflow-os",
            project: {
              name: "Workflow OS",
              sector: "productivity software",
              url: "https://example.com",
              type: "SaaS console",
            },
            why: "A product UI reference where dashboard, detail, and settings surfaces work as one suite.",
            surfaces: [
              {
                type: "dashboard",
                title: "Operations dashboard",
                url: "https://example.com/dashboard",
                preview: "design-templates/product-ui-projects/example.html",
                study: "Dense metrics, activity, and task queues share one scan rhythm.",
                reuse: "Use for operational products that need a calm command center.",
              },
              {
                type: "detail",
                title: "Task detail",
                url: "https://example.com/tasks/1",
                study: "Primary object detail keeps status, timeline, and actions visible.",
                reuse: "Use when records need context and action in the same view.",
              },
              {
                type: "settings",
                title: "Team settings",
                url: "https://example.com/settings",
                study: "Settings preserve product density without becoming a form dump.",
                reuse: "Use for team administration surfaces.",
              },
            ],
            flows: [{ type: "review", title: "Review task", study: "Dashboard to detail to action closure.", reuse: "Use for approval workflows." }],
            states: [{ type: "empty", title: "Empty queue", study: "Empty copy explains the next useful action.", reuse: "Use for first-run product states." }],
            components: [{ type: "activity-feed", title: "Activity feed", study: "Compact timeline with actor and object links.", reuse: "Use for collaborative dashboards." }],
            implementation: { framework: "reference-only", complexity: "medium" },
            capture: {
              date: "2026-06-26",
              sourceLinks: ["https://example.com/dashboard", "https://example.com/tasks/1", "https://example.com/settings"],
              attribution: "Example",
              reusePolicy: "inspiration-only",
              captureDepth: "surface-suite",
            },
          },
        ],
      },
      null,
      2,
    ),
  );

  execFileSync("python3", ["/Users/wuling/.codex/skills/od-capture-design/scripts/update_overview.py", "--repo", repo], {
    stdio: "pipe",
  });

  const html = readFileSync(join(repo, "overview.html"), "utf8");
  assert.match(html, /const PRODUCT_UI_PROJECTS = /);
  assert.match(html, /Workflow OS/);
  assert.match(html, /Operations dashboard/);
  assert.match(html, /activity-feed/);
  assert.match(html, /surface-suite/);
});
