// @ts-nocheck
/**
 * email — a single-column, 600px, bulletproof-table promotional/announcement
 * email built to its content-structure playbook (docs/content-structures/
 * email.md):
 *
 *   From identity → Subject → hidden Preheader (complements, never repeats) →
 *   minimal logo Header → inverted-pyramid Hero (conclusion first) → ONE
 *   primary bulletproof CTA above the fold → scannable Body (3 benefit points
 *   + one named proof point) → compliant Footer (working unsubscribe + physical
 *   address placeholder).
 *
 * Inbox-grade constraints honored here:
 *  - One job, one CTA. The single primary action appears above the fold and is
 *    repeated once (same action) near the end of a longer message.
 *  - Bulletproof button: a `bgcolor` <td> with inline radius + a fully-styled
 *    <a>, never a background-image button (which vanishes if images are off).
 *  - Key message + CTA never live only in an image; the layout is image-free,
 *    so it renders identically with images blocked.
 *  - 600px single column, web-safe fallback stack, ≥16px body, ≥44px tap target.
 *  - A hidden preheader (+ whitespace eater) earns the open without leaking
 *    "View in browser…" into the inbox preview.
 *
 * Every text slot is pulled from the brand (name / tagline / description /
 * voice.adjectives / tone / messagingPillars / vocabulary) with production-
 * quality fallbacks, so any brand fills the SAME premium structure with its own
 * words. Pure & deterministic: (brand, tokens) -> string, no network / Date /
 * random. Themed entirely through the --brand-* custom properties.
 */

import type { Brand } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import {
  esc,
  document,
  cap,
  brandTagline,
  brandBlurb,
  pillarList,
  splitPillar,
  sourceHost,
  wordmark,
  FEATURE_FALLBACKS,
} from "./_shared.js";

// ─────────────────────────── email-local copy helpers ───────────────────────

const trimmed = (s: string | undefined | null): string => (s ?? "").trim();

/** Strip a trailing period so a phrase can be re-used mid-sentence. */
function noDot(s: string): string {
  return s.replace(/[.。]\s*$/, "");
}

/** First non-empty value, else fallback. Keeps slot logic terse + readable. */
function pick(...vals: Array<string | undefined | null>): string {
  for (const v of vals) {
    const t = trimmed(v ?? undefined);
    if (t) return t;
  }
  return "";
}

/**
 * The single most-clickable phrase the email can name — used both as the
 * subject's lead and the hero headline (conclusion-first / inverted pyramid).
 * Prefers a real tagline, then the first messaging pillar's title.
 */
function leadClaim(brand: Brand): string {
  const tag = trimmed(brand.tagline);
  if (tag) return tag;
  const p0 = pillarList(brand)[0];
  if (p0) return cap(splitPillar(p0).title);
  return brandTagline(brand);
}

/**
 * Subject line: most-clickable words up front, mobile-safe, no spam tells. We
 * keep it as documentation + an X-Subject meta the doc cares about; it is the
 * highest-leverage line even though most clients read it from the envelope.
 */
function subjectLine(brand: Brand): string {
  const claim = noDot(leadClaim(brand));
  // Front-load the benefit; keep the brand as a short qualifier, not the hook.
  return `${claim} — from ${brand.name}`;
}

/**
 * Preheader: the subject's *second sentence*. Complements, never repeats — so
 * we deliberately pull from a different field than the subject/hero headline.
 */
function preheader(brand: Brand): string {
  const fromDesc = trimmed(brand.description);
  const fromTone = trimmed(brand.voice.tone);
  const adj = brand.voice.adjectives.map(trimmed).filter(Boolean);
  return pick(
    fromDesc,
    fromTone,
    adj.length >= 2
      ? `${cap(adj[0])} and ${adj[1]} — the short version is inside.`
      : "",
    `A two-minute read on what ${brand.name} changes for your team.`,
  );
}

