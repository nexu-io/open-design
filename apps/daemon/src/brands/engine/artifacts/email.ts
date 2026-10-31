// @ts-nocheck
/**
 * email — a single-column, 600px, bulletproof-table promotional/announcement
 * email built to its content-structure playbook (docs/content-structures/
 * email.md):
 *
 *   From identity → Subject → hidden Preheader (complements, never repeats) →
 *   minimal logo Header → inverted-pyramid Hero (conclusion first) → ONE
 *   primary bulletproof CTA above the fold → scannable Body (3 benefit points
 *   + an optional proof point) → compliant Footer (working unsubscribe, no address the
 *   brand never supplied).
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
  FEATURE_FALLBACKS,
} from "./_shared.js";

// ─────────────────────────── email-local copy helpers ───────────────────────

export type EmailToken = (key: string, fallback?: string) => string;
export type EmailPaint = {
  canvas: string;
  card: string;
  ink: string;
  muted: string;
  hairline: string;
  accent: string;
  accentDeep: string;
};
export type EmailButtonStyle = {
  accent: string;
  onAccent: string;
  radius: string;
  padX: string;
  fontFamily: string;
  fontSize: string;
  fontWeight: string;
  inverse?: boolean;
};

const TOKEN_ALIASES: Record<string, string> = {
  xxs: "XXS",
  xs: "XS",
  sm: "SM",
  md: "MD",
  lg: "LG",
  xl: "XL",
  xxl: "XXL",
};

/**
 * Email clients resolve no CSS custom properties — not in a `var()` inside an
 * attribute, not in `<style>` — so every value the artifact needs is resolved
 * to a literal here, from the token the design system already derived.
 */
function emailTokenOf(tokens: DesignTokens): EmailToken {
  return (key, fallback) => {
    const value = (tokens as Record<string, unknown>)[key];
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number") {
      return /^(lineHeight|fontWeight)/.test(key) ? String(value) : `${value}px`;
    }
    return fallback ?? "";
  };
}

/** The brand's own role colours; the derived tokens only fill a gap. */
const EMAIL_ROLES = {
  canvas: "background",
  card: "surface",
  ink: "foreground",
  muted: "muted",
  hairline: "border",
  accent: "accent",
  accentDeep: "accent-secondary",
} as const;

function brandHex(brand: Brand, role: string): string {
  const colour = (brand.colors ?? []).find((entry) => entry?.role === role);
  const value = trimmed(colour?.hex);
  return /^#(?:[0-9a-f]{3,8})$/i.test(value) ? value : "";
}

function emailPaint(brand: Brand, tokens: DesignTokens): EmailPaint {
  const c = emailTokenOf(tokens);
  const colour = (key: string, fallback: string) => {
    const value = c(key, "");
    return /^#(?:[0-9a-f]{3,8})$/i.test(value) ? value : fallback;
  };
  return {
    canvas: brandHex(brand, EMAIL_ROLES.canvas) || colour("colorBgLayout", "#ffffff"),
    card: brandHex(brand, EMAIL_ROLES.card) || colour("colorBgContainer", "#ffffff"),
    ink: brandHex(brand, EMAIL_ROLES.ink) || colour("colorText", "#111111"),
    muted: brandHex(brand, EMAIL_ROLES.muted) || colour("colorTextSecondary", "#444444"),
    hairline: brandHex(brand, EMAIL_ROLES.hairline) || colour("colorBorder", "#dddddd"),
    accent: brandHex(brand, EMAIL_ROLES.accent) || colour("colorPrimary", "#111111"),
    accentDeep: brandHex(brand, EMAIL_ROLES.accentDeep) || colour("colorPrimaryHover", "#111111"),
  };
}

