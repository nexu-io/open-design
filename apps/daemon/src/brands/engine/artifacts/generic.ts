// @ts-nocheck
/**
 * generic — a reasonable card+button page for kinds without a bespoke layout.
 */

import { button, card, tag } from "../kit.js";
import type { Brand, AssetKind } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import { esc, document, cap, brandTagline, brandBlurb } from "./_shared.js";

/** A reasonable card+button page for kinds without a bespoke layout. */
export function renderGeneric(kind: AssetKind, brand: Brand, tokens: DesignTokens): string {
  const label = cap(kind);
  const inner = `<p style="color:${varRef("colorTextSecondary")};margin-bottom:${varRef(
    "sizeLG",
  )};">${esc(brandBlurb(brand))}</p>
        <div style="display:flex;gap:${varRef("sizeSM")};align-items:center;">
          ${button({ label: "Open", type: "primary", size: "md" })}
          ${tag({ label })}
        </div>`;

  const body = `    <div style="max-width:680px;margin:0 auto;padding:${varRef("sizeXXL")} ${varRef(
    "sizeXL",
  )};">
      <h1 style="font-size:${varRef("fontSizeHeading2")};margin-bottom:${varRef("sizeSM")};">${esc(
        brand.name,
      )} ${esc(label)}</h1>
      <p style="color:${varRef("colorTextTertiary")};margin-bottom:${varRef("sizeXL")};">${esc(
        brandTagline(brand),
      )}</p>
      ${card({ title: label, body: inner })}
    </div>`;

  return document({ title: `${brand.name} — ${label}`, tokens, brand, body });
}
