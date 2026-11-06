// @ts-nocheck
/**
 * form — a conversion-tuned signup / contact form.
 *
 * Built to the content-structure playbook (docs/content-structures/form.md):
 * optimize for COMPLETION, not collection. A split layout pairs a value-prompt
 * brand panel (why it's worth filling) with a single-column, top-labelled,
 * minimal-field form: easy → hard ordering, always-visible labels, FAB-style
 * field help, action-specific CTA, a trust line directly under the button, and
 * an explicit success state with a clear next step.
 *
 * Pure & deterministic: every text slot is pulled from the brand with tasteful
 * fallbacks, every color/size comes from `--brand-*` tokens (varRef), and there
 * is no network / Date / Math.random. Signature is unchanged.
 */

import { button } from "../kit.js";
import type { Brand } from "../../schema.js";
import { type DesignTokens, varRef } from "../types.js";
import {
  esc,
  document,
  cap,
  brandBlurb,
  brandTagline,
  sourceHost,
  pillarTitles,
  FEATURE_FALLBACKS,
  wordmark,
} from "./_shared.js";

// ─────────────────────────── form-local helpers ─────────────────────────────

/** Pick the first non-empty trimmed string, else the fallback. */
function firstOf(values: Array<string | undefined>, fallback: string): string {
  for (const v of values) {
    const t = v?.trim();
    if (t) return t;
  }
  return fallback;
}

const labelStyle = `display:flex;align-items:baseline;justify-content:space-between;gap:${varRef(
  "sizeSM",
)};margin-bottom:${varRef("sizeXXS")};font-size:${varRef("fontSizeSM")};font-weight:${varRef(
  "fontWeightStrong",
)};color:${varRef("colorText")};`;

const optionalStyle = `font-weight:400;font-size:${varRef("fontSizeSM")};color:${varRef(
  "colorTextQuaternary",
)};`;

const helpStyle = `margin:${varRef("sizeXXS")} 0 0;font-size:${varRef("fontSizeSM")};color:${varRef(
  "colorTextTertiary",
)};line-height:1.4;`;

const controlBase = `box-sizing:border-box;width:100%;font-family:${varRef(
  "fontFamily",
)};font-size:${varRef("fontSize")};color:${varRef("colorText")};background:${varRef(
  "colorBgContainer",
)};border:${varRef("lineWidth")} solid ${varRef("colorBorder")};border-radius:${varRef(
  "borderRadius",
)};outline:none;`;

const inputBase = `${controlBase}height:${varRef("controlHeightLG")};padding:0 ${varRef("size")};`;

/** Label row with optional "Optional" / "Required" marker, top-aligned (doc §3). */
function fieldLabel(text: string, mark?: "optional" | "required"): string {
  const tag = mark
    ? `<span style="${optionalStyle}">${mark === "optional" ? "Optional" : "Required"}</span>`
    : "";
  return `<label style="${labelStyle}"><span>${esc(text)}</span>${tag}</label>`;
}

/** Always-visible help line — placeholders are examples only, never labels. */
function fieldHelp(text?: string): string {
  return text ? `<p style="${helpStyle}">${esc(text)}</p>` : "";
}

/** A complete labelled text/email input row. The optional `error` line is
 *  hidden until the browser flags `:invalid` on a non-empty value (doc §4:
 *  inline, specific, human, brand-colored — and never on every keystroke). */
function field(opts: {
  label: string;
  type?: string;
  placeholder?: string;
  help?: string;
  error?: string;
  mark?: "optional" | "required";
  inputmode?: string;
  autocomplete?: string;
}): string {
  const type = opts.type ?? "text";
  const ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
  const im = opts.inputmode ? ` inputmode="${esc(opts.inputmode)}"` : "";
  const ac = opts.autocomplete ? ` autocomplete="${esc(opts.autocomplete)}"` : "";
  const err = opts.error ? `<p class="fld-err">${esc(opts.error)}</p>` : "";
  return `<div class="fld">
            ${fieldLabel(opts.label, opts.mark)}
            <input type="${esc(type)}"${ph}${im}${ac} style="${inputBase}">
            ${err}
            ${fieldHelp(opts.help)}
          </div>`;
}

