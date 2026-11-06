// @ts-nocheck
/**
 * The themed component kit. Every component is a pure function returning an
 * HTML string whose colors/spacing/typography come *only* from the derived
 * design-token CSS custom properties (`var(--brand-*)`, via `varRef`). Nothing
 * here is hand-tuned per brand: the same markup re-skins itself the moment the
 * `:root` token block changes — that is what makes a single Seed yield a whole
 * coherent component set across light / dark / compact variants.
 *
 * Fragment functions (button / card / input / tag / alert / swatches /
 * typeScale) return *fragments* (no <html> shell) with inline `style`. Only
 * `renderKitPage` returns a full standalone document: it inlines the
 * `:root{ --brand-…: … }` block itself (built from `flattenTokens`, so it does
 * not depend on export.ts) and lays out a showcase of every component.
 */

import { type DesignTokens, flattenTokens, varRef } from "./types.js";

// ─────────────────────────── tiny html helpers ──────────────────────────────

/** Minimal HTML-attribute / text escaper so caller-supplied copy is safe. */
function esc(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Join inline style declarations, dropping empties, into one `style=""` body. */
function style(decls: Array<string | false | null | undefined>): string {
  return decls.filter(Boolean).join(";");
}

// ─────────────────────────── button ─────────────────────────────────────────

type ButtonType = "primary" | "default" | "dashed" | "text" | "link";
type Size = "sm" | "md" | "lg";

const BTN_HEIGHT: Record<Size, string> = {
  sm: varRef("controlHeightSM"),
  md: varRef("controlHeight"),
  lg: varRef("controlHeightLG"),
};
const BTN_FONT: Record<Size, string> = {
  sm: varRef("fontSizeSM"),
  md: varRef("fontSize"),
  lg: varRef("fontSizeLG"),
};
const BTN_PAD: Record<Size, string> = {
  sm: varRef("sizeXS"),
  md: varRef("size"),
  lg: varRef("sizeLG"),
};

export function button(opts: {
  label: string;
  type?: ButtonType;
  size?: "sm" | "md" | "lg";
}): string {
  const type = opts.type ?? "default";
  const size = opts.size ?? "md";

  const base = [
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "box-sizing:border-box",
    "cursor:pointer",
    "white-space:nowrap",
    "user-select:none",
    "font-family:" + varRef("fontFamily"),
    "font-weight:" + varRef("fontWeightStrong"),
    "line-height:1",
    "text-decoration:none",
    "transition:all " + varRef("motionDurationMid") + " " + varRef("motionEaseInOut"),
    "height:" + BTN_HEIGHT[size],
    "padding:0 " + BTN_PAD[size],
    "font-size:" + BTN_FONT[size],
    "border-radius:" + varRef("borderRadius"),
    "border:" + varRef("lineWidth") + " solid transparent",
  ];

  let skin: string[];
  switch (type) {
    case "primary":
      skin = [
        "background:" + varRef("colorPrimary"),
        "color:#fff",
        "border-color:" + varRef("colorPrimary"),
        "box-shadow:0 2px 0 " + varRef("colorPrimaryBg"),
      ];
      break;
    case "dashed":
      skin = [
        "background:" + varRef("colorBgContainer"),
        "color:" + varRef("colorText"),
        "border-color:" + varRef("colorBorder"),
        "border-style:dashed",
      ];
      break;
    case "text":
      skin = ["background:transparent", "color:" + varRef("colorText"), "border-color:transparent"];
      break;
    case "link":
      skin = ["background:transparent", "color:" + varRef("colorLink"), "border-color:transparent"];
      break;
    default:
      skin = [
        "background:" + varRef("colorBgContainer"),
        "color:" + varRef("colorText"),
        "border-color:" + varRef("colorBorder"),
      ];
  }

  return `<a role="button" tabindex="0" style="${style([...base, ...skin])}">${esc(opts.label)}</a>`;
}

// ─────────────────────────── card ───────────────────────────────────────────

export function card(opts: { title?: string; body: string; footer?: string }): string {
  const wrap = style([
    "display:flex",
    "flex-direction:column",
    "background:" + varRef("colorBgContainer"),
    "border:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
    "border-radius:" + varRef("borderRadiusLG"),
    "overflow:hidden",
    "font-family:" + varRef("fontFamily"),
    "color:" + varRef("colorText"),
    "box-shadow:0 1px 2px " + varRef("colorFillQuaternary"),
  ]);

  const head = opts.title
    ? `<div style="${style([
        "padding:" + varRef("sizeMD") + " " + varRef("sizeLG"),
        "border-bottom:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
        "font-size:" + varRef("fontSizeLG"),
        "font-weight:" + varRef("fontWeightStrong"),
        "color:" + varRef("colorText"),
      ])}">${esc(opts.title)}</div>`
    : "";

  const body = `<div style="${style([
    "padding:" + varRef("sizeLG"),
    "font-size:" + varRef("fontSize"),
    "line-height:" + varRef("lineHeight"),
    "color:" + varRef("colorTextSecondary"),
    "flex:1",
  ])}">${opts.body}</div>`;

  const foot = opts.footer
    ? `<div style="${style([
        "padding:" + varRef("sizeMD") + " " + varRef("sizeLG"),
        "border-top:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
        "background:" + varRef("colorFillQuaternary"),
      ])}">${opts.footer}</div>`
    : "";

  return `<div style="${wrap}">${head}${body}${foot}</div>`;
}

// ─────────────────────────── input ──────────────────────────────────────────

export function input(opts: { placeholder?: string; label?: string; value?: string }): string {
  const field = style([
    "box-sizing:border-box",
    "width:100%",
    "height:" + varRef("controlHeight"),
    "padding:0 " + varRef("sizeSM"),
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSize"),
    "line-height:" + varRef("lineHeight"),
    "color:" + varRef("colorText"),
    "background:" + varRef("colorBgContainer"),
    "border:" + varRef("lineWidth") + " solid " + varRef("colorBorder"),
    "border-radius:" + varRef("borderRadius"),
    "outline:none",
    "transition:border-color " + varRef("motionDurationMid") + " " + varRef("motionEaseInOut"),
  ]);

  const label = opts.label
    ? `<label style="${style([
        "display:block",
        "margin-bottom:" + varRef("sizeXXS"),
        "font-family:" + varRef("fontFamily"),
        "font-size:" + varRef("fontSizeSM"),
        "color:" + varRef("colorTextSecondary"),
      ])}">${esc(opts.label)}</label>`
    : "";

  const placeholder = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
  const value = opts.value ? ` value="${esc(opts.value)}"` : "";

  return `<div>${label}<input type="text"${placeholder}${value} style="${field}"></div>`;
}

// ─────────────────────────── tag ────────────────────────────────────────────

export function tag(opts: { label: string; color?: string }): string {
  // `color` may be a literal CSS color or a token key like "colorPrimary".
  const accent = opts.color
    ? /^(#|rgb|hsl|oklch)/i.test(opts.color)
      ? opts.color
      : varRef(opts.color)
    : varRef("colorPrimary");

  const bg = opts.color && /^(#|rgb|hsl|oklch)/i.test(opts.color) ? accent + "1f" : varRef("colorPrimaryBg");
  const border =
    opts.color && /^(#|rgb|hsl|oklch)/i.test(opts.color) ? accent + "55" : varRef("colorPrimaryBorder");

  return `<span style="${style([
    "display:inline-flex",
    "align-items:center",
    "height:" + varRef("controlHeightSM"),
    "padding:0 " + varRef("sizeXS"),
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSizeSM"),
    "line-height:1",
    "color:" + accent,
    "background:" + bg,
    "border:" + varRef("lineWidth") + " solid " + border,
    "border-radius:" + varRef("borderRadiusSM"),
  ])}">${esc(opts.label)}</span>`;
}

// ─────────────────────────── alert ──────────────────────────────────────────

type AlertType = "success" | "info" | "warning" | "error";

const ALERT_FACE: Record<AlertType, { bg: string; border: string; accent: string; icon: string }> = {
  success: {
    bg: varRef("colorSuccessBg"),
    border: varRef("colorSuccessBorder"),
    accent: varRef("colorSuccess"),
    icon: "&#10003;",
  },
  info: {
    bg: varRef("colorInfoBg"),
    border: varRef("colorInfoBorder"),
    accent: varRef("colorInfo"),
    icon: "&#8505;",
  },
  warning: {
    bg: varRef("colorWarningBg"),
    border: varRef("colorWarningBorder"),
    accent: varRef("colorWarning"),
    icon: "&#9888;",
  },
  error: {
    bg: varRef("colorErrorBg"),
    border: varRef("colorErrorBorder"),
    accent: varRef("colorError"),
    icon: "&#10005;",
  },
};

export function alert(opts: {
  type?: "success" | "info" | "warning" | "error";
  message: string;
  description?: string;
}): string {
  const face = ALERT_FACE[opts.type ?? "info"];

  const icon = `<span style="${style([
    "flex:0 0 auto",
    "margin-top:2px",
    "color:" + face.accent,
    "font-size:" + varRef("fontSizeLG"),
    "line-height:1",
  ])}">${face.icon}</span>`;

  const desc = opts.description
    ? `<div style="${style([
        "margin-top:" + varRef("sizeXXS"),
        "font-size:" + varRef("fontSize"),
        "color:" + varRef("colorTextSecondary"),
        "line-height:" + varRef("lineHeight"),
      ])}">${esc(opts.description)}</div>`
    : "";

  return `<div style="${style([
    "display:flex",
    "gap:" + varRef("sizeSM"),
    "align-items:flex-start",
    "padding:" + varRef("sizeSM") + " " + varRef("size"),
    "font-family:" + varRef("fontFamily"),
    "background:" + face.bg,
    "border:" + varRef("lineWidth") + " solid " + face.border,
    "border-radius:" + varRef("borderRadiusLG"),
  ])}">${icon}<div style="flex:1"><div style="${style([
    "font-size:" + varRef("fontSize"),
    "font-weight:" + (opts.description ? varRef("fontWeightStrong") : "inherit"),
    "color:" + varRef("colorText"),
    "line-height:" + varRef("lineHeight"),
  ])}">${esc(opts.message)}</div>${desc}</div></div>`;
}

// ─────────────────────────── shared behaviour css ───────────────────────────

/**
 * States that inline styles cannot express (hover, focus, details[open]).
 * `renderKitPage` and every artifact document inline this once; fragments
 * still render acceptably without it.
 */
export const KIT_CSS = `
a[role="button"]{transition:filter .15s ease,transform .15s ease}
a[role="button"]:hover{filter:brightness(1.07)}
a[role="button"]:active{filter:brightness(.95);transform:translateY(0.5px)}
input:focus,textarea:focus,select:focus{border-color:var(--brand-color-primary)!important;box-shadow:0 0 0 3px var(--brand-color-primary-bg);outline:none}
details.kit-acc>summary{list-style:none;cursor:pointer}
details.kit-acc>summary::-webkit-details-marker{display:none}
details.kit-acc .kit-acc-icon{transition:transform .18s ease}
details.kit-acc[open] .kit-acc-icon{transform:rotate(45deg)}
`.trim();

// ─────────────────────────── avatar / stat / divider ────────────────────────

/** Initials avatar — up to two initials on a primary-tinted disc. */
export function avatar(opts: { name: string; size?: Size }): string {
  const px: Record<Size, string> = {
    sm: varRef("controlHeightSM"),
    md: varRef("controlHeight"),
    lg: varRef("controlHeightLG"),
  };
  const size = opts.size ?? "md";
  const initials = opts.name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]!.toUpperCase())
    .join("");
  return `<span style="${style([
    "display:inline-flex",
    "align-items:center",
    "justify-content:center",
    "flex:0 0 auto",
    "width:" + px[size],
    "height:" + px[size],
    "border-radius:50%",
    "background:" + varRef("colorPrimaryBg"),
    "color:" + varRef("colorPrimaryText"),
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSizeSM"),
    "font-weight:" + varRef("fontWeightStrong"),
    "letter-spacing:0.02em",
    "user-select:none",
  ])}">${esc(initials || "?")}</span>`;
}

/** A big-number metric with a small label underneath. */
export function stat(opts: { value: string; label: string }): string {
  return `<div style="${style(["font-family:" + varRef("fontFamily"), "min-width:0"])}">
    <div style="${style([
      "font-size:" + varRef("fontSizeHeading2"),
      "font-weight:" + varRef("fontWeightStrong"),
      "line-height:1.1",
      "color:" + varRef("colorText"),
      "letter-spacing:-0.01em",
    ])}">${esc(opts.value)}</div>
    <div style="${style([
      "margin-top:" + varRef("sizeXXS"),
      "font-size:" + varRef("fontSizeSM"),
      "color:" + varRef("colorTextTertiary"),
    ])}">${esc(opts.label)}</div>
  </div>`;
}

/** Horizontal rule, optionally with a centered label. */
export function divider(opts?: { label?: string }): string {
  const line = `<span style="${style([
    "flex:1",
    "height:" + varRef("lineWidth"),
    "background:" + varRef("colorBorderSecondary"),
  ])}"></span>`;
  if (!opts?.label) {
    return `<div style="display:flex;align-items:center;margin:${varRef("sizeLG")} 0;">${line}</div>`;
  }
  return `<div style="${style([
    "display:flex",
    "align-items:center",
    "gap:" + varRef("sizeSM"),
    "margin:" + varRef("sizeLG") + " 0",
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSizeSM"),
    "color:" + varRef("colorTextTertiary"),
  ])}">${line}<span>${esc(opts.label)}</span>${line}</div>`;
}

// ─────────────────────────── form controls ──────────────────────────────────

function fieldLabel(text?: string): string {
  if (!text) return "";
  return `<label style="${style([
    "display:block",
    "margin-bottom:" + varRef("sizeXXS"),
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSizeSM"),
    "color:" + varRef("colorTextSecondary"),
  ])}">${esc(text)}</label>`;
}

export function textarea(opts: { label?: string; placeholder?: string; rows?: number }): string {
  const field = style([
    "box-sizing:border-box",
    "display:block",
    "width:100%",
    "padding:" + varRef("sizeXS") + " " + varRef("sizeSM"),
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSize"),
    "line-height:" + varRef("lineHeight"),
    "color:" + varRef("colorText"),
    "background:" + varRef("colorBgContainer"),
    "border:" + varRef("lineWidth") + " solid " + varRef("colorBorder"),
    "border-radius:" + varRef("borderRadius"),
    "resize:vertical",
    "outline:none",
  ]);
  const placeholder = opts.placeholder ? ` placeholder="${esc(opts.placeholder)}"` : "";
  return `<div>${fieldLabel(opts.label)}<textarea rows="${opts.rows ?? 4}"${placeholder} style="${field}"></textarea></div>`;
}

export function select(opts: { label?: string; options: string[]; value?: string }): string {
  const field = style([
    "box-sizing:border-box",
    "width:100%",
    "height:" + varRef("controlHeight"),
    "padding:0 " + varRef("sizeSM"),
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSize"),
    "color:" + varRef("colorText"),
    "background:" + varRef("colorBgContainer"),
    "border:" + varRef("lineWidth") + " solid " + varRef("colorBorder"),
    "border-radius:" + varRef("borderRadius"),
    "outline:none",
  ]);
  const options = opts.options
    .map((o) => `<option${o === opts.value ? " selected" : ""}>${esc(o)}</option>`)
    .join("");
  return `<div>${fieldLabel(opts.label)}<select style="${field}">${options}</select></div>`;
}

export function checkbox(opts: { label: string; checked?: boolean }): string {
  return `<label style="${style([
    "display:inline-flex",
    "align-items:flex-start",
    "gap:" + varRef("sizeXS"),
    "font-family:" + varRef("fontFamily"),
    "font-size:" + varRef("fontSize"),
    "line-height:" + varRef("lineHeight"),
    "color:" + varRef("colorTextSecondary"),
    "cursor:pointer",
  ])}"><input type="checkbox"${opts.checked ? " checked" : ""} style="${style([
    "accent-color:" + varRef("colorPrimary"),
    "width:16px",
    "height:16px",
    "margin:3px 0 0",
    "flex:0 0 auto",
  ])}"><span>${esc(opts.label)}</span></label>`;
}

export function switchToggle(opts?: { on?: boolean; label?: string }): string {
  const on = opts?.on ?? true;
  const track = style([
    "display:inline-flex",
    "align-items:center",
    "flex:0 0 auto",
    "width:44px",
    "height:24px",
    "padding:2px",
    "border-radius:12px",
    "box-sizing:border-box",
    "transition:background " + varRef("motionDurationMid") + " " + varRef("motionEaseInOut"),
    "background:" + (on ? varRef("colorPrimary") : varRef("colorFill")),
    "justify-content:" + (on ? "flex-end" : "flex-start"),
  ]);
  const knob = `<span style="width:20px;height:20px;border-radius:50%;background:#fff;box-shadow:0 1px 2px rgba(0,0,0,0.2);"></span>`;
  const label = opts?.label
    ? `<span style="font-family:${varRef("fontFamily")};font-size:${varRef("fontSize")};color:${varRef(
        "colorTextSecondary",
      )};">${esc(opts.label)}</span>`
    : "";
  return `<span style="display:inline-flex;align-items:center;gap:${varRef("sizeXS")};"><span style="${track}">${knob}</span>${label}</span>`;
}

// ─────────────────────────── navigation ─────────────────────────────────────

export function tabs(opts: { items: string[]; active?: number }): string {
  const active = opts.active ?? 0;
  const items = opts.items
    .map((label, i) => {
      const is = i === active;
      return `<span style="${style([
        "padding:" + varRef("sizeXS") + " 2px",
        "margin-bottom:calc(-1 * " + varRef("lineWidth") + ")",
        "font-family:" + varRef("fontFamily"),
        "font-size:" + varRef("fontSize"),
        "cursor:pointer",
        "white-space:nowrap",
        "color:" + (is ? varRef("colorPrimary") : varRef("colorTextSecondary")),
        is ? "font-weight:" + varRef("fontWeightStrong") : "",
        "border-bottom:2px solid " + (is ? varRef("colorPrimary") : "transparent"),
      ])}">${esc(label)}</span>`;
    })
    .join("");
  return `<div style="${style([
    "display:flex",
    "gap:" + varRef("sizeLG"),
    "border-bottom:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
  ])}">${items}</div>`;
}

export function breadcrumb(opts: { items: string[] }): string {
  const last = opts.items.length - 1;
  const parts = opts.items
    .map((label, i) => {
      const item = `<span style="color:${
        i === last ? varRef("colorText") : varRef("colorTextTertiary")
      };">${esc(label)}</span>`;
      const sep =
        i < last ? `<span style="color:${varRef("colorTextQuaternary")};">/</span>` : "";
      return item + sep;
    })
    .join("");
  return `<nav style="display:inline-flex;align-items:center;gap:${varRef(
    "sizeXS",
  )};font-family:${varRef("fontFamily")};font-size:${varRef("fontSize")};">${parts}</nav>`;
}

export function pagination(opts: { total: number; current: number }): string {
  const total = Math.max(1, opts.total);
  const current = Math.min(Math.max(1, opts.current), total);
  const cell = (content: string, active = false, muted = false) =>
    `<span style="${style([
      "display:inline-flex",
      "align-items:center",
      "justify-content:center",
      "min-width:" + varRef("controlHeightSM"),
      "height:" + varRef("controlHeightSM"),
      "padding:0 " + varRef("sizeXXS"),
      "border-radius:" + varRef("borderRadiusSM"),
      "font-family:" + varRef("fontFamily"),
      "font-size:" + varRef("fontSizeSM"),
      "cursor:pointer",
      "user-select:none",
      "box-sizing:border-box",
      "border:" + varRef("lineWidth") + " solid " + (active ? varRef("colorPrimary") : varRef("colorBorderSecondary")),
      "background:" + (active ? varRef("colorPrimary") : varRef("colorBgContainer")),
      "color:" + (active ? "#fff" : muted ? varRef("colorTextQuaternary") : varRef("colorTextSecondary")),
    ])}">${content}</span>`;
  const pages = Array.from({ length: total }, (_, i) => cell(String(i + 1), i + 1 === current)).join("");
  return `<div style="display:inline-flex;gap:${varRef("sizeXXS")};align-items:center;">${cell(
    "&lsaquo;",
    false,
    current === 1,
  )}${pages}${cell("&rsaquo;", false, current === total)}</div>`;
}

export function progress(opts: { percent: number }): string {
  const pct = Math.min(100, Math.max(0, Math.round(opts.percent)));
  const done = pct >= 100;
  return `<div style="display:flex;align-items:center;gap:${varRef("sizeSM")};font-family:${varRef(
    "fontFamily",
  )};">
    <div style="${style([
      "flex:1",
      "height:8px",
      "border-radius:4px",
      "background:" + varRef("colorFillSecondary"),
      "overflow:hidden",
    ])}"><div style="${style([
      "width:" + pct + "%",
      "height:100%",
      "border-radius:4px",
      "background:" + (done ? varRef("colorSuccess") : varRef("colorPrimary")),
      "transition:width " + varRef("motionDurationSlow") + " " + varRef("motionEaseOut"),
    ])}"></div></div>
    <span style="${style([
      "flex:0 0 auto",
      "font-size:" + varRef("fontSizeSM"),
      "color:" + (done ? varRef("colorSuccess") : varRef("colorTextSecondary")),
    ])}">${done ? "&#10003;" : pct + "%"}</span>
  </div>`;
}

export function steps(opts: {
  items: Array<{ title: string; description?: string }>;
  current?: number;
}): string {
  const current = opts.current ?? 0;
  const connector = `<div style="${style([
    "flex:1 1 " + varRef("sizeXL"),
    "min-width:" + varRef("sizeMD"),
    "height:" + varRef("lineWidth"),
    "background:" + varRef("colorBorderSecondary"),
    "margin-top:14px",
  ])}"></div>`;
  const cells = opts.items
    .map((item, i) => {
      const state = i < current ? "done" : i === current ? "active" : "todo";
      const disc = `<span style="${style([
        "display:inline-flex",
        "align-items:center",
        "justify-content:center",
        "flex:0 0 auto",
        "width:28px",
        "height:28px",
        "border-radius:50%",
        "font-size:" + varRef("fontSizeSM"),
        "font-weight:" + varRef("fontWeightStrong"),
        "box-sizing:border-box",
        "border:" + varRef("lineWidth") + " solid " + (state === "todo" ? varRef("colorBorder") : varRef("colorPrimary")),
        "background:" + (state === "todo" ? varRef("colorBgContainer") : varRef("colorPrimary")),
        "color:" + (state === "todo" ? varRef("colorTextTertiary") : "#fff"),
      ])}">${state === "done" ? "&#10003;" : String(i + 1)}</span>`;
      const desc = item.description
        ? `<div style="${style([
            "margin-top:2px",
            "font-size:" + varRef("fontSizeSM"),
            "color:" + varRef("colorTextTertiary"),
            "line-height:" + varRef("lineHeight"),
          ])}">${esc(item.description)}</div>`
        : "";
      return `<div style="${style([
        "flex:0 1 auto",
        "min-width:140px",
        "display:flex",
        "gap:" + varRef("sizeSM"),
        "align-items:flex-start",
      ])}">${disc}<div style="min-width:0;padding-top:4px;"><div style="${style([
        "font-weight:" + varRef("fontWeightStrong"),
        "font-size:" + varRef("fontSize"),
        "color:" + varRef("colorText"),
        "line-height:1.3",
      ])}">${esc(item.title)}</div>${desc}</div></div>`;
    })
    .join(connector);
  return `<div style="display:flex;gap:${varRef(
    "sizeSM",
  )};align-items:flex-start;flex-wrap:wrap;font-family:${varRef("fontFamily")};">${cells}</div>`;
}

// ─────────────────────────── data display ───────────────────────────────────

export function table(opts: { columns: string[]; rows: string[][] }): string {
  const th = opts.columns
    .map(
      (c) => `<th style="${style([
        "text-align:left",
        "padding:" + varRef("sizeSM") + " " + varRef("sizeMD"),
        "font-size:" + varRef("fontSizeSM"),
        "font-weight:" + varRef("fontWeightStrong"),
        "color:" + varRef("colorTextSecondary"),
        "background:" + varRef("colorFillQuaternary"),
        "border-bottom:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
        "white-space:nowrap",
      ])}">${esc(c)}</th>`,
    )
    .join("");
  const trs = opts.rows
    .map(
      (row, ri) =>
        `<tr>${row
          .map(
            (cellText) => `<td style="${style([
              "padding:" + varRef("sizeSM") + " " + varRef("sizeMD"),
              "font-size:" + varRef("fontSize"),
              "color:" + varRef("colorText"),
              ri < opts.rows.length - 1
                ? "border-bottom:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary")
                : "",
            ])}">${esc(cellText)}</td>`,
          )
          .join("")}</tr>`,
    )
    .join("");
  return `<div style="${style([
    "border:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
    "border-radius:" + varRef("borderRadiusLG"),
    "overflow:hidden",
    "background:" + varRef("colorBgContainer"),
  ])}"><table style="width:100%;border-collapse:collapse;font-family:${varRef(
    "fontFamily",
  )};"><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table></div>`;
}