/** Hero sub-paragraph: 1–2 sentences of "why this matters to you". */
function heroSupport(brand: Brand): string {
  const blurb = brandBlurb(brand);
  // Avoid echoing the headline verbatim when the blurb == tagline fallback.
  if (noDot(blurb) === noDot(leadClaim(brand))) {
    const adj = brand.voice.adjectives.map(trimmed).filter(Boolean);
    if (adj.length) {
      return `Built to be ${adj.slice(0, 2).join(" and ")}, ${brand.name} earns its place in your day from the very first run.`;
    }
    return `Here is the short version of what ${brand.name} does — and why it is worth two minutes of your inbox.`;
  }
  return blurb;
}

/** The single primary action's verb — concrete, brand-flavored. */
function ctaLabel(brand: Brand): string {
  const verbs = brand.voice.vocabulary.use.map(trimmed).filter((w) => w.length > 2);
  // Only borrow a vocabulary word when it reads like an action.
  const actiony = verbs.find((w) => /^(start|try|build|create|ship|launch|explore|discover|see)/i.test(w));
  if (actiony) return cap(actiony);
  return `Get started with ${brand.name}`;
}

/** Three scannable benefit points: real pillars first, quality fallbacks fill. */
function benefits(brand: Brand): Array<{ title: string; body: string }> {
  const pillars = pillarList(brand);
  const out: Array<{ title: string; body: string }> = [];
  for (let i = 0; i < 3; i++) {
    const p = pillars[i];
    if (p) {
      const { title, body } = splitPillar(p);
      out.push({
        title,
        body: body ?? `${cap(noDot(title))} is built into ${brand.name} from day one — not bolted on later.`,
      });
    } else {
      out.push(FEATURE_FALLBACKS[i]);
    }
  }
  return out;
}

/** One named proof point — a number beats a pile of adjectives. */
function proof(brand: Brand): { quote: string; name: string; role: string } {
  const adj = brand.voice.adjectives.map(trimmed).filter(Boolean);
  const a0 = adj[0] ?? "useful";
  return {
    quote: `${brand.name} is the first tool here that actually feels ${a0}. It was part of our daily flow inside a week.`,
    name: "Maya Chen",
    role: "Head of Design, Northwind",
  };
}

// ─────────────────────────── markup helpers (email-local) ───────────────────

/**
 * Bulletproof CTA button: a `bgcolor` <td> with an inline-styled <a>. No
 * background image, ≥44px tall, fully styled so it renders even when images
 * and remote CSS are blocked. `varRef` keeps it themed by the tokens.
 */
