// @ts-nocheck
/**
 * landing — a long, single-goal marketing page that follows the project's
 * content-structure playbook (docs/content-structures/landing-page.md) to the
 * letter. The 12-module order, top to bottom:
 *
 *   1  Nav            logo + minimal anchors + one accent CTA
 *   2  Hero           the 5-piece value prop (formula headline, subhead,
 *                     primary + ghost CTA, product mock, micro-trust)
 *   3  Social proof   logo wall / rating / specific numbers, hugging the hero
 *   4  Problem (PAS)  name the pain in the reader's words, then agitate it
 *   5  Value pillars  exactly 3, written FAB so the card shows the BENEFIT
 *   6  How it works   3 steps, drawn with div/SVG (no screenshots)
 *   7  Features       zig-zag deep-dive, title = benefit, body = how
 *   8  Proof          stat band + named testimonials with results
 *   9  Objection      FAQ that pre-answers the buying worries
 *  10  Pricing        3 tiers, middle highlighted (anchoring)
 *  11  Final CTA      the page's strongest accent — one last, big ask
 *  12  Footer         grey, small, restrained — never competes with the CTA
 *
 * Page skeleton = AIDA; the Problem block = PAS (P+A) handing off to the Value
 * block (S); every feature = FAB landing on B. Backgrounds alternate between
 * `--brand-color-bg-layout` and `--brand-color-bg-container`; the accent budget
 * keeps the loudest accent for module 11, with a calmer inline CTA recurring
 * about every 1.5 screens so the reader never has to scroll back for a button.
 *
 * It is a SLOT TEMPLATE: every text slot is pulled from brand fields (name /
 * tagline / description / voice.adjectives / voice.tone / voice.messagingPillars
 * / voice.vocabulary) with production-quality fallbacks, so different brands
 * fill the SAME premium structure with their own words. Pure & deterministic:
 * `(brand, tokens) -> string`, no network / Date / random.
 */

import { button, tag, accordion, testimonial, pricingCard } from "../kit.js";
import type { Brand } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import {
  esc,
  document,
  cap,
  brandTagline,
  brandBlurb,
  sourceHost,
  featureCards,
  howSteps,
  faqItems,
  pricingTiers,
  quoteCards,
  partnerNames,
  statItems,
  pillarTitles,
  wordmark,
  inverseButton,
  sectionHead,
} from "./_shared.js";

// ─────────────────────────── single source of CTA copy ──────────────────────
// "One page, one goal": every CTA on the page points at the SAME action. We
// keep the verb in one place so the whole page stays consistent.

const CTA_PRIMARY = "Get started free";
const CTA_GHOST = "See how it works";
const MICRO_TRUST = "Free plan · No credit card · 2-minute setup";

// ─────────────────────────── landing-specific css ───────────────────────────

const LANDING_CSS = `
      .nav-links { display: flex; gap: 28px; align-items: center; color: var(--brand-color-text-secondary); }
      .nav-links a { color: var(--brand-color-text-secondary); transition: color .15s ease; }
      .nav-links a:hover { color: var(--brand-color-text); }
      @media (max-width: 820px) { .nav-links { display: none; } }
      .section { padding: clamp(64px, 9vw, 104px) 0; }
      .section-head { max-width: 680px; margin: 0 auto 48px; text-align: center; }
      .pillars { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(16px, 2vw, 24px); }
      @media (max-width: 880px) { .pillars { grid-template-columns: 1fr; } }
      .grid-3 { display: grid; grid-template-columns: repeat(auto-fit, minmax(280px, 1fr)); gap: 20px; align-items: stretch; }
      .problem-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: clamp(14px, 1.8vw, 20px); }
      @media (max-width: 880px) { .problem-grid { grid-template-columns: 1fr; } }
      .zig { display: grid; grid-template-columns: 1fr 1fr; gap: clamp(32px, 5vw, 72px); align-items: center; }
      .zig + .zig { margin-top: clamp(48px, 7vw, 96px); }
      @media (max-width: 880px) { .zig { grid-template-columns: 1fr; gap: 28px; } .zig .zig-visual { order: -1; } }
      .footer-cols { display: grid; grid-template-columns: 2fr 1fr 1fr 1fr; gap: 32px; }
      @media (max-width: 760px) { .footer-cols { grid-template-columns: 1fr 1fr; } }
      .mock-grid { display: grid; grid-template-columns: 200px minmax(0, 1fr); min-height: 300px; }
      @media (max-width: 720px) { .mock-grid { grid-template-columns: minmax(0, 1fr); } .mock-side { display: none; } }
      .hero-trust { display: flex; align-items: center; justify-content: center; gap: 10px; flex-wrap: wrap; }
`;

