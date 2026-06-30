#!/usr/bin/env node
/*
 * validate-social-deck.mjs
 *
 *   node validate-social-deck.mjs <task-dir|index.html>
 *
 * Checks each <section class="poster …"> in the target HTML against the rules
 * codified in SKILL.md / qa-checklist.md / components.md. Exits 1 if any FAIL.
 *
 * Rules implemented:
 *   R1  overflow              scrollHeight > clientHeight on the poster
 *   R2  footer collision      .foot is position:absolute AND content above reaches into its band
 *   R3  swiss bold display    .h-xl / .h-hero / .h-statement / .num-mega with computed weight >= 600
 *   R4  min readable font     body/lead/caption/label/meta below the mobile-safe floor
 *   R5  4-band density        on 3:4 boards: <75% filled OR any under-filled band > 216px
 *   R6  h-xl hard cap         display title lines/chars exceed the per-board cap
 *   R7  figure margin drift    browser-default <figure> margin offsets media alignment
 */
import { chromium } from "playwright";
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";

const args = process.argv.slice(2);
let target = null;
let styleOverride = null;
for (const a of args) {
  if (a.startsWith("--style=")) styleOverride = a.slice(8);
  else if (!target) target = a;
}
if (!target) {
  console.error("usage: node validate-social-deck.mjs <task-dir|index.html> [--style=swiss|editorial]");
  process.exit(2);
}
const abs = path.resolve(target);
let htmlPath = abs;
if (fs.statSync(abs).isDirectory()) {
  htmlPath = path.join(abs, "index.html");
}
if (!fs.existsSync(htmlPath)) {
  console.error(`not found: ${htmlPath}`);
  process.exit(2);
}