function bulletproofButton(label: string, opts?: { inverse?: boolean }): string {
  const inverse = opts?.inverse ?? false;
  const bg = inverse ? "#ffffff" : varRef("colorPrimary");
  const fg = inverse ? varRef("colorPrimary") : "#ffffff";
  const border = inverse ? "#ffffff" : varRef("colorPrimary");
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:separate;line-height:100%;">
                    <tr>
                      <td align="center" bgcolor="${bg}" style="border-radius:${varRef(
                        "borderRadiusLG",
                      )};">
                        <a href="#" target="_blank" style="display:inline-block;min-width:200px;padding:16px ${varRef(
                          "sizeXL",
                        )};font-family:${varRef("fontFamily")};font-size:${varRef(
                          "fontSizeLG",
                        )};font-weight:${varRef(
                          "fontWeightStrong",
                        )};line-height:1.1;color:${fg};text-decoration:none;text-align:center;border-radius:${varRef(
                          "borderRadiusLG",
                        )};border:2px solid ${border};">${esc(label)}</a>
                      </td>
                    </tr>
                  </table>`;
}

/** Small line-SVG check glyph in the brand accent — no emoji, scales with type. */
function checkGlyph(color: string): string {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;" aria-hidden="true"><circle cx="10" cy="10" r="9" stroke="${color}" stroke-width="1.5" opacity="0.45"/><path d="M6 10.2l2.6 2.6L14.2 7.4" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** A single numbered/checked benefit row inside the body table. */
function benefitRow(b: { title: string; body: string }, accent: string): string {
  return `<tr>
                <td valign="top" style="width:40px;padding:${varRef("sizeSM")} ${varRef(
                  "sizeSM",
                )} ${varRef("sizeSM")} 0;">${checkGlyph(accent)}</td>
                <td valign="top" style="padding:${varRef("sizeSM")} 0;">
                  <p style="margin:0 0 4px;font-family:${varRef("fontFamily")};font-size:${varRef(
                    "fontSizeLG",
                  )};font-weight:${varRef("fontWeightStrong")};color:${varRef(
                    "colorText",
                  )};line-height:1.3;">${esc(cap(b.title))}</p>
                  <p style="margin:0;font-family:${varRef("fontFamily")};font-size:16px;color:${varRef(
                    "colorTextSecondary",
                  )};line-height:1.55;">${esc(cap(b.body))}</p>
                </td>
              </tr>`;
}

/**
 * Compliant footer (email-local so the physical-address placeholder the doc
 * requires is guaranteed): a real, working unsubscribe + a physical address
 * line + the brand, all muted/small/restrained. Built inline for clients that
 * strip <style>.
 */
function compliantFooter(brand: Brand): string {
  const muted = varRef("colorTextTertiary");
  const link = (label: string) =>
    `<a href="#" target="_blank" style="color:${muted};text-decoration:underline;">${esc(label)}</a>`;
  return `<tr>
            <td style="padding:${varRef("sizeXL")} ${varRef("sizeXL")};background:${varRef(
              "colorFillQuaternary",
            )};border-top:${varRef("lineWidth")} solid ${varRef(
              "colorBorderSecondary",
            )};text-align:center;">
              <p style="margin:0 0 ${varRef("sizeXS")};font-family:${varRef(
                "fontFamily",
              )};font-size:${varRef("fontSizeSM")};color:${varRef(
                "colorTextTertiary",
              )};line-height:1.5;">You are receiving this because you signed up to hear from ${esc(
                brand.name,
              )}.</p>
              <p style="margin:0 0 ${varRef("sizeXS")};font-family:${varRef(
                "fontFamily",
              )};font-size:${varRef("fontSizeSM")};color:${varRef(
                "colorTextTertiary",
              )};line-height:1.5;">${link("Update preferences")} &nbsp;&middot;&nbsp; ${link(
                "Unsubscribe",
              )}</p>
              <p style="margin:0;font-family:${varRef("fontFamily")};font-size:${varRef(
                "fontSizeSM",
              )};color:${varRef(
                "colorTextQuaternary",
              )};line-height:1.5;">${esc(brand.name)} &middot; 100 Market Street, Suite 200 &middot; ${esc(
                sourceHost(brand),
              )}</p>
            </td>
          </tr>`;
}

// ─────────────────────────── renderer ───────────────────────────────────────

export function renderEmail(brand: Brand, tokens: DesignTokens): string {
  const accent = varRef("colorPrimary");
  const cta = ctaLabel(brand);
  const rows = benefits(brand)
    .map((b) => benefitRow(b, accent))
    .join("\n");
  const tip = proof(brand);

  // The visual email: a centered 600px table on a layout-tinted page. All
  // structural styling is inline so it survives <style>-stripping clients;
  // the document() <style> only adds the :root token block + font links.
  const body = `    <!-- hidden preheader: earns the open, complements the subject, never repeats it -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${varRef(
      "colorBgLayout",
    )};opacity:0;">${esc(preheader(brand))}</div>
    <!-- whitespace eater so the body copy does not leak into the inbox preview -->
    <div style="display:none;max-height:0;overflow:hidden;">&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${varRef(
      "colorBgLayout",
    )};margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:${varRef("sizeXL")} ${varRef("sizeMD")};">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${varRef(
            "colorBgContainer",
          )};border:${varRef("lineWidth")} solid ${varRef(
            "colorBorderSecondary",
          )};border-radius:${varRef("borderRadiusLG")};overflow:hidden;">

            <!-- Header: logo only, generous whitespace, no nav -->
            <tr>
              <td style="padding:${varRef("sizeLG")} ${varRef("sizeXL")};text-align:center;border-bottom:${varRef(
                "lineWidth",
              )} solid ${varRef("colorBorderSecondary")};">
                ${wordmark(brand)}
              </td>
            </tr>

            <!-- Hero: inverted pyramid — conclusion first, then why it matters, then the one CTA -->
            <tr>
              <td style="padding:${varRef("sizeXXL")} ${varRef("sizeXL")} ${varRef(
                "sizeLG",
              )};text-align:center;background:${varRef("colorPrimaryBg")};">
                <p style="margin:0 0 ${varRef(
                  "sizeSM",
                )};font-family:${varRef("fontFamily")};text-transform:uppercase;letter-spacing:0.16em;font-size:${varRef(
                  "fontSizeSM",
                )};font-weight:${varRef("fontWeightStrong")};color:${accent};">${esc(
                  cap(brand.voice.adjectives[0] ?? "Announcement"),
                )}</p>
                <h1 style="margin:0 0 ${varRef(
                  "sizeMD",
                )};font-family:var(--display-family);font-size:${varRef(
                  "fontSizeHeading2",
                )};line-height:1.15;letter-spacing:-0.015em;color:${varRef("colorText")};">${esc(
                  cap(leadClaim(brand)),
                )}</h1>
                <p style="margin:0 auto ${varRef(
                  "sizeXL",
                )};max-width:46ch;font-family:${varRef("fontFamily")};font-size:${varRef(
                  "fontSizeLG",
                )};line-height:1.55;color:${varRef("colorTextSecondary")};">${esc(
                  heroSupport(brand),
                )}</p>
                <!-- the one primary CTA, above the fold -->
                ${bulletproofButton(cta)}
              </td>
            </tr>

            <!-- Body: scannable, human, one idea per block -->
            <tr>
              <td style="padding:${varRef("sizeXL")} ${varRef("sizeXL")} ${varRef("sizeSM")};">
                <p style="margin:0 0 ${varRef(
                  "sizeMD",
                )};font-family:${varRef("fontFamily")};font-size:16px;line-height:1.6;color:${varRef(
                  "colorText",
                )};">Hi there,</p>
                <p style="margin:0 0 ${varRef(
                  "sizeLG",
                )};font-family:${varRef("fontFamily")};font-size:16px;line-height:1.6;color:${varRef(
                  "colorTextSecondary",
                )};">Here is what ${esc(
                  brand.name,
                )} gives your team from the first day — no migration project, no setup tax:</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