/** A labelled native <select> (doc §3: long lists use a dropdown). */
function selectField(opts: {
  label: string;
  options: string[];
  prompt: string;
  help?: string;
  mark?: "optional" | "required";
}): string {
  const arrow = `background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='8' viewBox='0 0 12 8' fill='none'%3E%3Cpath d='M1 1.5L6 6.5L11 1.5' stroke='%23888' stroke-width='1.6' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right ${varRef(
    "size",
  )} center;`;
  const options = [
    `<option value="" disabled selected>${esc(opts.prompt)}</option>`,
    ...opts.options.map((o) => `<option>${esc(o)}</option>`),
  ].join("");
  return `<div class="fld">
            ${fieldLabel(opts.label, opts.mark)}
            <select style="${inputBase}-webkit-appearance:none;-moz-appearance:none;appearance:none;cursor:pointer;padding-right:${varRef(
              "sizeXXL",
            )};${arrow}">${options}</select>
            ${fieldHelp(opts.help)}
          </div>`;
}

/** A labelled <textarea> with always-visible label + example placeholder. */
function textareaField(opts: {
  label: string;
  placeholder?: string;
  help?: string;
  rows?: number;
  mark?: "optional" | "required";
}): string {
  const taStyle = `${controlBase}display:block;min-height:${varRef("controlHeightLG")};padding:${varRef(
    "sizeSM",
  )} ${varRef("size")};line-height:${varRef("lineHeight")};resize:vertical;`;
  const ph = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
  return `<div class="fld">
            ${fieldLabel(opts.label, opts.mark)}
            <textarea rows="${opts.rows ?? 4}"${ph} style="${taStyle}"></textarea>
            ${fieldHelp(opts.help)}
          </div>`;
}

/** A consent / opt-in checkbox row (doc: opt-in, not pre-checked dark pattern). */
function checkboxField(opts: { label: string; checked?: boolean }): string {
  return `<label class="cbx" style="display:flex;align-items:flex-start;gap:${varRef(
    "sizeSM",
  )};font-size:${varRef("fontSize")};line-height:${varRef("lineHeight")};color:${varRef(
    "colorTextSecondary",
  )};cursor:pointer;">
            <input type="checkbox"${
              opts.checked ? " checked" : ""
            } style="accent-color:${varRef(
    "colorPrimary",
  )};width:18px;height:18px;margin:2px 0 0;flex:0 0 auto;cursor:pointer;">
            <span>${esc(opts.label)}</span>
          </label>`;
}

// ─────────────────────────── decorative motifs ──────────────────────────────

/** A small themed wordmark-dot for the form-card footer (no emoji icons). */
const footerDot = `<span style="flex:0 0 auto;display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;border-radius:${varRef(
  "borderRadiusSM",
)};background:${varRef("colorPrimaryBg")};"><svg width="10" height="10" viewBox="0 0 12 12" fill="none" aria-hidden="true"><path d="M2.5 6h7M6 2.5L9.5 6 6 9.5" stroke="${varRef(
  "colorPrimary",
)}" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg></span>`;

/** A faint dotted-grid motif for the brand panel — themed, not a stock photo. */
const PANEL_MOTIF = `<svg width="220" height="220" viewBox="0 0 220 220" fill="none" aria-hidden="true" style="position:absolute;top:-40px;right:-40px;opacity:0.18;color:#fff;"><defs><pattern id="fdot" width="22" height="22" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r="1.6" fill="currentColor"/></pattern></defs><rect width="220" height="220" fill="url(#fdot)"/></svg>`;

const FORM_CSS = `
      .form-split { display: grid; grid-template-columns: minmax(320px, 4.6fr) minmax(380px, 5.4fr); min-height: 100vh; }
      @media (max-width: 900px) { .form-split { grid-template-columns: 1fr; } .form-brand { min-height: 340px; } }
      .form-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: ${varRef("size")}; }
      @media (max-width: 540px) { .form-grid-2 { grid-template-columns: 1fr; } }
      .fld input:focus, .fld textarea:focus, .fld select:focus { border-color: ${varRef(
        "colorPrimary",
      )} !important; box-shadow: 0 0 0 3px ${varRef("colorPrimaryBg")}; }
      .fld input:invalid:not(:placeholder-shown) { border-color: ${varRef("colorError")}; }
      .fld input:invalid:not(:placeholder-shown) ~ .fld-err { display: block; }
      .fld-err { display: none; margin: ${varRef("sizeXXS")} 0 0; font-size: ${varRef(
        "fontSizeSM",
      )}; color: ${varRef("colorError")}; }
      .form-card { transition: box-shadow ${varRef("motionDurationMid")} ${varRef("motionEaseInOut")}; }
`;