/** Native `<details>` accordion — works with no JavaScript (FAQ-ready). */
export function accordion(opts: {
  items: Array<{ title: string; body: string }>;
  open?: number;
}): string {
  const open = opts.open ?? 0;
  const items = opts.items
    .map(
      (item, i) => `<details class="kit-acc"${i === open ? " open" : ""} style="${style([
        "border-bottom:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
      ])}">
    <summary style="${style([
      "display:flex",
      "align-items:center",
      "justify-content:space-between",
      "gap:" + varRef("sizeMD"),
      "padding:" + varRef("sizeMD") + " 0",
      "font-family:" + varRef("fontFamily"),
      "font-size:" + varRef("fontSizeLG"),
      "font-weight:" + varRef("fontWeightStrong"),
      "color:" + varRef("colorText"),
    ])}"><span style="min-width:0;">${esc(item.title)}</span><span class="kit-acc-icon" style="${style([
      "flex:0 0 auto",
      "color:" + varRef("colorPrimary"),
      "font-size:" + varRef("fontSizeXL"),
      "line-height:1",
      "font-weight:400",
    ])}">+</span></summary>
    <div style="${style([
      "padding:0 0 " + varRef("sizeMD"),
      "font-family:" + varRef("fontFamily"),
      "font-size:" + varRef("fontSize"),
      "line-height:" + varRef("lineHeight"),
      "color:" + varRef("colorTextSecondary"),
      "max-width:70ch",
    ])}">${esc(item.body)}</div>
  </details>`,
    )
    .join("\n");
  return `<div>${items}</div>`;
}