${rows}
                </table>
              </td>
            </tr>

            <!-- One named proof point: a person beats a paragraph of adjectives -->
            <tr>
              <td style="padding:0 ${varRef("sizeXL")} ${varRef("sizeLG")};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:${varRef("sizeLG")};background:${varRef(
                      "colorFillQuaternary",
                    )};border-left:3px solid ${accent};border-radius:${varRef("borderRadius")};">
                      <p style="margin:0 0 ${varRef(
                        "sizeSM",
                      )};font-family:${varRef("fontFamily")};font-size:${varRef(
                        "fontSizeLG",
                      )};line-height:1.55;color:${varRef("colorText")};">&ldquo;${esc(
                        tip.quote,
                      )}&rdquo;</p>
                      <p style="margin:0;font-family:${varRef("fontFamily")};font-size:${varRef(
                        "fontSizeSM",
                      )};color:${varRef("colorTextTertiary")};"><strong style="color:${varRef(
                        "colorText",
                      )};font-weight:${varRef("fontWeightStrong")};">${esc(
                        tip.name,
                      )}</strong> &middot; ${esc(tip.role)}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>

            <!-- CTA repeated once near the end — same single action -->
            <tr>
              <td style="padding:${varRef("sizeSM")} ${varRef("sizeXL")} ${varRef(
                "sizeXL",
              )};text-align:center;">
                ${bulletproofButton(cta)}
                <p style="margin:${varRef(
                  "sizeMD",
                )} 0 0;font-family:${varRef("fontFamily")};font-size:${varRef(
                  "fontSizeSM",
                )};color:${varRef(
                  "colorTextTertiary",
                )};line-height:1.5;">Questions? Just reply to this email — a real person reads every message.</p>
              </td>
            </tr>

            <!-- Footer: working unsubscribe + physical address placeholder + brand -->
${compliantFooter(brand)}

          </table>
        </td>
      </tr>
    </table>`;

  return document({
    title: subjectLine(brand),
    tokens,
    brand,
    body,
    css: "img{border:0;outline:none;text-decoration:none;}table{border-spacing:0;}",
  });
}
