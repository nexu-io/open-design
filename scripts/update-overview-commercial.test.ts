import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("overview refresh serializes commercial launch case-library data", () => {
  const repo = mkdtempSync(join(tmpdir(), "od-commercial-overview-"));
  mkdirSync(join(repo, "skills"));
  mkdirSync(join(repo, "design-templates", "commercial-product-launches", "references"), { recursive: true });
  mkdirSync(join(repo, "design-systems"));

  writeFileSync(
    join(repo, "overview.html"),
    [
      "<html><body><script>",
      "const CARDS = [];",
      "const BLOG_PROJECTS = {\"sites\": [], \"pages\": [], \"blocks\": []};",
      "const ICONS = {};",
      "</script></body></html>",
    ].join("\n"),
  );

  writeFileSync(
    join(repo, "design-templates", "commercial-product-launches", "references", "catalog.json"),
    JSON.stringify(
      {
        entries: [
          {
            id: "apple-iphone",
            brand: { name: "Apple", sector: "consumer hardware", url: "https://www.apple.com/iphone/" },
            page: { title: "iPhone", url: "https://www.apple.com/iphone/", type: "product-family" },
            why: "A benchmark for modular product-family storytelling.",
            chapters: [{ type: "switching", title: "Switch to iPhone", study: "Benefit-led chapter sequencing." }],
            modules: [{ type: "comparison", title: "Explore the lineup", reuse: "Use when models need side-by-side choice support." }],
            mediaAssets: [{ type: "product-render", role: "lineup", notes: "Requires art-directed product renders." }],
            motionPatterns: [{ type: "chapter-transition", notes: "Use restrained scroll transitions." }],
            commercePatterns: [{ type: "trade-in", notes: "Pair purchase CTA with reassurance." }],
            responsiveNotes: [{ breakpoint: "mobile", notes: "Stack chapters around image priority." }],
            implementation: { complexity: "high", performanceNotes: "Lazy-load dense imagery." },
            capture: {
              date: "2026-06-14",
              sourceLinks: ["https://www.apple.com/iphone/"],
              attribution: "Apple",
              reusePolicy: "inspiration-only",
              captureDepth: "page-and-modules",
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
  assert.match(html, /const COMMERCIAL_LAUNCHES = /);
  assert.match(html, /Apple/);
  assert.match(html, /Explore the lineup/);
  assert.match(html, /product-render/);
});
