import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

// The homepage renders its own React footer (app/page.tsx), while every
// sub-page renders app/_components/site-footer.astro. page.tsx explicitly
// promises the two "never drift". This test enforces that promise at the
// label level so a link added to one footer (e.g. Careers) can't silently be
// missing from the other. It would have gone red on the commit that added the
// Careers link to site-footer.astro only.
const HOMEPAGE_FOOTER = new URL("../app/page.tsx", import.meta.url);
const SUBPAGE_FOOTER = new URL("../app/_components/site-footer.astro", import.meta.url);

// Both footer implementations now consume the shared `getFooterLegalCopy`
// dictionary through the `l` binding. Compare the keys each renderer uses
// instead of depending on the old inline `en: { company: ... }` formatting.
function footerLegalKeys(source: string): string[] {
  const binding = source.match(/const\s+([A-Za-z][A-Za-z0-9]*)\s*=\s*getFooterLegalCopy\(/)?.[1];
  assert.ok(binding, "footer does not initialize localized legal copy");
  const access = new RegExp(`\\b${binding}\\.([A-Za-z][A-Za-z0-9]*)`, 'g');
  return [...source.matchAll(access)]
    .map((match) => match[1])
    .filter((key): key is string => Boolean(key));
}

describe("footer parity", () => {
  it("keeps the homepage footer in sync with the sub-page footer labels", async () => {
    const [homepage, subpage] = await Promise.all([
      readFile(HOMEPAGE_FOOTER, "utf8"),
      readFile(SUBPAGE_FOOTER, "utf8"),
    ]);

    const homeKeys = new Set(footerLegalKeys(homepage));
    const subKeys = new Set(footerLegalKeys(subpage));

    assert.ok(homeKeys.size > 0, "homepage footer does not consume localized legal labels");
    assert.ok(subKeys.size > 0, "sub-page footer does not consume localized legal labels");

    assert.deepEqual(
      [...homeKeys].sort(),
      [...subKeys].sort(),
      "homepage footer (page.tsx) drifted from site-footer.astro — add the missing label(s) to FOOTER_LEGAL and the Company column",
    );

    // Concrete anchor for the Careers link that originally regressed.
    assert.ok(homeKeys.has("careers"), "homepage footer is missing the Careers label");
  });

  it("keeps the product column destinations in parity", async () => {
    const [homepage, subpage] = await Promise.all([
      readFile(HOMEPAGE_FOOTER, "utf8"),
      readFile(SUBPAGE_FOOTER, "utf8"),
    ]);

    // Product destinations both footers must link. /codex-plugin/ originally
    // regressed on the homepage after the 2026-08 nav consolidation.
    for (const path of ["/html-anything/", "/html-video/", "/codex-slides/", "/codex-plugin/"]) {
      assert.ok(
        homepage.includes(`href={href('${path}')}`),
        `homepage footer is missing the ${path} product link`,
      );
      assert.ok(
        subpage.includes(`href={href('${path}')}`),
        `sub-page footer is missing the ${path} product link`,
      );
    }
  });
});

// Canonical-only pages (no per-locale variant) build their header language
// switcher with `canonicalOnly: true` so every option keeps the single URL.
// The footer switcher must receive the same flag, or it would emit
// `/zh/<page>/` links that are never generated (404 on language switch).
describe("footer locale switcher on canonical-only pages", () => {
  it("threads localeCanonicalOnly into every direct SiteFooter call on a canonical-only page", async () => {
    const { readdir } = await import("node:fs/promises");
    const { join } = await import("node:path");
    const root = new URL("../app/pages/", import.meta.url).pathname;
    const files: string[] = [];
    const walk = async (dir: string) => {
      for (const entry of await readdir(dir, { withFileTypes: true })) {
        const full = join(dir, entry.name);
        if (entry.isDirectory()) await walk(full);
        else if (entry.name.endsWith(".astro")) files.push(full);
      }
    };
    await walk(root);

    const offenders: string[] = [];
    for (const file of files) {
      const source = await readFile(file, "utf8");
      const canonicalOnly = /canonicalOnly:\s*(true|[A-Za-z_$][\w$]*)/.test(source) || /data-locale-canonical/.test(source);
      if (!canonicalOnly) continue;
      for (const call of source.match(/<SiteFooter\b[^>]*\/>/g) ?? []) {
        if (!/localeCanonicalOnly/.test(call)) offenders.push(`${file.replace(root, "")}: ${call}`);
      }
    }
    assert.deepEqual(offenders, [], "canonical-only pages must pass localeCanonicalOnly to SiteFooter");
  });
});