// ─────────────────────────── small line-SVG motifs (no emoji) ────────────────
// A tiny family of 1.6px-stroke glyphs that inherit the current color, so the
// only color choices come from the tokens. Indexed so each card gets a
// different-but-consistent mark.

function lineIcon(index: number): string {
  const stroke = `fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"`;
  const paths = [
    `<path d="M5 12l4 4 10-10" ${stroke}/>`, // check
    `<path d="M12 3v18M3 12h18" ${stroke}/>`, // plus / build
    `<circle cx="11" cy="11" r="6" ${stroke}/><path d="M20 20l-4-4" ${stroke}/>`, // search / insight
    `<path d="M4 13l5 5L20 6" ${stroke}/><path d="M4 7l3 3" ${stroke}/>`, // double-check / speed
    `<rect x="4" y="4" width="16" height="16" rx="3" ${stroke}/><path d="M9 12h6M12 9v6" ${stroke}/>`, // module
    `<path d="M12 2l3 6 7 .9-5 4.7 1.3 6.9L12 18l-6.3 3.5L7 14.6 2 9.9 9 9z" ${stroke}/>`, // star / quality
    `<path d="M4 12a8 8 0 1116 0 8 8 0 01-16 0z" ${stroke}/><path d="M12 8v4l3 2" ${stroke}/>`, // clock / time
    `<path d="M3 12h4l3 8 4-16 3 8h4" ${stroke}/>`, // pulse / scale
  ];
  return `<svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" style="display:block;">${
    paths[index % paths.length]
  }</svg>`;
}

/** A small "blueprint" line-grid panel — the on-brand stand-in for a screenshot
 *  in the How-it-works steps (drawn from div/SVG, never a stock photo). */
function stepGlyph(index: number): string {
  const c = varRef("colorPrimary");
  const faint = varRef("colorBorderSecondary");
  const bars = [
    `<rect x="14" y="40" width="92" height="9" rx="4.5" fill="${faint}"/><rect x="14" y="58" width="58" height="9" rx="4.5" fill="${faint}"/><rect x="14" y="80" width="40" height="14" rx="7" fill="${c}"/>`,
    `<rect x="14" y="38" width="44" height="38" rx="6" fill="none" stroke="${faint}" stroke-width="2"/><rect x="66" y="38" width="44" height="38" rx="6" fill="none" stroke="${c}" stroke-width="2"/><rect x="14" y="84" width="96" height="9" rx="4.5" fill="${faint}"/>`,
    `<path d="M16 70l20 16 28-44" fill="none" stroke="${c}" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/><rect x="72" y="44" width="38" height="9" rx="4.5" fill="${faint}"/><rect x="72" y="64" width="26" height="9" rx="4.5" fill="${faint}"/>`,
  ];
  return `<svg viewBox="0 0 124 108" width="100%" height="100%" preserveAspectRatio="xMidYMid meet" aria-hidden="true">${
    bars[index % bars.length]
  }</svg>`;
}

// ─────────────────────────── hero product mock ──────────────────────────────
/** Abstract on-brand product mock: a browser frame with skeleton UI + chart.
 *  This is the hero "visual" — a glimpse of the product, never a stock photo. */