// ─────────────────────────── marketing blocks ───────────────────────────────

export function testimonial(opts: { quote: string; name: string; role: string }): string {
  const body = `<p style="${style([
    "margin:0 0 " + varRef("sizeLG"),
    "font-size:" + varRef("fontSizeLG"),
    "line-height:1.6",
    "color:" + varRef("colorText"),
  ])}">&ldquo;${esc(opts.quote)}&rdquo;</p>
  <div style="display:flex;align-items:center;gap:${varRef("sizeSM")};">
    ${avatar({ name: opts.name })}
    <div style="min-width:0;">
      <div style="font-weight:${varRef("fontWeightStrong")};color:${varRef(
        "colorText",
      )};font-size:${varRef("fontSize")};">${esc(opts.name)}</div>
      <div style="font-size:${varRef("fontSizeSM")};color:${varRef("colorTextTertiary")};">${esc(
        opts.role,
      )}</div>
    </div>
  </div>`;
  return card({ body });
}

export function pricingCard(opts: {
  plan: string;
  price: string;
  period?: string;
  blurb?: string;
  features: string[];
  cta: string;
  highlighted?: boolean;
}): string {
  const hl = opts.highlighted ?? false;
  const features = opts.features
    .map(
      (f) => `<li style="${style([
        "display:flex",
        "gap:" + varRef("sizeXS"),
        "align-items:flex-start",
        "padding:" + varRef("sizeXXS") + " 0",
        "font-size:" + varRef("fontSize"),
        "line-height:" + varRef("lineHeight"),
        "color:" + varRef("colorTextSecondary"),
      ])}"><span style="color:${varRef("colorSuccess")};font-weight:${varRef(
        "fontWeightStrong",
      )};flex:0 0 auto;">&#10003;</span><span>${esc(f)}</span></li>`,
    )
    .join("");
  return `<div style="${style([
    "display:flex",
    "flex-direction:column",
    "position:relative",
    "background:" + varRef("colorBgContainer"),
    "border:" + (hl ? "2px solid " + varRef("colorPrimary") : varRef("lineWidth") + " solid " + varRef("colorBorderSecondary")),
    "border-radius:" + varRef("borderRadiusLG"),
    "padding:" + varRef("sizeXL"),
    "font-family:" + varRef("fontFamily"),
    hl
      ? "box-shadow:0 12px 32px " + varRef("colorPrimaryBg")
      : "box-shadow:0 1px 2px " + varRef("colorFillQuaternary"),
  ])}">
    <div style="display:flex;justify-content:space-between;align-items:center;gap:${varRef(
      "sizeSM",
    )};margin-bottom:${varRef("sizeXS")};">
      <span style="font-weight:${varRef("fontWeightStrong")};font-size:${varRef(
        "fontSizeLG",
      )};color:${varRef("colorText")};">${esc(opts.plan)}</span>
      ${hl ? tag({ label: "Most popular" }) : ""}
    </div>
    ${
      opts.blurb
        ? `<p style="margin:0 0 ${varRef("sizeMD")};font-size:${varRef("fontSizeSM")};color:${varRef(
            "colorTextTertiary",
          )};">${esc(opts.blurb)}</p>`
        : ""
    }
    <div style="display:flex;align-items:baseline;gap:${varRef("sizeXXS")};margin-bottom:${varRef(
      "sizeLG",
    )};">
      <span style="font-size:${varRef("fontSizeHeading2")};font-weight:${varRef(
        "fontWeightStrong",
      )};color:${varRef("colorText")};line-height:1;letter-spacing:-0.01em;">${esc(opts.price)}</span>
      ${
        opts.period
          ? `<span style="color:${varRef("colorTextTertiary")};font-size:${varRef(
              "fontSizeSM",
            )};">${esc(opts.period)}</span>`
          : ""
      }
    </div>
    <ul style="list-style:none;margin:0 0 ${varRef("sizeXL")};padding:0;flex:1;">${features}</ul>
    <div style="display:flex;flex-direction:column;">${button({
      label: opts.cta,
      type: hl ? "primary" : "default",
      size: "md",
    })}</div>
  </div>`;
}

// ─────────────────────────── swatches ───────────────────────────────────────

/** One labelled color chip. `value` is any CSS color string. */
function chip(label: string, value: string): string {
  return `<div style="${style([
    "display:flex",
    "flex-direction:column",
    "gap:" + varRef("sizeXXS"),
  ])}">
    <div style="${style([
      "height:48px",
      "border-radius:" + varRef("borderRadiusSM"),
      "border:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
      "background:" + value,
    ])}"></div>
    <span style="${style([
      "font-size:11px",
      "font-family:" + varRef("fontFamilyCode"),
      "color:" + varRef("colorTextTertiary"),
    ])}">${esc(label)}</span>
  </div>`;
}

function swatchRow(title: string, chips: string): string {
  return `<div style="${style(["margin-bottom:" + varRef("sizeLG")])}">
    <div style="${style([
      "margin-bottom:" + varRef("sizeSM"),
      "font-size:" + varRef("fontSizeSM"),
      "font-weight:" + varRef("fontWeightStrong"),
      "letter-spacing:0.04em",
      "text-transform:uppercase",
      "color:" + varRef("colorTextTertiary"),
    ])}">${esc(title)}</div>
    <div style="${style([
      "display:grid",
      "grid-template-columns:repeat(auto-fill,minmax(64px,1fr))",
      "gap:" + varRef("sizeSM"),
    ])}">${chips}</div>
  </div>`;
}

export function swatches(tokens: DesignTokens): string {
  const primary = tokens.primaryPalette
    .map((hex, i) => chip(String((i + 1) * 100 - (i === 0 ? 50 : i === 9 ? -50 : 0)), hex))
    .join("");

  const functional = [
    chip("primary", tokens.colorPrimary),
    chip("success", tokens.colorSuccess),
    chip("warning", tokens.colorWarning),
    chip("error", tokens.colorError),
    chip("info", tokens.colorInfo),
  ].join("");

  const neutralText = [
    chip("text", tokens.colorText),
    chip("text/2", tokens.colorTextSecondary),
    chip("text/3", tokens.colorTextTertiary),
    chip("text/4", tokens.colorTextQuaternary),
  ].join("");

  const neutralSurface = [
    chip("layout", tokens.colorBgLayout),
    chip("container", tokens.colorBgContainer),
    chip("elevated", tokens.colorBgElevated),
    chip("border", tokens.colorBorder),
    chip("border/2", tokens.colorBorderSecondary),
  ].join("");

  return [
    swatchRow("Primary palette", primary),
    swatchRow("Functional", functional),
    swatchRow("Neutral text", neutralText),
    swatchRow("Surfaces & borders", neutralSurface),
  ].join("");
}

// ─────────────────────────── typeScale ──────────────────────────────────────

export function typeScale(tokens: DesignTokens): string {
  const rows: Array<{ name: string; size: number; weight: string; lh: string }> = [
    { name: "Heading 1", size: tokens.fontSizeHeading1, weight: varRef("fontWeightStrong"), lh: varRef("lineHeightHeading") },
    { name: "Heading 2", size: tokens.fontSizeHeading2, weight: varRef("fontWeightStrong"), lh: varRef("lineHeightHeading") },
    { name: "Heading 3", size: tokens.fontSizeHeading3, weight: varRef("fontWeightStrong"), lh: varRef("lineHeightHeading") },
    { name: "Heading 4", size: tokens.fontSizeHeading4, weight: varRef("fontWeightStrong"), lh: varRef("lineHeightHeading") },
    { name: "Heading 5", size: tokens.fontSizeHeading5, weight: varRef("fontWeightStrong"), lh: varRef("lineHeightHeading") },
    { name: "Large", size: tokens.fontSizeLG, weight: "inherit", lh: varRef("lineHeight") },
    { name: "Body", size: tokens.fontSize, weight: "inherit", lh: varRef("lineHeight") },
    { name: "Small", size: tokens.fontSizeSM, weight: "inherit", lh: varRef("lineHeight") },
  ];

  return rows
    .map(
      (r) => `<div style="${style([
        "display:flex",
        "align-items:baseline",
        "gap:" + varRef("sizeLG"),
        "padding:" + varRef("sizeSM") + " 0",
        "border-bottom:" + varRef("lineWidth") + " solid " + varRef("colorBorderSecondary"),
      ])}">
      <span style="${style([
        "flex:0 0 96px",
        "font-family:" + varRef("fontFamilyCode"),
        "font-size:" + varRef("fontSizeSM"),
        "color:" + varRef("colorTextTertiary"),
      ])}">${esc(r.name)} · ${r.size}px</span>
      <span style="${style([
        "font-family:" + varRef("fontFamily"),
        "font-size:" + r.size + "px",
        "font-weight:" + r.weight,
        "line-height:" + r.lh,
        "color:" + varRef("colorText"),
      ])}">The quick brown fox</span>
    </div>`,
    )
    .join("");
}

// ─────────────────────────── full showcase page ─────────────────────────────

/** Build the inline `:root{ --brand-…: … }` block from the tokens directly
 *  (does not depend on export.ts — kit must stand alone). */
function rootVars(tokens: DesignTokens): string {
  const decls = flattenTokens(tokens)
    .map(({ name, value }) => `  ${name}: ${value};`)
    .join("\n");
  return `:root{\n${decls}\n}`;
}

/** A captioned panel framing a group of components in the showcase. */
function section(title: string, caption: string, content: string): string {
  return `<section style="${style(["margin-bottom:" + varRef("sizeXXL")])}">
    <h2 style="${style([
      "margin:0",
      "font-size:" + varRef("fontSizeHeading4"),
      "font-weight:" + varRef("fontWeightStrong"),
      "line-height:" + varRef("lineHeightHeading"),
      "color:" + varRef("colorText"),
    ])}">${esc(title)}</h2>
    <p style="${style([
      "margin:" + varRef("sizeXXS") + " 0 " + varRef("sizeLG"),
      "font-size:" + varRef("fontSize"),
      "color:" + varRef("colorTextTertiary"),
    ])}">${esc(caption)}</p>
    ${content}
  </section>`;
}

export function renderKitPage(
  tokens: DesignTokens,
  opts?: { title?: string; brandName?: string; fontLinks?: string; displayFamily?: string },
): string {
  const title = opts?.title ?? "Brand component kit";
  const brandName = opts?.brandName ?? "Brand";

  const flexRow = style(["display:flex", "flex-wrap:wrap", "gap:" + varRef("size"), "align-items:center"]);
  const grid3 = style([
    "display:grid",
    "grid-template-columns:repeat(auto-fit,minmax(220px,1fr))",
    "gap:" + varRef("sizeLG"),
  ]);

  const buttons = `<div style="${flexRow}">
    ${button({ label: "Primary", type: "primary" })}
    ${button({ label: "Default", type: "default" })}
    ${button({ label: "Dashed", type: "dashed" })}
    ${button({ label: "Text", type: "text" })}
    ${button({ label: "Link", type: "link" })}
  </div>
  <div style="${style([flexRow, "margin-top:" + varRef("size")])}">
    ${button({ label: "Small", type: "primary", size: "sm" })}
    ${button({ label: "Medium", type: "primary", size: "md" })}
    ${button({ label: "Large", type: "primary", size: "lg" })}
  </div>`;

  const cards = `<div style="${grid3}">
    ${card({
      title: "Overview",
      body: "Cards group related content on an elevated surface. Radius, border and shadow all read from the derived tokens.",
      footer: button({ label: "Learn more", type: "link", size: "sm" }),
    })}
    ${card({
      title: "Usage",
      body: "Drop the same component into a dark or compact theme and it re-skins automatically — no per-variant markup.",
    })}
    ${card({
      body: "A bodyonly card. " + tag({ label: "live" }) + " " + tag({ label: "beta" }),
    })}
  </div>`;

  const inputs = `<div style="${style([
    "display:grid",
    "grid-template-columns:repeat(auto-fit,minmax(240px,1fr))",
    "gap:" + varRef("sizeLG"),
    "max-width:720px",
  ])}">
    ${input({ label: "Email", placeholder: "you@example.com" })}
    ${input({ label: "Project name", value: brandName })}
    ${select({ label: "Team size", options: ["Just me", "2–10", "11–50", "50+"], value: "2–10" })}
    ${textarea({ label: "Message", placeholder: "Tell us what you're building…", rows: 3 })}
  </div>
  <div style="${style([flexRow, "margin-top:" + varRef("sizeLG"), "gap:" + varRef("sizeLG")])}">
    ${checkbox({ label: "Email me product updates", checked: true })}
    ${checkbox({ label: "I agree to the terms" })}
    ${switchToggle({ on: true, label: "Notifications" })}
    ${switchToggle({ on: false, label: "Public profile" })}
  </div>`;

  const navigation = `${tabs({ items: ["Overview", "Analytics", "Reports", "Settings"], active: 0 })}
  <div style="${style([
    flexRow,
    "margin-top:" + varRef("sizeLG"),
    "justify-content:space-between",
    "gap:" + varRef("sizeLG"),
  ])}">
    ${breadcrumb({ items: [brandName, "Projects", "Brand system"] })}
    ${pagination({ total: 5, current: 2 })}
  </div>
  <div style="margin-top:${varRef("sizeXL")};">
    ${steps({
      current: 1,
      items: [
        { title: "Connect", description: "Point at a source" },
        { title: "Derive", description: "Seed to tokens" },
        { title: "Ship", description: "Export everywhere" },
      ],
    })}
  </div>`;

  const dataDisplay = `${table({
    columns: ["Token", "Role", "Value"],
    rows: [
      ["colorPrimary", "Brand accent", "seed"],
      ["fontSize", "Body type base", "derived"],
      ["borderRadius", "Corner rounding", "derived"],
    ],
  })}
  <div style="${style([
    "display:grid",
    "grid-template-columns:repeat(auto-fit,minmax(140px,1fr))",
    "gap:" + varRef("sizeLG"),
    "margin-top:" + varRef("sizeXL"),
  ])}">
    ${stat({ value: "10k+", label: "Teams onboard" })}
    ${stat({ value: "99.9%", label: "Uptime SLA" })}
    ${stat({ value: "4.9/5", label: "Average rating" })}
  </div>
  <div style="${style([flexRow, "margin-top:" + varRef("sizeXL")])}">
    ${avatar({ name: brandName, size: "lg" })}
    ${avatar({ name: "Ada Lovelace" })}
    ${avatar({ name: "Tim B", size: "sm" })}
    ${tag({ label: "design" })} ${tag({ label: "ops", color: "colorSuccess" })}
  </div>
  <div style="margin-top:${varRef("sizeXL")};">
    ${accordion({
      open: 0,
      items: [
        { title: "What is a seed token?", body: "The ~20-field input every other token is derived from. Change one field and the whole system follows." },
        { title: "Can I theme dark mode separately?", body: "No need — dark is the same seed run through a different algorithm, so it can never drift from the light theme." },
      ],
    })}
  </div>`;

  const marketing = `<div style="${grid3}">
    ${testimonial({
      quote: "We replaced three hand-maintained style guides with one generated system.",
      name: "Ada Lovelace",
      role: "Design lead",
    })}
    ${pricingCard({
      plan: "Pro",
      price: "$29",
      period: "/ mo",
      blurb: "For growing teams.",
      features: ["Unlimited brands", "Dark & compact themes", "Priority support"],
      cta: "Start free trial",
      highlighted: true,
    })}
    ${card({
      title: "Composable",
      body: "Marketing blocks (testimonials, pricing, stats) compose the same primitives — so a landing page is just kit pieces in the right order.",
      footer: button({ label: "View artifacts", type: "link", size: "sm" }),
    })}
  </div>`;

  const tags = `<div style="${flexRow}">
    ${tag({ label: "Primary" })}
    ${tag({ label: "Success", color: "colorSuccess" })}
    ${tag({ label: "Warning", color: "colorWarning" })}
    ${tag({ label: "Error", color: "colorError" })}
    ${tag({ label: "Info", color: "colorInfo" })}
  </div>`;

  const alerts = `<div style="${style(["display:flex", "flex-direction:column", "gap:" + varRef("size")])}">
    ${alert({ type: "success", message: "Brand system generated", description: "All design tokens were derived from a single seed color." })}
    ${alert({ type: "info", message: "Tokens map 1:1 onto CSS custom properties." })}
    ${alert({ type: "warning", message: "Wireframe mode is off", description: "Filled surfaces are in use for this theme." })}
    ${alert({ type: "error", message: "Could not reach the source URL." })}
  </div>
  <div style="${style([
    "display:flex",
    "flex-direction:column",
    "gap:" + varRef("sizeSM"),
    "margin-top:" + varRef("sizeXL"),
    "max-width:480px",
  ])}">
    ${progress({ percent: 72 })}
    ${progress({ percent: 100 })}
  </div>`;

  const palette = swatches(tokens);
  const scale = typeScale(tokens);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(title)}</title>
${opts?.fontLinks ?? ""}
<style>
${rootVars(tokens)}
*{box-sizing:border-box}
html,body{margin:0;padding:0}
body{
  font-family:${varRef("fontFamily")};
  font-size:${varRef("fontSize")};
  line-height:${varRef("lineHeight")};
  color:${varRef("colorText")};
  background:${varRef("colorBgLayout")};
  -webkit-font-smoothing:antialiased;
}
h1,h2,h3{font-family:${opts?.displayFamily ?? varRef("fontFamily")}}
a{color:inherit}
${KIT_CSS}
.wrap{max-width:960px;margin:0 auto;padding:${varRef("sizeXXL")} ${varRef("sizeLG")}}
.panel{
  background:${varRef("colorBgContainer")};
  border:${varRef("lineWidth")} solid ${varRef("colorBorderSecondary")};
  border-radius:${varRef("borderRadiusLG")};
  padding:${varRef("sizeXL")};
  margin-bottom:${varRef("sizeXL")};
}
</style>
</head>
<body>
<div class="wrap">
  <header style="${style(["margin-bottom:" + varRef("sizeXXL")])}">
    <div style="${style([
      "display:inline-flex",
      "align-items:center",
      "gap:" + varRef("sizeXS"),
      "padding:" + varRef("sizeXXS") + " " + varRef("sizeSM"),
      "border-radius:" + varRef("borderRadius"),
      "background:" + varRef("colorPrimaryBg"),
      "color:" + varRef("colorPrimary"),
      "font-size:" + varRef("fontSizeSM"),
      "font-weight:" + varRef("fontWeightStrong"),
    ])}">${esc(brandName)} · ${esc(tokens.algorithm)} theme</div>
    <h1 style="${style([
      "margin:" + varRef("size") + " 0 " + varRef("sizeXXS"),
      "font-size:" + varRef("fontSizeHeading1"),
      "font-weight:" + varRef("fontWeightStrong"),
      "line-height:" + varRef("lineHeightHeading"),
      "color:" + varRef("colorText"),
    ])}">${esc(title)}</h1>
    <p style="${style([
      "margin:0",
      "max-width:60ch",
      "font-size:" + varRef("fontSizeLG"),
      "color:" + varRef("colorTextSecondary"),
    ])}">Every component below is colored only by <code style="font-family:${varRef("fontFamilyCode")}">var(--brand-*)</code> custom properties derived from one seed.</p>
  </header>

  <div class="panel">${section("Buttons", "Five types across three sizes.", buttons)}</div>
  <div class="panel">${section(
    "Form controls",
    "Inputs, selects, textareas, checkboxes and switches share control height, radius and focus ring.",
    inputs,
  )}</div>
  <div class="panel">${section(
    "Navigation",
    "Tabs, breadcrumbs, pagination and steps for app shells and flows.",
    navigation,
  )}</div>
  <div class="panel">${section("Cards", "Elevated content surfaces with optional header & footer.", cards)}</div>
  <div class="panel">${section(
    "Data display",
    "Tables, stats, avatars and a no-JS accordion for structured content.",
    dataDisplay,
  )}</div>
  <div class="panel">${section(
    "Marketing blocks",
    "Testimonials and pricing compose the primitives — landing pages are these in the right order.",
    marketing,
  )}</div>
  <div class="panel">${section("Tags", "Compact labels keyed to functional colors.", tags)}</div>
  <div class="panel">${section("Alerts & progress", "Semantic feedback states.", alerts)}</div>
  <div class="panel">${section("Color", "The full derived palette and neutrals.", palette)}</div>
  <div class="panel">${section("Type scale", "A modular ramp derived from the base font size.", scale)}</div>
</div>
</body>
</html>`;
}