const url = "file://" + htmlPath;
const browser = await chromium.launch({
  args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"],
});
const ctx = await browser.newContext({
  viewport: { width: 1400, height: 1700 },
  deviceScaleFactor: 1,
});
const page = await ctx.newPage();
await page.goto(url, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

const style = styleOverride || await page.evaluate(() => {
  const html = document.documentElement;
  if (html.dataset.theme) return "editorial";
  if (html.dataset.accent) return "swiss";
  // Fallback: any display class using a serif family = editorial; otherwise swiss.
  // Note: "sans-serif" generic name also contains the substring "serif", so we
  // match on serif-only families by token, not substring.
  const SERIF_TOKENS = ["noto serif", "playfair", "source serif", "songti", "stsong", "simsun", "serif sc", "kinfolk", "merriweather"];
  for (const n of document.querySelectorAll(".h-display, .h-xl, .h-hero, .pullquote, .h-statement")) {
    const ff = getComputedStyle(n).fontFamily.toLowerCase();
    if (SERIF_TOKENS.some(t => ff.includes(t))) return "editorial";
  }
  return "swiss";
});

const sections = await page.$$("section.poster");
const report = [];

// "Obviously too small" floors — below these, text becomes unreadable at phone size.
// Seeds use 26-28px body, 30-32px lead — those are fine. Anything 4+px below is suspect.
const MIN_FONT = {
  body: 22,
  lead: 26,
  caption: 18,
  meta: 18,
  cellTitle: 20,
  numAnnotation: 20,
};

const HXL_CAPS = {
  xhs:    { maxLines: 2, maxChars: 8 },
  square: { maxLines: 2, maxChars: 7 },
  wide:   { maxLines: 1, maxChars: 14 },
};

const DISPLAY_CLASSES = ["h-xl", "h-hero", "h-statement", "h-display", "num-mega", "num-xl"];

for (const s of sections) {
  const meta = await s.evaluate(el => {
    const w = el.clientWidth, h = el.clientHeight;
    let board = el.classList.contains("xhs") ? "xhs"
              : el.classList.contains("square") ? "square"
              : el.classList.contains("wide") ? "wide" : null;
    if (!board) {
      const ratio = w / h;
      if (Math.abs(ratio - 0.75) < 0.02) board = "xhs";        // 3:4
      else if (Math.abs(ratio - 1.0) < 0.02) board = "square"; // 1:1
      else if (Math.abs(ratio - 7 / 3) < 0.05) board = "wide"; // 21:9
      else board = "unknown";
    }
    return { id: el.id || "(no-id)", dataId: el.dataset.id || "", board, clientH: h, scrollH: el.scrollHeight, clientW: w };
  });
  const fails = [];
  const warns = [];

  // R1 overflow
  const overflow = meta.scrollH - meta.clientH;
  if (overflow > 4) {
    fails.push({ rule: "R1", msg: `overflow ${overflow}px (scrollH ${meta.scrollH} > clientH ${meta.clientH})`, fix: "tighten content or switch to a higher-capacity recipe" });
  }

  // R2 footer collision — only flag leaf text or media nodes, not containers
  // whose bbox merely shares y-space with an absolute-positioned strip.
  const footIssue = await s.evaluate(el => {
    const foot = el.querySelector(".foot, .issue-strip, .magazine-foot");
    if (!foot) return null;
    const cs = getComputedStyle(foot);
    if (cs.position !== "absolute") return null;
    const footTop = foot.offsetTop;
    const er = el.getBoundingClientRect();
    const hasOwnText = n => {
      for (const c of n.childNodes) {
        if (c.nodeType === 3 && c.textContent.trim().length > 0) return true;
      }
      return false;
    };
    const isMedia = n => n.tagName === "IMG" || n.tagName === "CANVAS" || n.tagName === "SVG" || n.tagName === "FIGURE";
    let worstOverlap = 0;
    let worstSel = "";
    const posterArea = el.clientWidth * el.clientHeight;
    for (const node of el.querySelectorAll("*")) {
      if (node === foot || foot.contains(node)) continue;
      if (!hasOwnText(node) && !isMedia(node)) continue;
      const r = node.getBoundingClientRect();
      // Skip full-bleed background layers (>=95% of poster area + position:absolute).
      const ncs = getComputedStyle(node);
      if (ncs.position === "absolute" && r.width * r.height >= posterArea * 0.95) continue;
      const bottom = r.bottom - er.top;
      if (bottom > footTop + 2) {
        const overlap = bottom - footTop;
        if (overlap > worstOverlap) {
          worstOverlap = overlap;
          worstSel = node.className ? "." + node.className.split(" ").filter(Boolean).join(".") : node.tagName.toLowerCase();
        }
      }
    }
    return worstOverlap > 6 ? { overlap: Math.round(worstOverlap), sel: worstSel, footTop } : null;
  });
  if (footIssue) {
    fails.push({ rule: "R2", msg: `.foot is position:absolute, ${footIssue.sel} extends ${footIssue.overlap}px past foot top`, fix: "switch .foot to flex margin-top:auto (see style-system.md Anti-pattern C)" });
  }

  // R3 swiss bold display
  if (style === "swiss") {
    const bolds = await s.evaluate((el, cls) => {
      const out = [];
      for (const c of cls) {
        for (const n of el.querySelectorAll("." + c)) {
          const cs = getComputedStyle(n);
          const w = parseInt(cs.fontWeight, 10);
          const size = parseFloat(cs.fontSize);
          if (size >= 72 && w >= 600) {
            out.push({ cls: c, weight: w, size: Math.round(size), text: n.textContent.trim().slice(0, 20) });
          }
        }
      }
      return out;
    }, DISPLAY_CLASSES);
    for (const b of bolds) {
      fails.push({ rule: "R3", msg: `.${b.cls} "${b.text}" is ${b.size}px @ weight ${b.weight} — Swiss "larger = lighter" hard rule`, fix: "remove inline font-weight; use the typed class default (200-300)" });
    }
  }

  // R4 min readable font
  const textChecks = await s.evaluate((el, MIN) => {
    const out = [];
    const seen = new Set();
    const test = (selector, role, min, requireLeaf = true) => {
      for (const n of el.querySelectorAll(selector)) {
        if (seen.has(n)) continue;
        seen.add(n);
        // Skip containers — typography roles only apply to leaf text nodes.
        // A real `.lead` is a <p>; `.role-card.lead` is a container with children.
        if (requireLeaf && n.children.length > 0) continue;
        // Skip decorative chips inside map pins — labels are sized to fit on the map by design.
        if (n.closest(".map-pin .card")) continue;
        const cs = getComputedStyle(n);
        const size = parseFloat(cs.fontSize);
        const text = n.textContent.trim();
        if (!text) continue;
        if (size > 0 && size < min) {
          out.push({ role, selector, min, size: Math.round(size), text: text.slice(0, 30) });
        }
      }
    };
    test(".body, p.body", "body", MIN.body);
    test(".lead", "lead", MIN.lead);
    test(".kicker, .cap, .caption, .swiss-img-caption, .h-sub", "caption", MIN.caption);
    test(".meta, .label, .mono", "meta", MIN.meta);
    test(".matrix-fill .cell-title, .brief-card .title, .char-grid .name", "cellTitle", MIN.cellTitle);
    test(".stat-card .lbl, .ledger .sub, .num .sub", "numAnnotation", MIN.numAnnotation);
    return out;
  }, MIN_FONT);
  for (const t of textChecks) {
    warns.push({ rule: "R4", msg: `${t.role} "${t.text}" at ${t.size}px < ${t.min}px floor`, fix: "cut copy instead of shrinking type (components.md Minimum Readable Sizes)" });
  }

  // R7 figure margin drift — catches browser-default 40px figure margins on custom media blocks.
  const figureDrift = await s.evaluate(el => {
    const out = [];
    for (const fig of el.querySelectorAll("figure")) {
      const cs = getComputedStyle(fig);
      const ml = parseFloat(cs.marginLeft) || 0;
      const mr = parseFloat(cs.marginRight) || 0;
      if (ml >= 16 || mr >= 16) {
        const text = fig.textContent.trim().replace(/\s+/g, " ").slice(0, 32);
        out.push({
          cls: fig.className ? "." + fig.className.split(" ").filter(Boolean).join(".") : "figure",
          ml: Math.round(ml),
          mr: Math.round(mr),
          text,
        });
      }
    }
    return out;
  });
  for (const f of figureDrift) {
    warns.push({ rule: "R7", msg: `${f.cls} has horizontal figure margin ${f.ml}px / ${f.mr}px${f.text ? ` near "${f.text}"` : ""}`, fix: "reset figure margins in the seed or task CSS: .poster figure { margin: 0; }" });
  }

  // R5 4-band density (3:4 only)
  if (meta.board === "xhs") {
    const bands = await s.evaluate(el => {
      const er = el.getBoundingClientRect();
      const H = el.clientHeight;
      // Pixel-row occupancy bitmap. Mark any row covered by a content element.
      const rows = new Uint8Array(H);
      const hasDirectText = n => {
        for (const c of n.childNodes) {
          if (c.nodeType === 3 && c.textContent.trim().length > 0) return true;
        }
        return false;
      };
      for (const n of el.querySelectorAll("*")) {
        const r = n.getBoundingClientRect();
        if (r.width < 8 || r.height < 8) continue;
        const tag = n.tagName;
        const cs = getComputedStyle(n);
        const isText = hasDirectText(n);
        const isImg = tag === "IMG" || tag === "CANVAS" || tag === "SVG"
                    || (cs.backgroundImage && cs.backgroundImage !== "none");
        const isRule = tag === "HR" || (parseFloat(cs.borderTopWidth) >= 1 && r.height < 4);
        const hasFill = cs.backgroundColor && !cs.backgroundColor.match(/rgba?\(\s*0\s*,\s*0\s*,\s*0\s*,\s*0?\s*\)/) && cs.backgroundColor !== "transparent";
        if (!isText && !isImg && !isRule && !hasFill) continue;
        const top = Math.max(0, Math.floor(r.top - er.top));
        const bot = Math.min(H, Math.ceil(r.bottom - er.top));
        for (let y = top; y < bot; y++) rows[y] = 1;
      }
      const BAND = H / 4;
      const occ = [0, 0, 0, 0];
      for (let i = 0; i < 4; i++) {
        let count = 0;
        const bTop = Math.floor(i * BAND), bBot = Math.floor((i + 1) * BAND);
        for (let y = bTop; y < bBot; y++) count += rows[y];
        occ[i] = count / (bBot - bTop);
      }
      return { H, BAND, occ };
    });
    const total = bands.occ.reduce((a, b) => a + b, 0) / 4;
    const pct = (o) => Math.round(o * 100) + "%";
    if (total < 0.745) {
      warns.push({ rule: "R5", msg: `density ${pct(total)} (bands ${bands.occ.map(pct).join(" / ")})`, fix: "expand copy or switch recipe — see qa-checklist.md 4-band density" });
    }
    for (let i = 0; i < 3; i++) {
      if (bands.occ[i] < 0.15 && bands.occ[i + 1] < 0.15) {
        warns.push({ rule: "R5", msg: `bands ${i + 1}+${i + 2} both under-filled (${pct(bands.occ[i])} / ${pct(bands.occ[i + 1])}) — >25% void mid-poster`, fix: "expand body content or insert a marginalia column" });
        break;
      }
    }
  }

  // R6 h-xl hard cap
  const cap = HXL_CAPS[meta.board];
  if (cap) {
    const titles = await s.evaluate(el => {
      const out = [];
      for (const n of el.querySelectorAll(".h-xl, .h-hero, .h-display, .h-statement")) {
        const cs = getComputedStyle(n);
        const size = parseFloat(cs.fontSize);
        const lineH = parseFloat(cs.lineHeight) || size * 1.2;
        const lines = Math.round(n.getBoundingClientRect().height / lineH);
        out.push({ cls: n.className.split(" ")[0], text: n.textContent.trim(), lines, size: Math.round(size) });
      }
      return out;
    });
    for (const t of titles) {
      const longestLine = t.text.split(/\s+/).reduce((m, w) => Math.max(m, w.length), t.text.length);
      if (t.lines > cap.maxLines) {
        warns.push({ rule: "R6", msg: `.${t.cls} "${t.text}" renders ${t.lines} lines (cap ${cap.maxLines} on ${meta.board})`, fix: "switch to S01/S05 cover recipes that allow taller titles, or trim copy" });
      } else if (longestLine > cap.maxChars + 2) {
        // soft warn only — wraps naturally
      }
    }
  }

  report.push({ meta, fails, warns });
}

await browser.close();

let totalFail = 0, totalWarn = 0;
const ruleCounts = new Map();
for (const { fails, warns } of report) {
  totalFail += fails.length;
  totalWarn += warns.length;
  for (const v of [...fails, ...warns]) ruleCounts.set(v.rule, (ruleCounts.get(v.rule) || 0) + 1);
}
const cleanCount = report.filter(r => r.fails.length === 0 && r.warns.length === 0).length;

const lines = [];
lines.push(`==== validate-social-deck ====`);
lines.push(`target:   ${path.relative(process.cwd(), htmlPath)}`);
lines.push(`style:    ${style}`);
lines.push(`sections: ${report.length}  ·  ${cleanCount} clean  ·  ${totalFail} fails  ·  ${totalWarn} warns`);
if (ruleCounts.size > 0) {
  const ruleSummary = [...ruleCounts.entries()].sort().map(([r, c]) => `${r}=${c}`).join("  ");
  lines.push(`rules:    ${ruleSummary}`);
}
lines.push("");

const fixCache = new Map();
for (const { meta, fails, warns } of report) {
  if (fails.length === 0 && warns.length === 0) {
    lines.push(`[PASS]  ${meta.id} ${meta.dataId ? ` · ${meta.dataId}` : ""} · ${meta.board}`);
    continue;
  }
  const tag = fails.length ? "[FAIL]" : "[WARN]";
  lines.push(`${tag}  ${meta.id} ${meta.dataId ? ` · ${meta.dataId}` : ""} · ${meta.board}`);
  for (const v of [...fails, ...warns]) {
    const sev = fails.includes(v) ? "FAIL" : "WARN";
    lines.push(`  ${sev} · ${v.rule}  ${v.msg}`);
    if (!fixCache.has(v.rule)) {
      lines.push(`         fix: ${v.fix}`);
      fixCache.set(v.rule, true);
    }
  }
}

lines.push("");
lines.push(`Legend: R1 overflow · R2 footer collision · R3 swiss bold display · R4 min font · R5 4-band density · R6 h-xl cap · R7 figure margin drift`);
lines.push(`Exit code 1 only on FAIL. Warnings are advisory.`);

console.log(lines.join("\n"));
process.exit(totalFail > 0 ? 1 : 0);