function productMock(brand: Brand): string {
  const bars = [42, 68, 54, 82, 64, 96, 72, 58]
    .map(
      (h, i) =>
        `<div style="flex:1;height:${h}%;border-radius:4px 4px 0 0;background:var(--brand-primary-palette-${(i % 4) + 4});"></div>`,
    )
    .join("");
  const skel = (w: string, h = "10px") =>
    `<div style="width:${w};height:${h};border-radius:5px;background:${varRef("colorFillSecondary")};"></div>`;
  const navRow = (active = false) =>
    `<div style="display:flex;align-items:center;gap:8px;padding:7px 10px;border-radius:${varRef(
      "borderRadiusSM",
    )};${active ? `background:${varRef("colorPrimaryBg")};` : ""}">
      <div style="width:14px;height:14px;border-radius:4px;background:${active ? varRef("colorPrimary") : varRef("colorFill")};"></div>
      ${skel(active ? "64%" : "52%", "8px")}
    </div>`;

  return `<div style="border:${varRef("lineWidth")} solid ${varRef(
    "colorBorderSecondary",
  )};border-radius:14px;overflow:hidden;background:${varRef(
    "colorBgContainer",
  )};box-shadow:0 32px 80px -24px ${varRef("colorFillSecondary")};">
        <div style="display:flex;align-items:center;gap:8px;padding:12px 16px;border-bottom:${varRef(
          "lineWidth",
        )} solid ${varRef("colorBorderSecondary")};background:${varRef("colorFillQuaternary")};">
          <span style="width:10px;height:10px;border-radius:50%;background:${varRef("colorError")};opacity:.55;"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:${varRef("colorWarning")};opacity:.55;"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:${varRef("colorSuccess")};opacity:.55;"></span>
          <span style="flex:1;max-width:380px;margin-left:12px;height:22px;border-radius:11px;background:${varRef(
            "colorFillTertiary",
          )};display:flex;align-items:center;padding:0 12px;font-size:11px;color:${varRef(
            "colorTextQuaternary",
          )};overflow:hidden;white-space:nowrap;">${esc(sourceHost(brand))}</span>
        </div>
        <div class="mock-grid">
          <div class="mock-side" style="border-right:${varRef("lineWidth")} solid ${varRef(
            "colorBorderSecondary",
          )};padding:16px 12px;display:flex;flex-direction:column;gap:4px;">
            ${navRow(true)}${navRow()}${navRow()}${navRow()}
          </div>
          <div style="padding:20px;display:flex;flex-direction:column;gap:16px;min-width:0;">
            <div style="display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap;">
              ${skel("180px", "14px")}
              <div style="width:96px;height:28px;border-radius:${varRef("borderRadius")};background:${varRef(
                "colorPrimary",
              )};"></div>
            </div>
            <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:16px;flex:1;">
              <div style="border:${varRef("lineWidth")} solid ${varRef(
                "colorBorderSecondary",
              )};border-radius:${varRef(
                "borderRadiusLG",
              )};padding:16px;display:flex;align-items:flex-end;gap:8px;min-height:160px;">${bars}</div>
              <div style="display:flex;flex-direction:column;gap:12px;">
                <div style="border:${varRef("lineWidth")} solid ${varRef(
                  "colorBorderSecondary",
                )};border-radius:${varRef(
                  "borderRadiusLG",
                )};padding:14px;display:flex;flex-direction:column;gap:8px;">${skel("40%", "8px")}${skel("70%", "14px")}</div>
                <div style="border:${varRef("lineWidth")} solid ${varRef(
                  "colorBorderSecondary",
                )};border-radius:${varRef(
                  "borderRadiusLG",
                )};padding:14px;display:flex;flex-direction:column;gap:8px;">${skel("46%", "8px")}${skel("60%", "14px")}</div>
              </div>
            </div>
          </div>
        </div>
      </div>`;
}

// ─────────────────────────── landing-specific copy slots ────────────────────
// All slots resolve to brand fields first, then a tasteful fallback. Never
// lorem ipsum — the fallbacks read like real product copy.

/** Pull a usable adjective for headline math, lowercased. */
function adjective(brand: Brand, i: number, fallback: string): string {
  const list = brand.voice.adjectives.map((a) => a.trim().toLowerCase()).filter(Boolean);
  return list.length ? list[i % list.length] : fallback;
}

/** Hero headline — the value-prop formula `help {who} {do} {result}`. Prefer a
 *  real tagline / first pillar; otherwise build a result-led line, never a
 *  category boast ("the leading AI platform"). */
function heroHeadline(brand: Brand): string {
  const tagline = brand.tagline?.trim();
  if (tagline) return tagline;
  const pillar = pillarTitles(brand)[0];
  if (pillar) return pillar;
  return `Ship ${adjective(brand, 0, "polished")} work from ${brand.name}, without the busywork`;
}

/** Hero subhead — 1–2 sentences that ground HOW / for WHOM. */
function heroSubhead(brand: Brand): string {
  const desc = brand.description?.trim();
  if (desc) return desc;
  const tone = brand.voice.tone?.trim();
  if (tone) return tone;
  return `${brand.name} gives your team one place to go from idea to launch — ${adjective(
    brand,
    0,
    "fast",
  )}, ${adjective(brand, 1, "consistent")}, and built to scale with you.`;
}

/** Eyebrow / kicker above the hero headline. */
function heroEyebrow(brand: Brand): string {
  const adj = brand.voice.adjectives.slice(0, 3).map(cap).join(" · ");
  return adj || `Introducing ${brand.name}`;
}

