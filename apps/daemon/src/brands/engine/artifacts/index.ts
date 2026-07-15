// @ts-nocheck
/**
 * artifacts — the last hop of the pipeline. Where `kit` produces individual
 * themed components, `artifacts` composes them into *products* that follow the
 * real-world playbook for each medium:
 *
 *   landing     nav → hero → social proof → problem (PAS) → value pillars
 *               → how-it-works → features → proof → FAQ → pricing → final CTA
 *               → footer  (the 12-module docs/content-structures order)
 *   deck        11-slide pitch skeleton (Cover · Problem · Solution · Why now ·
 *               Market · Product · Business model · Competition & Moat ·
 *               Traction · Team · Ask) with scroll-snap + keyboard paging
 *   poster      3:4 print-style sheet, container-query type so nothing clips
 *   email       single-column 600px announcement with hero, checklist & CTA
 *   newsletter  masthead + numbered stories digest
 *   form        split-screen contact/signup page
 *
 * Everything visual flows from DesignTokens (inlined as a `:root` block of
 * `--brand-*` custom properties), copy is pulled from the Brand (name /
 * tagline / description / voice) with production-quality fallbacks, and the
 * brand's Google Fonts are loaded when the kit declares them. The output of
 * every function is a complete, standalone HTML document.
 *
 * Each medium lives in its own module; the shared shell + copy helpers live in
 * `_shared`. This barrel re-exports `brandFontAssets` and the public dispatch
 * (`renderArtifact` / `renderArtifactGallery`) so `./artifacts` resolves here.
 */

import type { Brand, AssetKind } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import { esc, document, brandTagline } from "./_shared.js";
import { renderLanding } from "./landing.js";
import { renderDeck } from "./deck.js";
import { renderPoster } from "./poster.js";
import { renderEmail } from "./email.js";
import { renderNewsletter } from "./newsletter.js";
import { renderFormPage } from "./form.js";
import { renderGeneric } from "./generic.js";

export { brandFontAssets } from "./_shared.js";

// ─────────────────────────── public API ─────────────────────────────────────

/**
 * Render a complete, standalone HTML product for `kind`, themed entirely by
 * `tokens` and written from `brand`'s copy. Every AssetKind has a bespoke,
 * best-practice layout; unknown kinds fall back to a sensible card page.
 */
export function renderArtifact(kind: AssetKind, brand: Brand, tokens: DesignTokens): string {
  switch (kind) {
    case "landing":
      return renderLanding(brand, tokens);
    case "email":
      return renderEmail(brand, tokens);
    case "newsletter":
      return renderNewsletter(brand, tokens);
    case "deck":
      return renderDeck(brand, tokens);
    case "poster":
      return renderPoster(brand, tokens);
    case "form":
      return renderFormPage(brand, tokens);
    default:
      return renderGeneric(kind, brand, tokens);
  }
}

/**
 * A single overview page that shows every artifact product side by side via
 * sandboxed `<iframe srcdoc>` thumbnails — handy for a quick "what does this
 * brand produce?" glance.
 */
export function renderArtifactGallery(
  brand: Brand,
  tokens: DesignTokens,
  opts?: {
    /** Applied to each artifact document before it is escaped into srcdoc —
     *  e.g. inlining @font-face rules with gallery-relative urls. */
    decorate?: (html: string) => string;
  },
): string {
  const kinds: AssetKind[] = ["landing", "deck", "poster", "email", "newsletter", "form"];
  const decorate = opts?.decorate ?? ((html: string) => html);

  const frames = kinds
    .map((kind) => {
      const srcdoc = esc(decorate(renderArtifact(kind, brand, tokens)));
      return `      <figure style="margin:0;background:${varRef(
        "colorBgContainer",
      )};border:${varRef("lineWidth")} solid ${varRef("colorBorderSecondary")};border-radius:${varRef(
        "borderRadiusLG",
      )};overflow:hidden;">
        <figcaption style="padding:${varRef("sizeSM")} ${varRef("sizeMD")};font-weight:${varRef(
          "fontWeightStrong",
        )};border-bottom:${varRef("lineWidth")} solid ${varRef(
          "colorBorderSecondary",
        )};text-transform:capitalize;">${esc(kind)}</figcaption>
        <div style="height:420px;overflow:hidden;background:${varRef("colorBgLayout")};">
          <iframe
            srcdoc="${srcdoc}"
            sandbox=""
            loading="lazy"
            title="${esc(brand.name)} ${esc(kind)} preview"
            style="width:200%;height:840px;border:0;transform:scale(0.5);transform-origin:top left;"
          ></iframe>
        </div>
      </figure>`;
    })
    .join("\n");

  const body = `    <header style="max-width:1120px;margin:0 auto;padding:${varRef("sizeXXL")} ${varRef(
    "sizeXL",
  )} ${varRef("sizeLG")};">
      <h1 style="font-size:${varRef("fontSizeHeading1")};margin-bottom:${varRef("sizeSM")};">${esc(
        brand.name,
      )}</h1>
      <p style="color:${varRef("colorTextSecondary")};font-size:${varRef("fontSizeLG")};">${esc(
        brandTagline(brand),
      )}</p>
    </header>
    <section style="max-width:1120px;margin:0 auto;padding:0 ${varRef("sizeXL")} ${varRef(
      "sizeXXL",
    )};display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:${varRef(
      "sizeLG",
    )};">
${frames}
    </section>`;

  return document({ title: `${brand.name} — Artifacts`, tokens, brand, body });
}