/** Swaps the generated `var(--brand-*)` references in the document shell for literals. */
function literalise(html: string, tokens: DesignTokens, paint: EmailPaint): string {
  const overrides: Record<string, string> = {
    colorBgLayout: paint.canvas,
    colorBgContainer: paint.card,
    colorText: paint.ink,
    colorTextSecondary: paint.muted,
    colorBorder: paint.hairline,
    colorBorderSecondary: paint.hairline,
    colorLink: paint.accent,
    colorPrimary: paint.accent,
  };
  const t = emailTokenOf(tokens);
  return html.replace(/var\(--brand-([a-z0-9-]+)\)/g, (whole, slug: string) => {
    const key = slug
      .split("-")
      .map((part, index) =>
        index === 0 ? part : (TOKEN_ALIASES[part] ?? part[0].toUpperCase() + part.slice(1)),
      )
      .join("");
    return overrides[key] ?? t(key, whole);
  });
}

/** Brand logo when the brand has one, wordmark otherwise. */
function emailHeader(brand: Brand, paint: EmailPaint, t: EmailToken): string {
  const file = trimmed(brand.logo?.primary);
  if (!file) {
    return `<span style="font-family:var(--display-family);font-weight:${t("fontWeightStrong")};font-size:${t("fontSizeLG")};letter-spacing:-0.01em;color:${paint.ink};white-space:nowrap;">${esc(brand.name)}</span>`;
  }
  const src = `../../${file.replace(/^\.?\//, "")}`;
  return `<img src="${esc(src)}" alt="${esc(brand.name)}" width="40" height="40" style="display:block;margin:0 auto;border:0;outline:none;text-decoration:none;width:40px;height:40px;" />`;
}


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
/** A proof point only when the brand actually supplies one — never invented. */
function proofBlock(brand: Brand, paint: EmailPaint, t: EmailToken): string {
  const quote = trimmed(brand.testimonial?.quote);
  const name = trimmed(brand.testimonial?.name);
  if (!quote || !name) return "";
  const role = trimmed(brand.testimonial?.role);
  return `            <tr>
              <td style="padding:0 ${t("sizeXL")} ${t("sizeLG")};">
                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">
                  <tr>
                    <td style="padding:${t("sizeLG")};background:${paint.canvas};border-left:3px solid ${paint.accent};border-radius:${t("borderRadius")};">
                      <p style="margin:0 0 ${t("sizeSM")};font-family:${t("fontFamily")};font-size:${t("fontSizeLG")};line-height:1.55;color:${paint.ink};">&ldquo;${esc(quote)}&rdquo;</p>
                      <p style="margin:0;font-family:${t("fontFamily")};font-size:${t("fontSizeSM")};color:${paint.muted};"><strong style="color:${paint.ink};font-weight:${t("fontWeightStrong")};">${esc(name)}</strong>${role ? ` &middot; ${esc(role)}` : ""}</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
`;
}

// ─────────────────────────── markup helpers (email-local) ───────────────────

/**
 * Bulletproof CTA button: a `bgcolor` <td> with an inline-styled <a>. No
 * background image, ≥44px tall, fully styled so it renders even when images
 * and remote CSS are blocked. Every value is a literal: presentational
 * attributes and <style>-stripping clients resolve no custom properties.
 */