/** Problem block (PAS · P+A): up to 3 pains in the reader's own words. */
function problemCards(brand: Brand): Array<{ pain: string; cost: string }> {
  const avoid = brand.voice.vocabulary.avoid.map((w) => w.trim()).filter(Boolean);
  const fromAvoid = avoid.slice(0, 3).map((w) => ({
    pain: `Stuck with ${w.toLowerCase()}`,
    cost: `Every week it costs you time, momentum and a little more trust from the team.`,
  }));
  const fallbacks = [
    {
      pain: "Every deliverable starts from scratch",
      cost: "So the same work gets redone, the backlog grows, and shipping slips by days.",
    },
    {
      pain: "The tools don't talk to each other",
      cost: "Context lives in five tabs, hand-offs break, and nobody trusts the source of truth.",
    },
    {
      pain: "Quality drifts as you scale",
      cost: "What looked sharp at ten people looks inconsistent at fifty — and customers notice.",
    },
  ];
  return [...fromAvoid, ...fallbacks].slice(0, 3);
}

/** The agitate line that sits above the problem cards (PAS · A → hands to S). */
function agitateLine(brand: Brand): string {
  return `Sound familiar? The longer it goes unfixed, the more it quietly taxes everything ${brand.name} is supposed to make easy.`;
}

/** Exactly 3 value pillars, written FAB — the card body shows the BENEFIT. */
function valuePillars(brand: Brand): Array<{ title: string; body: string }> {
  return featureCards(brand).slice(0, 3);
}

/** Deep-dive features (zig-zag) — the rest of the feature set, title = benefit. */
function deepFeatures(brand: Brand): Array<{ title: string; body: string }> {
  const all = featureCards(brand);
  const rest = all.slice(3);
  return (rest.length >= 2 ? rest : all).slice(0, 3);
}

