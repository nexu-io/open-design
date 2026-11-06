// @ts-nocheck
/**
 * newsletter — a restrained multi-story digest, built to email.md.
 *
 * email.md applied to a digest: win the open (subject/preheader), then win the
 * click. Two gates → one job → ONE primary CTA, surfaced above the fold and
 * echoed once at the end (same action). The body is a masthead + an
 * inverted-pyramid lede + three numbered stories, each a benefit headline + a
 * 2-sentence scannable blurb + a "read more" — clearly separated (the doc's
 * newsletter checklist item). Every text slot is pulled from the Brand with
 * production-quality fallbacks, so different brands fill the SAME structure.
 *
 * Email constraints: single column, ~600px, table layout for the CTA button,
 * inline styles, all keyed to `--brand-*` so it re-skins with the tokens. The
 * only ornaments are line/numeral motifs — no emoji-as-icons, no images.
 *
 * Pure & deterministic: `(brand, tokens) -> string`, no network / Date / random.
 */

import { button } from "../kit.js";
import type { Brand } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import {
  esc,
  cap,
  document,
  brandTagline,
  brandBlurb,
  pillarTitles,
  featureCards,
  emailFooter,
} from "./_shared.js";

// ─────────────────────────── newsletter-local copy ──────────────────────────

/** The issue label under the masthead. Voice tone → a short, calm descriptor. */
function issueLabel(brand: Brand): string {
  const adj = brand.voice.adjectives.map((a) => a.trim()).filter(Boolean)[0];
  const word = adj ? `${cap(adj)} reads` : "The digest";
  return `${word} · Issue 01`;
}

/**
 * The lede headline (the inverted-pyramid first line — "what's in this issue,
 * for you"). Prefers a real pillar/tagline; the fallback still reads like a
 * human wrote it, never lorem.
 */
function ledeHeadline(brand: Brand): string {
  const pillar = pillarTitles(brand)[0];
  if (pillar) return cap(pillar);
  const tag = brandTagline(brand).replace(/\.$/, "");
  return tag || `Three things worth your time from ${brand.name}`;
}

/** 1–2 sentence expansion of the lede — "why this is relevant to you". */
function ledeBlurb(brand: Brand): string {
  return brandBlurb(brand);
}

/**
 * Three benefit-framed stories. `featureCards` is pillars-first with quality
 * fallbacks, so the slots are always full and on-brand. We keep exactly three
 * (a digest, not a wall) and trim each blurb to two crisp sentences.
 */
function stories(brand: Brand): Array<{ headline: string; blurb: string; cta: string }> {
  const ctas = ["Read the full story", "See how it works", "Get the details"];
  return featureCards(brand)
    .slice(0, 3)
    .map((f, i) => ({
      headline: cap(f.title),
      blurb: twoSentences(f.body),
      cta: ctas[i] ?? "Keep reading",
    }));
}

/** Clamp a blurb to its first two sentences so every story scans the same. */
function twoSentences(text: string): string {
  const parts = text.match(/[^.!?]+[.!?]+/g);
  if (!parts || parts.length <= 2) return text.trim();
  return parts.slice(0, 2).join(" ").trim();
}

// ─────────────────────────── markup helpers (local) ─────────────────────────

const PAD_X = varRef("sizeXXL");

/** A hairline rule keyed to the border token — the digest's only divider. */
function rule(): string {
  return `<div style="height:${varRef("lineWidth")};background:${varRef(
    "colorBorderSecondary",
  )};margin:0 ${PAD_X};"></div>`;
}