export function renderFormPage(brand: Brand, tokens: DesignTokens): string {
  // ── derived copy ──────────────────────────────────────────────────────────
  const pillars = pillarTitles(brand);
  const reasons = (pillars.length >= 2 ? pillars : FEATURE_FALLBACKS.map((f) => f.title))
    .slice(0, 3)
    .map(cap);

  const adjectives = brand.voice.adjectives.map((a) => a.trim()).filter(Boolean);
  const niceWord = adjectives[0] ? adjectives[0].toLowerCase() : "in good hands";

  // Panel headline answers "what do I get" — never "fill in the form below".
  const panelTitle = firstOf([brand.tagline], `Start with ${brand.name}`);
  const panelBlurb = brandBlurb(brand);

  // Form title is an action/outcome, not a neutral "Get in touch".
  const formTitle = `Tell us where to start`;
  const formSub = `A couple of details and ${esc(
    brand.name,
  )} takes it from there — no account needed yet.`;

  const topicOptions = (pillars.length >= 3 ? pillars.slice(0, 5) : [
    "Getting started",
    "Pricing & plans",
    "A partnership",
    "Something else",
  ]).map(cap);

  // ── value-prompt panel (module 1) ─────────────────────────────────────────
  const reasonList = reasons
    .map(
      (r) => `<li style="display:flex;gap:${varRef(
        "sizeSM",
      )};align-items:flex-start;padding:${varRef("sizeXS")} 0;color:rgba(255,255,255,0.92);font-size:${varRef(
        "fontSizeLG",
      )};line-height:1.45;">
            <svg width="18" height="18" viewBox="0 0 18 18" fill="none" aria-hidden="true" style="flex:0 0 auto;margin-top:3px;"><path d="M3.5 9.5L7 13l7.5-8" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
            <span>${esc(r)}</span>
          </li>`,
    )
    .join("");

  const reassureLine = firstOf(
    [brand.voice.tone],
    `It's free to start, and you're ${niceWord} the whole way.`,
  );

  const brandPanel = `<div class="form-brand" style="background:${varRef(
    "colorPrimary",
  )};color:#fff;padding:clamp(32px,5vw,64px);display:flex;flex-direction:column;justify-content:space-between;gap:${varRef(
    "sizeXL",
  )};position:relative;overflow:hidden;">
        ${PANEL_MOTIF}
        <div style="position:absolute;bottom:-140px;left:-100px;width:320px;height:320px;border-radius:50%;background:${varRef(
          "colorPrimaryActive",
        )};opacity:0.45;"></div>
        <div style="position:relative;display:flex;align-items:center;gap:${varRef("sizeSM")};">
          <span style="display:inline-flex;width:30px;height:30px;border-radius:${varRef(
            "borderRadius",
          )};background:rgba(255,255,255,0.16);align-items:center;justify-content:center;">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" aria-hidden="true"><path d="M1.5 7l3.5 3.5L12.5 3" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          ${wordmark(brand, { color: "#fff" })}
        </div>
        <div style="position:relative;max-width:42ch;">
          <h1 style="color:#fff;font-size:clamp(28px,3.4vw,42px);letter-spacing:-0.02em;line-height:1.08;margin-bottom:${varRef(
            "sizeMD",
          )};">${esc(panelTitle)}</h1>
          <p class="clamp-3" style="color:rgba(255,255,255,0.82);font-size:${varRef(
            "fontSizeLG",
          )};line-height:1.55;margin-bottom:${varRef("sizeLG")};">${esc(panelBlurb)}</p>
          <ul style="list-style:none;margin:0;padding:0;">${reasonList}</ul>
        </div>
        <div style="position:relative;display:flex;align-items:center;gap:${varRef(
          "sizeSM",
        )};color:rgba(255,255,255,0.7);font-size:${varRef("fontSizeSM")};">
          <span style="display:inline-flex;width:8px;height:8px;border-radius:50%;background:${varRef(
            "colorSuccess",
          )};box-shadow:0 0 0 4px rgba(255,255,255,0.12);"></span>
          <span>${esc(reassureLine)}</span>
        </div>
      </div>`;

  // ── fields (modules 2–4): easy → hard, single column, top labels ──────────
  const formFields = `<div style="display:flex;flex-direction:column;gap:${varRef("sizeLG")};">
            <div class="form-grid-2">
              ${field({
                label: "First name",
                placeholder: "Ada",
                autocomplete: "given-name",
              })}
              ${field({
                label: "Last name",
                placeholder: "Lovelace",
                autocomplete: "family-name",
              })}
            </div>
            ${field({
              label: "Work email",
              type: "email",
              placeholder: "you@company.com",
              inputmode: "email",
              autocomplete: "email",
              help: "We'll send your next steps here.",
              error: "That doesn't look like an email yet — try name@company.com.",
            })}
            ${selectField({
              label: "What can we help with?",
              prompt: "Choose one…",
              options: topicOptions,
              help: "Pick the closest — you can change direction later.",
            })}
            ${textareaField({
              label: "Anything we should know?",
              mark: "optional",
              rows: 4,
              placeholder: `A sentence or two about what you're trying to do with ${brand.name}…`,
            })}
            ${checkboxField({
              label: `Keep me posted on what's new at ${brand.name}. No noise, easy to turn off.`,
            })}
          </div>`;

  // ── CTA (module 5) + trust microcopy (module 6) ───────────────────────────
  const ctaBlock = `<div style="display:flex;flex-direction:column;gap:${varRef(
    "sizeSM",
  )};margin-top:${varRef("size")};">
            <div style="display:flex;flex-direction:column;">
              ${button({ label: `Get started with ${brand.name}`, type: "primary", size: "lg" })}
            </div>
            <p style="display:flex;align-items:center;justify-content:center;gap:${varRef(
              "sizeXS",
            )};font-size:${varRef("fontSizeSM")};color:${varRef("colorTextTertiary")};text-align:center;">
              <svg width="13" height="14" viewBox="0 0 13 14" fill="none" aria-hidden="true" style="flex:0 0 auto;"><path d="M2 6V4.5a4.5 4.5 0 019 0V6m-10 0h11v7H1.5z" stroke="currentColor" stroke-width="1.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
              <span>No spam, ever. Unsubscribe in one click — your data stays yours.</span>
            </p>
          </div>`;

  // ── success state (module 7): rendered, hidden — the next step is explicit ─
  const successState = `<div class="form-success" hidden style="display:none;flex-direction:column;align-items:center;text-align:center;gap:${varRef(
    "sizeMD",
  )};padding:${varRef("sizeXL")} 0;">
          <span style="display:inline-flex;width:56px;height:56px;border-radius:50%;background:${varRef(
            "colorSuccessBg",
          )};align-items:center;justify-content:center;">
            <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true"><path d="M6 13.5l4.5 4.5L20 7" stroke="${varRef(
              "colorSuccess",
            )}" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>
          </span>
          <h2 style="font-size:${varRef("fontSizeHeading4")};">You're in.</h2>
          <p style="color:${varRef("colorTextSecondary")};max-width:34ch;">Check your inbox for a note from ${esc(
            brand.name,
          )} — your next step is waiting there. We usually reply within one business day.</p>
        </div>`;

  // ── form card ─────────────────────────────────────────────────────────────
  const formCard = `<div style="display:flex;align-items:center;justify-content:center;padding:clamp(24px,4vw,64px);background:${varRef(
    "colorBgLayout",
  )};">
        <div class="form-card" style="width:100%;max-width:520px;background:${varRef(
          "colorBgContainer",
        )};border:${varRef("lineWidth")} solid ${varRef(
    "colorBorderSecondary",
  )};border-radius:${varRef("borderRadiusLG")};padding:clamp(28px,4vw,44px);box-shadow:0 24px 60px ${varRef(
    "colorFillQuaternary",
  )}, 0 2px 8px ${varRef("colorFillQuaternary")};">
          <header style="margin-bottom:${varRef("sizeLG")};">
            <h2 style="font-size:${varRef("fontSizeHeading3")};letter-spacing:-0.015em;margin-bottom:${varRef(
              "sizeXS",
            )};">${esc(formTitle)}</h2>
            <p style="color:${varRef("colorTextTertiary")};font-size:${varRef(
              "fontSize",
            )};">${formSub}</p>
          </header>

          <form novalidate onsubmit="this.querySelector('.form-body').style.display='none';var s=this.querySelector('.form-success');s.hidden=false;s.style.display='flex';return false;">
            <div class="form-body" style="display:flex;flex-direction:column;gap:${varRef("sizeLG")};">
              ${formFields}
              ${ctaBlock}
            </div>
            ${successState}
          </form>

          <div style="margin-top:${varRef("sizeLG")};padding-top:${varRef(
    "sizeLG",
  )};border-top:${varRef("lineWidth")} solid ${varRef(
    "colorBorderSecondary",
  )};display:flex;align-items:center;justify-content:space-between;gap:${varRef(
    "sizeSM",
  )};color:${varRef("colorTextQuaternary")};font-size:${varRef("fontSizeSM")};">
            <span style="display:inline-flex;align-items:center;gap:${varRef(
              "sizeXS",
            )};">${footerDot}<span style="color:${varRef("colorTextTertiary")};">${esc(
    cap(brandTagline(brand).replace(/\.$/, "")),
  )}</span></span>
            <span>${esc(sourceHost(brand))}</span>
          </div>
        </div>
      </div>`;

  const body = `    <div class="form-split">
      ${brandPanel}
      ${formCard}
    </div>`;

  return document({
    title: `${brand.name} — Get started`,
    tokens,
    brand,
    body,
    css: FORM_CSS,
  });
}