function bulletproofButton(label: string, style: EmailButtonStyle): string {
  const bg = style.inverse ? style.onAccent : style.accent;
  const fg = style.inverse ? style.accent : style.onAccent;
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:0 auto;border-collapse:separate;line-height:100%;">
                    <tr>
                      <td align="center" bgcolor="${bg}" style="background-color:${bg};border-radius:${style.radius};">
                        <a href="#" target="_blank" style="display:inline-block;min-width:200px;padding:16px ${style.padX};font-family:${style.fontFamily};font-size:${style.fontSize};font-weight:${style.fontWeight};line-height:1.1;color:${fg};background-color:${bg};text-decoration:none;text-align:center;border-radius:${style.radius};border:2px solid ${bg};">${esc(label)}</a>
                      </td>
                    </tr>
                  </table>`;
}

/** Small line-SVG check glyph in the brand accent — no emoji, scales with type. */
function checkGlyph(color: string): string {
  return `<svg width="20" height="20" viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" style="display:block;" aria-hidden="true"><circle cx="10" cy="10" r="9" stroke="${color}" stroke-width="1.5" opacity="0.45"/><path d="M6 10.2l2.6 2.6L14.2 7.4" stroke="${color}" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

/** A single numbered/checked benefit row inside the body table. */
function benefitRow(b: { title: string; body: string }, paint: EmailPaint, t: EmailToken): string {
  return `<tr>
                <td valign="top" style="width:40px;padding:${t("sizeSM")} ${t("sizeSM")} ${t("sizeSM")} 0;">${checkGlyph(paint.accent)}</td>
                <td valign="top" style="padding:${t("sizeSM")} 0;">
                  <p style="margin:0 0 4px;font-family:${t("fontFamily")};font-size:${t("fontSizeLG")};font-weight:${t("fontWeightStrong")};color:${paint.ink};line-height:1.3;">${esc(cap(b.title))}</p>
                  <p style="margin:0;font-family:${t("fontFamily")};font-size:16px;color:${paint.muted};line-height:1.55;">${esc(cap(b.body))}</p>
                </td>
              </tr>`;
}

/** Compliance footer: brand colours, ≥4.5:1, and no address the brand never gave. */
function compliantFooter(brand: Brand, paint: EmailPaint, t: EmailToken): string {
  const link = (label: string) =>
    `<a href="#" target="_blank" style="color:${paint.muted};text-decoration:underline;">${esc(label)}</a>`;
  return `<tr>
            <td style="padding:${t("sizeXL")} ${t("sizeXL")};background:${paint.canvas};border-top:${t("lineWidth")} solid ${paint.hairline};text-align:center;">
              <p style="margin:0 0 ${t("sizeXS")};font-family:${t("fontFamily")};font-size:${t("fontSizeSM")};color:${paint.muted};line-height:1.5;">You are receiving this because you signed up to hear from ${esc(brand.name)}.</p>
              <p style="margin:0 0 ${t("sizeXS")};font-family:${t("fontFamily")};font-size:${t("fontSizeSM")};color:${paint.muted};line-height:1.5;">${link("Update preferences")} &nbsp;&middot;&nbsp; ${link("Unsubscribe")}</p>
              <p style="margin:0;font-family:${t("fontFamily")};font-size:${t("fontSizeSM")};color:${paint.muted};line-height:1.5;">&copy; ${esc(brand.name)}</p>
            </td>
          </tr>`;
}

// ─────────────────────────── renderer ───────────────────────────────────────

export function renderEmail(brand: Brand, tokens: DesignTokens): string {
  const t = emailTokenOf(tokens);
  const paint = emailPaint(brand, tokens);
  const cta = ctaLabel(brand);
  const rows = benefits(brand)
    .map((b) => benefitRow(b, paint, t))
    .join("\n");

  // The visual email: a centered 600px table on the brand's own page colour. All
  // structural styling is inline so it survives <style>-stripping clients, and
  // every value is a literal: the document() shell adds no token block.
  const body = `    <!-- hidden preheader: earns the open, complements the subject, never repeats it -->
    <div style="display:none;max-height:0;overflow:hidden;mso-hide:all;font-size:1px;line-height:1px;color:${paint.canvas};opacity:0;">${esc(preheader(brand))}</div>
    <!-- whitespace eater so the body copy does not leak into the inbox preview -->
    <div style="display:none;max-height:0;overflow:hidden;">&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;&#847;&#8204;&#160;</div>

    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="background:${paint.canvas};margin:0;padding:0;">
      <tr>
        <td align="center" style="padding:${t("sizeXL")} ${t("sizeMD")};">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;background:${paint.card};border:${t("lineWidth")} solid ${paint.hairline};border-radius:${t("borderRadiusLG")};overflow:hidden;">

            <!-- Header: logo only, generous whitespace, no nav -->
            <tr>
              <td style="padding:${t("sizeLG")} ${t("sizeXL")};text-align:center;border-bottom:${t("lineWidth")} solid ${paint.hairline};">
                ${emailHeader(brand, paint, t)}
              </td>
            </tr>

            <!-- Hero: inverted pyramid — conclusion first, then why it matters, then the one CTA -->
            <tr>
              <td style="padding:${t("sizeXXL")} ${t("sizeXL")} ${t("sizeLG")};text-align:center;background:${paint.canvas};">
                <p style="margin:0 0 ${t("sizeSM")};font-family:${t("fontFamily")};letter-spacing:0.01em;font-size:${t("fontSizeSM")};font-weight:${t("fontWeightStrong")};color:${paint.accentDeep};">${esc(
                  cap(brand.voice.adjectives[0] ?? "Announcement"),
                )}</p>
                <h1 style="margin:0 0 ${t("sizeMD")};font-family:var(--display-family);font-size:${t("fontSizeHeading2")};line-height:1.15;letter-spacing:-0.015em;color:${paint.ink};">${esc(
                  cap(leadClaim(brand)),
                )}</h1>
                <p style="margin:0 auto ${t("sizeXL")};max-width:46ch;font-family:${t("fontFamily")};font-size:${t("fontSizeLG")};line-height:1.55;color:${paint.muted};">${esc(
                  heroSupport(brand),
                )}</p>
                <!-- the one primary CTA, above the fold -->
                ${bulletproofButton(cta, {
    accent: paint.accent,
    onAccent: paint.card,
    radius: t("borderRadiusLG", "12px"),
    padX: t("sizeXL", "32px"),
    fontFamily: t("fontFamily", "sans-serif"),
    fontSize: t("fontSizeLG", "16px"),
    fontWeight: t("fontWeightStrong", "600"),
  })}
              </td>
            </tr>

            <!-- Body: scannable, human, one idea per block -->
            <tr>
              <td style="padding:${t("sizeXL")} ${t("sizeXL")} ${t("sizeSM")};">
                <p style="margin:0 0 ${t("sizeMD")};font-family:${t("fontFamily")};font-size:16px;line-height:1.6;color:${paint.ink};">Hi there,</p>
                <p style="margin:0 0 ${t("sizeLG")};font-family:${t("fontFamily")};font-size:16px;line-height:1.6;color:${paint.muted};">Here is what ${esc(
                  brand.name,
                )} gives your team from the first day — no migration project, no setup tax:</p>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
${rows}
                </table>
              </td>
            </tr>

            ${proofBlock(brand, paint, t)}

            <!-- CTA repeated once near the end — same single action -->
            <tr>
              <td style="padding:${t("sizeSM")} ${t("sizeXL")} ${t("sizeXL")};text-align:center;">
                ${bulletproofButton(cta, {
    accent: paint.accent,
    onAccent: paint.card,
    radius: t("borderRadiusLG", "12px"),
    padX: t("sizeXL", "32px"),
    fontFamily: t("fontFamily", "sans-serif"),
    fontSize: t("fontSizeLG", "16px"),
    fontWeight: t("fontWeightStrong", "600"),
  })}
                <p style="margin:${t("sizeMD")} 0 0;font-family:${t("fontFamily")};font-size:${t("fontSizeSM")};color:${paint.muted};line-height:1.5;">Questions? Just reply to this email — a real person reads every message.</p>
              </td>
            </tr>

            <!-- Footer: working unsubscribe + physical address placeholder + brand -->
${compliantFooter(brand, paint, t)}

          </table>
        </td>
      </tr>
    </table>`;

  return literalise(
    document({
      title: subjectLine(brand),
      tokens,
      brand,
      body,
      fontLinks: false,
      kitCss: false,
      cssVariables: false,
      css: "img{border:0;outline:none;text-decoration:none;}table{border-spacing:0;}",
    }),
    tokens,
    paint,
  );
}
