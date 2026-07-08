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

// site-footer.astro also carries an `allSolutions` label for a column the
// homepage footer expresses differently; it is legitimately sub-page-only.
const SUBPAGE_ONLY_LABELS = new Set(["allSolutions"]);

// Extract the keys of the `en: { company: ... }` footer-label object literal.
function footerEnLabelKeys(source: string): string[] {
  const anchor = source.indexOf("en: { company:");
  assert.ok(anchor >= 0, "could not find the `en: { company: ... }` footer dict");
  const open = source.indexOf("{", anchor);
  const close = source.indexOf("}", open);
  assert.ok(open >= 0 && close > open, "malformed footer dict object literal");
  return source
    .slice(open + 1, close)
    .split(",")
    .map((pair) => pair.split(":")[0]?.trim())
    .filter((key): key is string => Boolean(key));
}

describe("footer parity", () => {
  it("keeps the homepage footer in sync with the sub-page footer labels", async () => {
    const [homepage, subpage] = await Promise.all([
      readFile(HOMEPAGE_FOOTER, "utf8"),
      readFile(SUBPAGE_FOOTER, "utf8"),
    ]);

    const homeKeys = new Set(footerEnLabelKeys(homepage));
    const subKeys = footerEnLabelKeys(subpage);

    // Every sub-page footer label (minus the intentionally sub-page-only ones)
    // must also exist on the homepage footer.
    const expected = subKeys.filter((key) => !SUBPAGE_ONLY_LABELS.has(key)).sort();
    assert.deepEqual(
      [...homeKeys].sort(),
      expected,
      "homepage footer (page.tsx) drifted from site-footer.astro — add the missing label(s) to FOOTER_LEGAL and the Company column",
    );

    // Concrete anchor for the Careers link that originally regressed.
    assert.ok(homeKeys.has("careers"), "homepage footer is missing the Careers label");
  });
});
