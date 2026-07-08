import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { getFooterLegalCopy } from "../app/footer-legal-i18n.ts";

// The homepage renders its own React footer (app/page.tsx), while every
// sub-page renders app/_components/site-footer.astro. Both must use the shared
// footer legal copy module so footer labels cannot drift.
const HOMEPAGE_FOOTER = new URL("../app/page.tsx", import.meta.url);
const SUBPAGE_FOOTER = new URL("../app/_components/site-footer.astro", import.meta.url);

// site-footer.astro carries an `allSolutions` label for a column the homepage
// footer expresses differently; it is legitimately sub-page-only.
const SUBPAGE_ONLY_LABELS = new Set(["allSolutions"]);

const EXPECTED_FOOTER_LEGAL_KEYS = [
  "about",
  "allAgents",
  "allSolutions",
  "careers",
  "company",
  "faq",
  "privacy",
  "terms",
];

function referencedFooterLegalKeys(source: string): string[] {
  const legalKeys = Object.keys(getFooterLegalCopy("en"));
  return legalKeys.filter((key) =>
    new RegExp(`\\b[A-Za-z_$][\\w$]*\\.${key}\\b`).test(source),
  );
}

describe("footer parity", () => {
  it("keeps the homepage footer in sync with the sub-page footer labels", async () => {
    const [homepage, subpage] = await Promise.all([
      readFile(HOMEPAGE_FOOTER, "utf8"),
      readFile(SUBPAGE_FOOTER, "utf8"),
    ]);

    assert.match(homepage, /getFooterLegalCopy/, "homepage footer must use shared footer legal copy");
    assert.match(subpage, /getFooterLegalCopy/, "sub-page footer must use shared footer legal copy");

    assert.deepEqual(
      Object.keys(getFooterLegalCopy("en")).sort(),
      [...EXPECTED_FOOTER_LEGAL_KEYS].sort(),
      "shared footer legal copy changed shape",
    );

    const homeKeys = new Set(referencedFooterLegalKeys(homepage));
    const subKeys = referencedFooterLegalKeys(subpage);

    const expected = subKeys.filter((key) => !SUBPAGE_ONLY_LABELS.has(key)).sort();

    assert.deepEqual(
      [...homeKeys].sort(),
      expected,
      "homepage footer page.tsx drifted from site-footer.astro",
    );

    assert.ok(homeKeys.has("careers"), "homepage footer is missing the Careers label");
  });
});