export function renderLanding(brand: Brand, tokens: DesignTokens): string {
  // ── module 5 · value pillars (FAB, show the Benefit) ──────────────────────
  const pillars = valuePillars(brand)
    .map(
      (f, i) => `<div style="background:${varRef("colorBgContainer")};border:${varRef(
        "lineWidth",
      )} solid ${varRef("colorBorderSecondary")};border-radius:${varRef(
        "borderRadiusLG",
      )};padding:${varRef("sizeXL")};box-shadow:0 1px 2px ${varRef(
        "colorFillQuaternary",
      )};display:flex;flex-direction:column;">
          <div style="display:inline-flex;align-items:center;justify-content:center;width:44px;height:44px;border-radius:12px;background:${varRef(
            "colorPrimaryBg",
          )};color:${varRef("colorPrimary")};margin-bottom:${varRef(
            "sizeMD",
          )};">${lineIcon(i)}</div>
          <h3 class="clamp-2" style="font-size:${varRef("fontSizeHeading4")};margin-bottom:${varRef(
            "sizeXS",
          )};">${esc(f.title)}</h3>
          <p class="clamp-3" style="color:${varRef("colorTextSecondary")};">${esc(f.body)}</p>
        </div>`,
    )
    .join("\n        ");

  // ── module 4 · problem (PAS · P+A) ────────────────────────────────────────
  const problems = problemCards(brand)
    .map(
      (p) => `<div style="background:${varRef("colorBgContainer")};border:${varRef(
        "lineWidth",
      )} solid ${varRef("colorBorderSecondary")};border-radius:${varRef(
        "borderRadiusLG",
      )};padding:${varRef("sizeXL")};">
          <div style="display:flex;align-items:flex-start;gap:${varRef("sizeSM")};">
            <span style="flex:0 0 auto;width:8px;height:8px;border-radius:50%;margin-top:9px;background:${varRef(
              "colorError",
            )};"></span>
            <div>
              <h3 style="font-size:${varRef("fontSizeLG")};margin-bottom:${varRef(
                "sizeXXS",
              )};">${esc(p.pain)}</h3>
              <p class="clamp-3" style="color:${varRef("colorTextTertiary")};font-size:${varRef(
                "fontSize",
              )};">${esc(p.cost)}</p>
            </div>
          </div>
        </div>`,
    )
    .join("\n        ");

  // ── module 6 · how it works (3 steps, drawn glyphs) ───────────────────────
  const how = howSteps(brand)
    .map(
      (s, i) => `<div style="display:flex;flex-direction:column;gap:${varRef("sizeMD")};">
          <div style="aspect-ratio:124/108;border:${varRef("lineWidth")} solid ${varRef(
            "colorBorderSecondary",
          )};border-radius:${varRef("borderRadiusLG")};background:${varRef(
            "colorBgLayout",
          )};padding:${varRef("sizeLG")};">${stepGlyph(i)}</div>
          <div>
            <div style="display:flex;align-items:center;gap:${varRef("sizeSM")};margin-bottom:${varRef(
              "sizeXS",
            )};">
              <span style="display:inline-flex;align-items:center;justify-content:center;width:26px;height:26px;border-radius:50%;background:${varRef(
                "colorPrimary",
              )};color:#fff;font-size:${varRef("fontSizeSM")};font-weight:${varRef(
                "fontWeightStrong",
              )};">${i + 1}</span>
              <h3 style="font-size:${varRef("fontSizeHeading4")};">${esc(s.title)}</h3>
            </div>
            <p style="color:${varRef("colorTextSecondary")};max-width:34ch;">${esc(s.body)}</p>
          </div>
        </div>`,
    )
    .join("\n        ");

  // ── module 7 · features (zig-zag deep dive) ───────────────────────────────
  const zig = deepFeatures(brand)
    .map((f, i) => {
      const visual = `<div class="zig-visual" style="border:${varRef("lineWidth")} solid ${varRef(
        "colorBorderSecondary",
      )};border-radius:${varRef("borderRadiusLG")};background:${varRef(
        "colorBgContainer",
      )};box-shadow:0 8px 28px -16px ${varRef(
        "colorFillSecondary",
      )};padding:${varRef("sizeXL")};min-height:240px;display:flex;flex-direction:column;gap:${varRef(
        "sizeMD",
      )};">
            <div style="display:inline-flex;align-items:center;justify-content:center;width:40px;height:40px;border-radius:11px;background:${varRef(
              "colorPrimaryBg",
            )};color:${varRef("colorPrimary")};">${lineIcon(i + 3)}</div>
            <div style="height:12px;width:70%;border-radius:6px;background:${varRef(
              "colorFillSecondary",
            )};"></div>
            <div style="height:12px;width:52%;border-radius:6px;background:${varRef(
              "colorFillTertiary",
            )};"></div>
            <div style="margin-top:auto;display:flex;gap:${varRef("sizeSM")};">
              <div style="flex:1;height:64px;border-radius:${varRef(
                "borderRadius",
              )};background:${varRef("colorPrimaryBg")};"></div>
              <div style="flex:1;height:64px;border-radius:${varRef(
                "borderRadius",
              )};border:${varRef("lineWidth")} solid ${varRef("colorBorderSecondary")};"></div>
            </div>
          </div>`;
      const text = `<div>
            <span class="kicker">${esc(`Capability 0${i + 1}`)}</span>
            <h3 style="font-size:clamp(22px,2.6vw,30px);letter-spacing:-0.015em;margin-bottom:${varRef(
              "sizeSM",
            )};">${esc(f.title)}</h3>
            <p style="color:${varRef("colorTextSecondary")};font-size:${varRef(
              "fontSizeLG",
            )};max-width:46ch;">${esc(f.body)}</p>
            <div style="margin-top:${varRef("sizeLG")};">
              ${button({ label: "Learn more", type: "link", size: "md" })}
            </div>
          </div>`;
      // Alternate text/visual order for the zig-zag rhythm.
      return `<div class="zig">${i % 2 === 0 ? text + visual : visual + text}</div>`;
    })
    .join("\n        ");

  // ── module 8 · proof (stat band + testimonials) ───────────────────────────
  const statsBand = statItems()
    .map(
      (s) => `<div style="text-align:center;">
          <div style="font-family:var(--display-family);font-size:clamp(30px,3.6vw,46px);font-weight:${varRef(
            "fontWeightStrong",
          )};line-height:1.05;color:#fff;letter-spacing:-0.02em;">${esc(s.value)}</div>
          <div style="margin-top:${varRef("sizeXXS")};font-size:${varRef(
            "fontSizeSM",
          )};color:rgba(255,255,255,0.78);">${esc(s.label)}</div>
        </div>`,
    )
    .join("\n        ");

  const testimonials = quoteCards(brand)
    .map((q) => testimonial(q))
    .join("\n        ");

  // ── module 3 · social proof bar (logo wall) ───────────────────────────────
  const partners = partnerNames(brand)
    .map(
      (n) =>
        `<span style="font-family:var(--display-family);font-weight:${varRef(
          "fontWeightStrong",
        )};font-size:${varRef("fontSizeLG")};color:${varRef(
          "colorTextQuaternary",
        )};letter-spacing:0.02em;white-space:nowrap;">${esc(n)}</span>`,
    )
    .join("\n        ");

  // ── module 10 · pricing ───────────────────────────────────────────────────
  const pricing = pricingTiers(brand)
    .map((t) => pricingCard(t))
    .join("\n        ");

  // ── module 12 · footer ────────────────────────────────────────────────────
  const footerCol = (title: string, items: string[]) => `<div>
          <div style="font-weight:${varRef("fontWeightStrong")};font-size:${varRef(
            "fontSizeSM",
          )};text-transform:uppercase;letter-spacing:0.08em;color:${varRef(
            "colorTextTertiary",
          )};margin-bottom:${varRef("sizeMD")};">${esc(title)}</div>
          <div style="display:flex;flex-direction:column;gap:${varRef("sizeXS")};">
            ${items.map((i) => `<a href="#" style="color:${varRef("colorTextSecondary")};">${esc(i)}</a>`).join("\n            ")}
          </div>
        </div>`;

  const adjectivesLine = brand.voice.adjectives.slice(0, 3).map(cap).join(" · ");

  // small inline ratings row reused under the hero (specific = credible)
  const stars = `<span style="color:${varRef("colorWarning")};letter-spacing:2px;">★★★★★</span>`;

  const body = `    <header style="position:sticky;top:0;z-index:20;background:color-mix(in srgb, ${varRef(
    "colorBgContainer",
  )} 86%, transparent);backdrop-filter:blur(12px);border-bottom:${varRef("lineWidth")} solid ${varRef(
    "colorBorderSecondary",
  )};">
      <div class="wrap" style="display:flex;align-items:center;justify-content:space-between;height:64px;gap:${varRef(
        "sizeLG",
      )};">
        ${wordmark(brand)}
        <nav class="nav-links">
          <a href="#how">How it works</a>
          <a href="#features">Features</a>
          <a href="#pricing">Pricing</a>
          <a href="#faq">FAQ</a>
        </nav>
        <div style="display:flex;gap:${varRef("sizeSM")};align-items:center;">
          ${button({ label: "Sign in", type: "text", size: "sm" })}
          ${button({ label: CTA_PRIMARY, type: "primary", size: "sm" })}
        </div>
      </div>
    </header>

    <!-- 2 · HERO — the 5-piece value prop -->
    <main>
    <section class="wrap" style="padding-top:clamp(56px, 9vw, 108px);text-align:center;">
      <div style="max-width:860px;margin:0 auto;">
        ${tag({ label: heroEyebrow(brand) })}
        <h1 style="font-size:clamp(36px, 5.6vw, 64px);letter-spacing:-0.025em;line-height:1.06;margin:${varRef(
          "sizeLG",
        )} auto ${varRef("sizeMD")};max-width:18ch;">${esc(heroHeadline(brand))}</h1>
        <p style="font-size:${varRef("fontSizeXL")};color:${varRef(
          "colorTextSecondary",
        )};max-width:62ch;margin:0 auto ${varRef("sizeXL")};line-height:1.5;">${esc(
          heroSubhead(brand),
        )}</p>
        <div style="display:flex;gap:${varRef("sizeSM")};justify-content:center;flex-wrap:wrap;">
          ${button({ label: CTA_PRIMARY, type: "primary", size: "lg" })}
          ${button({ label: CTA_GHOST, type: "default", size: "lg" })}
        </div>
        <p style="margin-top:${varRef("sizeMD")};font-size:${varRef("fontSizeSM")};color:${varRef(
          "colorTextTertiary",
        )};">${esc(MICRO_TRUST)}</p>
      </div>
      <div style="max-width:980px;margin:clamp(40px, 6vw, 68px) auto 0;">
      ${productMock(brand)}
      </div>
    </section>

    <!-- 3 · SOCIAL PROOF — hugs the hero -->
    <section class="wrap" style="padding:clamp(40px,6vw,64px) 0 8px;">
      <div class="hero-trust" style="margin-bottom:${varRef("sizeLG")};">
        ${stars}
        <span style="font-size:${varRef("fontSizeSM")};color:${varRef(
          "colorTextSecondary",
        )};">Rated 4.9/5 by 12,000+ teams</span>
      </div>
      <p style="text-align:center;text-transform:uppercase;letter-spacing:0.16em;font-size:${varRef(
        "fontSizeSM",
      )};color:${varRef("colorTextQuaternary")};margin-bottom:${varRef("sizeLG")};">Trusted by teams at</p>
      <div style="display:flex;justify-content:center;align-items:center;gap:clamp(24px,5vw,56px);flex-wrap:wrap;opacity:0.9;">
        ${partners}
      </div>
    </section>

    <!-- 4 · PROBLEM — PAS (P + A) -->
    <section class="section">
      <div class="wrap">
        ${sectionHead(
          "The problem",
          "You're not slow. Your setup is.",
          agitateLine(brand),
        )}
        <div class="problem-grid">
        ${problems}
        </div>
      </div>
    </section>

    <!-- 5 · VALUE PILLARS — PAS (S), FAB so each shows the benefit -->
    <section id="value" class="section" style="background:${varRef(
      "colorBgContainer",
    )};border-top:${varRef("lineWidth")} solid ${varRef(
      "colorBorderSecondary",
    )};border-bottom:${varRef("lineWidth")} solid ${varRef("colorBorderSecondary")};">
      <div class="wrap">
        ${sectionHead(
          "Why " + brand.name,
          "Here's how that changes",
          `Three ways ${brand.name} turns the daily grind into something you actually look forward to.`,
        )}
        <div class="pillars">
        ${pillars}
        </div>
      </div>
    </section>

    <!-- 6 · HOW IT WORKS — 3 steps -->
    <section id="how" class="section">
      <div class="wrap">
        ${sectionHead("How it works", "Up and running in three steps", "No migration project. No six-week rollout.")}
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:clamp(24px,4vw,48px);">
        ${how}
        </div>
      </div>
    </section>

    <!-- recurring CTA (~every 1.5 screens) — calm, the loud one is reserved for module 11 -->
    <section class="wrap" style="padding:0 0 clamp(56px,8vw,88px);">
      <div style="border:${varRef("lineWidth")} solid ${varRef(
        "colorPrimaryBorder",
      )};background:${varRef("colorPrimaryBg")};border-radius:clamp(14px,2vw,20px);padding:clamp(24px,4vw,36px) clamp(24px,5vw,48px);display:flex;align-items:center;justify-content:space-between;gap:${varRef(
        "sizeLG",
      )};flex-wrap:wrap;">
        <div style="min-width:0;">
          <h3 style="font-size:clamp(20px,2.4vw,26px);letter-spacing:-0.01em;">See it on your own work in minutes</h3>
          <p style="color:${varRef("colorTextSecondary")};margin-top:${varRef(
            "sizeXXS",
          )};">${esc(MICRO_TRUST)}</p>
        </div>
        ${button({ label: CTA_PRIMARY, type: "primary", size: "lg" })}
      </div>
    </section>

    <!-- 7 · FEATURES — zig-zag deep dive -->
    <section id="features" class="section" style="background:${varRef(
      "colorBgContainer",
    )};border-top:${varRef("lineWidth")} solid ${varRef(
      "colorBorderSecondary",
    )};border-bottom:${varRef("lineWidth")} solid ${varRef("colorBorderSecondary")};">
      <div class="wrap">
        ${sectionHead(
          "A closer look",
          "Built for the way real teams work",
          "Every capability earns its place — and translates to something you can feel.",
        )}
        ${zig}
      </div>
    </section>

    <!-- 8 · PROOF — stat band + testimonials -->
    <section style="background:${varRef("colorPrimary")};padding:clamp(48px,6vw,64px) 0;">
      <div class="wrap" style="display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:${varRef(
        "sizeXL",
      )};">
        ${statsBand}
      </div>
    </section>

    <section class="section">
      <div class="wrap">
        ${sectionHead(
          "Proof",
          "Loved by the teams who use it daily",
          "Real results, in their words — not ours.",
        )}
        <div class="grid-3">
        ${testimonials}
        </div>
      </div>
    </section>

    <!-- 9 · OBJECTION — FAQ -->
    <section id="faq" class="section" style="background:${varRef(
      "colorBgContainer",
    )};border-top:${varRef("lineWidth")} solid ${varRef(
      "colorBorderSecondary",
    )};border-bottom:${varRef("lineWidth")} solid ${varRef("colorBorderSecondary")};">
      <div class="wrap" style="max-width:780px;">
        ${sectionHead("Before you ask", "Your questions, answered")}
        ${accordion({ items: faqItems(brand), open: 0 })}
      </div>
    </section>

    <!-- 10 · PRICING — middle tier highlighted -->
    <section id="pricing" class="section">
      <div class="wrap">
        ${sectionHead("Pricing", "Plans that scale with you", "Start free. Upgrade only when it earns it.")}
        <div class="grid-3" style="max-width:1000px;margin:0 auto;">
        ${pricing}
        </div>
        <p style="text-align:center;margin-top:${varRef("sizeLG")};font-size:${varRef(
          "fontSizeSM",
        )};color:${varRef("colorTextTertiary")};">All prices in USD · Cancel anytime · No credit card to start.</p>
      </div>
    </section>
    </main>

    <!-- 11 · FINAL CTA — the page's strongest accent -->
    <section class="wrap" style="padding-bottom:clamp(64px,9vw,104px);">
      <div style="background:${varRef("colorPrimary")};border-radius:clamp(18px,2.4vw,28px);padding:clamp(48px,7vw,84px) clamp(24px,5vw,64px);text-align:center;position:relative;overflow:hidden;">
        <div style="position:absolute;top:-100px;right:-90px;width:320px;height:320px;border-radius:50%;background:${varRef(
          "colorPrimaryHover",
        )};opacity:0.5;"></div>
        <div style="position:absolute;bottom:-120px;left:-80px;width:260px;height:260px;border-radius:50%;background:${varRef(
          "colorPrimaryActive",
        )};opacity:0.45;"></div>
        <div style="position:relative;">
          <h2 style="color:#fff;font-size:clamp(28px,4vw,46px);letter-spacing:-0.02em;line-height:1.08;margin-bottom:${varRef(
            "sizeMD",
          )};max-width:20ch;margin-left:auto;margin-right:auto;">Start building with ${esc(
            brand.name,
          )} today</h2>
          <p class="clamp-2" style="color:rgba(255,255,255,0.88);font-size:${varRef(
            "fontSizeLG",
          )};max-width:540px;margin:0 auto ${varRef("sizeXL")};">${esc(brandTagline(brand))}</p>
          <div style="display:flex;gap:${varRef("sizeSM")};justify-content:center;flex-wrap:wrap;">
            ${inverseButton(CTA_PRIMARY)}
            <a href="#" style="display:inline-flex;align-items:center;height:${varRef(
              "controlHeightLG",
            )};color:rgba(255,255,255,0.92);font-weight:${varRef(
              "fontWeightStrong",
            )};padding:0 ${varRef("sizeMD")};">Talk to us &rarr;</a>
          </div>
          <p style="margin-top:${varRef("sizeMD")};font-size:${varRef(
            "fontSizeSM",
          )};color:rgba(255,255,255,0.72);">2-minute setup · Cancel anytime</p>
        </div>
      </div>
    </section>

    <!-- 12 · FOOTER — grey, small, restrained -->
    <footer style="background:${varRef("colorBgContainer")};border-top:${varRef(
      "lineWidth",
    )} solid ${varRef("colorBorderSecondary")};padding:clamp(48px,6vw,64px) 0 32px;">
      <div class="wrap">
        <div class="footer-cols">
          <div>
            ${wordmark(brand)}
            <p class="clamp-2" style="color:${varRef("colorTextTertiary")};max-width:36ch;margin-top:${varRef(
              "sizeSM",
            )};font-size:${varRef("fontSizeSM")};">${esc(brandBlurb(brand))}</p>
          </div>
          ${footerCol("Product", ["How it works", "Features", "Pricing", "Changelog"])}
          ${footerCol("Company", ["About", "Blog", "Careers", "Contact"])}
          ${footerCol("Resources", ["Docs", "Support", "Status", "Privacy"])}
        </div>
        <div style="display:flex;justify-content:space-between;align-items:center;gap:${varRef(
          "sizeLG",
        )};flex-wrap:wrap;margin-top:48px;padding-top:${varRef("sizeLG")};border-top:${varRef(
          "lineWidth",
        )} solid ${varRef("colorBorderSecondary")};font-size:${varRef("fontSizeSM")};color:${varRef(
          "colorTextTertiary",
        )};">
          <span>&copy; ${esc(brand.name)} &middot; ${esc(sourceHost(brand))}</span>
          <span>${esc(adjectivesLine || "Generated brand system")}</span>
        </div>
      </div>
    </footer>`;

  return document({
    title: `${brand.name} — ${brandTagline(brand)}`,
    tokens,
    brand,
    body,
    css: LANDING_CSS,
  });
}