/** Bulletproof, table-based primary CTA (email.md: no background-image buttons). */
function ctaRow(label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;">
            <tr><td style="border-radius:${varRef("borderRadius")};">${button({
              label,
              type: "primary",
              size: "lg",
            })}</td></tr>
          </table>`;
}

/** A single numbered story block — kicker(№) + benefit headline + 2 sentences + read-more. */
function storyBlock(
  story: { headline: string; blurb: string; cta: string },
  index: number,
): string {
  const n = String(index + 1).padStart(2, "0");
  return `      <tr><td style="padding:${varRef("sizeXL")} ${PAD_X} ${varRef("sizeLG")};">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;">
          <tr>
            <td valign="top" style="width:54px;padding-right:${varRef("sizeMD")};">
              <div style="font-family:var(--display-family);font-size:${varRef(
                "fontSizeHeading3",
              )};font-weight:${varRef("fontWeightStrong")};line-height:1;color:${varRef(
                "colorPrimary",
              )};letter-spacing:-0.02em;">${n}</div>
              <div style="margin-top:${varRef("sizeXS")};width:24px;height:${varRef(
                "lineWidth",
              )};background:${varRef("colorPrimaryBorder")};"></div>
            </td>
            <td valign="top">
              <h2 style="font-size:${varRef("fontSizeHeading4")};line-height:1.25;letter-spacing:-0.01em;margin:0 0 ${varRef(
                "sizeXS",
              )};color:${varRef("colorText")};">${esc(story.headline)}</h2>
              <p style="margin:0 0 ${varRef("sizeMD")};color:${varRef(
                "colorTextSecondary",
              )};font-size:${varRef("fontSize")};line-height:${varRef("lineHeight")};">${esc(
                story.blurb,
              )}</p>
              <a href="#" style="font-weight:${varRef("fontWeightStrong")};font-size:${varRef(
                "fontSize",
              )};color:${varRef("colorLink")};text-decoration:none;">${esc(
                story.cta,
              )} &rarr;</a>
            </td>
          </tr>
        </table>
      </td></tr>`;
}

// ─────────────────────────── renderer ───────────────────────────────────────

export function renderNewsletter(brand: Brand, tokens: DesignTokens): string {
  const issue = issueLabel(brand);
  const headline = ledeHeadline(brand);
  const blurb = ledeBlurb(brand);
  const items = stories(brand);
  const storyMarkup = items
    .map((s, i) => `${i > 0 ? `      <tr><td>${rule()}</td></tr>\n` : ""}${storyBlock(s, i)}`)
    .join("\n");

  // Preheader: supplements (not repeats) the masthead — email.md preheader rule.
  const preheader = brandTagline(brand);

  const inner = `      <!-- preheader: shown in the inbox preview, hidden in body -->
      <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${varRef(
        "colorBgContainer",
      )};">${esc(preheader)}</div>

      <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="width:100%;border-collapse:collapse;">
        <!-- masthead -->
        <tr><td style="padding:${varRef("sizeXL")} ${PAD_X} ${varRef(
          "sizeLG",
        )};text-align:center;border-bottom:${varRef("lineWidth")} solid ${varRef(
          "colorBorder",
        )};">
          <div style="display:inline-block;width:32px;height:${varRef(
            "lineWidth",
          )};background:${varRef("colorPrimary")};margin-bottom:${varRef("sizeMD")};"></div>
          <div style="font-family:var(--display-family);font-weight:${varRef(
            "fontWeightStrong",
          )};font-size:${varRef("fontSizeHeading3")};letter-spacing:-0.02em;color:${varRef(
            "colorText",
          )};">${esc(brand.name)}</div>
          <div style="margin-top:${varRef("sizeXS")};font-size:${varRef(
            "fontSizeSM",
          )};color:${varRef(
            "colorTextTertiary",
          )};text-transform:uppercase;letter-spacing:0.2em;">${esc(issue)}</div>
        </td></tr>

        <!-- lede: inverted pyramid — core line + why-relevant, above the fold -->
        <tr><td style="padding:${varRef("sizeXL")} ${PAD_X} ${varRef("sizeMD")};">
          <p style="margin:0 0 ${varRef("sizeXS")};text-transform:uppercase;letter-spacing:0.16em;font-size:${varRef(
            "fontSizeSM",
          )};font-weight:${varRef("fontWeightStrong")};color:${varRef(
            "colorPrimary",
          )};">In this issue</p>
          <h1 style="font-size:${varRef(
            "fontSizeHeading2",
          )};line-height:1.18;letter-spacing:-0.015em;margin:0 0 ${varRef(
            "sizeSM",
          )};color:${varRef("colorText")};">${esc(headline)}</h1>
          <p style="margin:0;color:${varRef("colorTextSecondary")};font-size:${varRef(
            "fontSizeLG",
          )};line-height:1.6;">${esc(blurb)}</p>
        </td></tr>

        <!-- primary CTA, surfaced above the fold (one job) -->
        <tr><td style="padding:0 ${PAD_X} ${varRef("sizeXL")};text-align:center;">
          ${ctaRow("Read this issue")}
        </td></tr>

        <tr><td>${rule()}</td></tr>

        <!-- numbered stories -->
${storyMarkup}

        <tr><td>${rule()}</td></tr>

        <!-- closing CTA: same action, echoed once (email.md) -->
        <tr><td style="padding:${varRef("sizeXL")} ${PAD_X} ${varRef(
          "sizeXXL",
        )};text-align:center;">
          <p style="margin:0 0 ${varRef("sizeMD")};color:${varRef(
            "colorTextSecondary",
          )};font-size:${varRef("fontSize")};">That's the issue. ${esc(
            cap(brand.name),
          )} lands in your inbox next week.</p>
          ${ctaRow("Read this issue")}
        </td></tr>
      </table>
${emailFooter(brand)}`;

  const body = `    <div style="padding:${varRef("sizeXL")} ${varRef("sizeMD")};">
      <div style="max-width:600px;margin:0 auto;background:${varRef(
        "colorBgContainer",
      )};border:${varRef("lineWidth")} solid ${varRef("colorBorderSecondary")};border-radius:${varRef(
        "borderRadiusLG",
      )};overflow:hidden;">
${inner}
      </div>
    </div>`;

  return document({ title: `${brand.name} — Newsletter`, tokens, brand, body });
}
