#!/usr/bin/env node
// Design-panel e2e smoke: drives agent-browser against a running preview of the
// design-panel-qa fixture and asserts selection + one representative input per
// panel section persists to disk.
//
// Usage:
//   1. Copy fixtures/design-panel-qa to a scratch dir OUTSIDE the repo.
//   2. Start the CLI there: node <repo>/packages/cli/dist/cli.js preview --no-open
//   3. STUDIO_URL=http://localhost:3002 PROJECT_DIR=<scratch dir> node design-panel.mjs
//
// Requires the agent-browser CLI on PATH. Exits non-zero on any failed cell.
// Automation notes (learned the hard way, see design-panel-qa-matrix.md):
// - Inspector defaults OFF on fresh load; the script toggles it on.
// - Selection commits on real CDP mouse events at canvas coordinates; element-ref
//   clicks on off-viewport nodes can hit sidebar helper buttons instead.
// - Commit fires on Enter/blur only when the draft differs from the last value.
// - Range inputs need input+change+pointerup; selects need change.
// - Panel sections are found by the app's own `data-panel-section` attribute, not
//   by matching h3 display text, and specific fields are found by their sibling
//   label span (or, where there's no label, by being the section's only input of
//   that type) — not by guessing the fixture's current value. Both survive wording
//   or fixture-default changes that would otherwise break this script silently.
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const STUDIO_URL = process.env.STUDIO_URL || "http://localhost:3002";
const PROJECT_DIR = process.env.PROJECT_DIR;
if (!PROJECT_DIR) {
  console.error("PROJECT_DIR env var is required (scratch copy of the design-panel-qa fixture)");
  process.exit(2);
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;

function ab(...args) {
  try {
    return execFileSync("agent-browser", args, { encoding: "utf8", timeout: 30000 });
  } catch (e) {
    return "ERR: " + (e.stdout || "") + (e.stderr || e.message);
  }
}
function abEval(code) {
  const out = ab("eval", code).trim();
  let v;
  try {
    v = JSON.parse(out);
  } catch {
    return out;
  }
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return v;
    }
  }
  return v;
}
function check(id, ok, detail) {
  console.log(`${ok ? "PASS" : "FAIL"} ${id}${detail ? " " + detail : ""}`);
  if (!ok) {
    failures += 1;
    console.log(`  patchLog: ${JSON.stringify(abEval("window.__patchLog"))}`);
  }
}
function disk(file, needle) {
  try {
    return readFileSync(`${PROJECT_DIR}/${file}`, "utf8").includes(needle);
  } catch {
    return false;
  }
}
// The patch fetch resolving client-side doesn't guarantee the server's file
// write has landed yet (seen in practice on the very first commit of a run).
// Poll disk instead of asserting immediately after the in-browser signal.
async function waitForDisk(file, needle, timeout = 3000) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (disk(file, needle)) return true;
    await sleep(100);
  }
  return false;
}
// Polls a page-context boolean expression instead of sleeping a fixed duration:
// faster on a healthy run, and it fails loudly (returns false) rather than
// silently passing on a slow one.
async function waitFor(expr, { timeout = 8000, interval = 150 } = {}) {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    if (abEval(expr) === true) return true;
    await sleep(interval);
  }
  return false;
}

const HELPERS = String.raw`
(() => {
  window.__patchLog = window.__patchLog || [];
  window.__qaFault = window.__qaFault || null;
  if (!window.__qaShim) {
    window.__qaShim = true;
    const orig = window.fetch;
    window.fetch = async function(...args) {
      const url = typeof args[0] === 'string' ? args[0] : (args[0] && args[0].url) || '';
      if (window.__qaFault && url.includes(window.__qaFault.match)) {
        const fault = window.__qaFault;
        window.__qaFault = null; // one-shot
        window.__patchLog.push({ t: Date.now(), url, status: fault.status, req: null, resp: '(fault injected)' });
        return new Response(JSON.stringify({ error: 'e2e injected fault' }), {
          status: fault.status,
          headers: { 'content-type': 'application/json' },
        });
      }
      const isMut = url.includes('file-mutations') || url.includes('gsap-mutations') || (args[1] && args[1].method && args[1].method !== 'GET' && url.includes('/api/'));
      let body = null;
      if (isMut && args[1] && typeof args[1].body === 'string') body = args[1].body.slice(0, 1500);
      const res = await orig.apply(this, args);
      if (isMut) {
        const clone = res.clone();
        let respText = '';
        try { respText = (await clone.text()).slice(0, 300); } catch {}
        window.__patchLog.push({ t: Date.now(), url, status: res.status, req: body, resp: respText });
      }
      return res;
    };
  }
  const qa = {};
  qa.frame = () => {
    const frames = [];
    const collect = (root) => {
      for (const f of root.querySelectorAll('iframe')) { try { if (f.contentDocument && f.contentDocument.querySelector('#design-panel-qa')) frames.push(f); } catch {} }
      for (const el of root.querySelectorAll('*')) { if (el.shadowRoot) collect(el.shadowRoot); }
    };
    collect(document);
    return frames.sort((a, b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;
  };
  qa.coords = (sel) => {
    const f = qa.frame();
    if (!f) return null;
    const el = f.contentDocument.querySelector(sel);
    if (!el) return null;
    const r = el.getBoundingClientRect();
    const fr = f.getBoundingClientRect();
    const scale = fr.width / 1920;
    const x = fr.x + (r.x + Math.min(r.width, 80) / 2) * scale;
    const y = fr.y + (r.y + Math.min(r.height, 60) / 2) * scale;
    if (x < fr.x || x > fr.x + fr.width || y < fr.y || y > fr.y + fr.height) return null;
    return [Math.round(x), Math.round(y)];
  };
  qa.lastSel = () => {
    const s = window.__patchLog.filter(p => p.url.includes('/selection')).slice(-1)[0];
    if (!s) return null;
    const req = s.req || '';
    if (req.includes('"selection":null')) return { nullSel: true };
    const m = (k) => { const r = new RegExp('"' + k + '":"([^"]*)"').exec(req); return r ? r[1] : null; };
    return { label: m('label'), selector: m('selector'), hfId: m('hfId'), src: m('sourceFile') };
  };
  qa.clear = () => { window.__patchLog.length = 0; return 'cleared'; };
  qa.section = (slug) => document.querySelector('[data-panel-section="' + slug + '"]');
  qa.sectionInputs = (slug) => {
    const section = qa.section(slug);
    if (!section) return null;
    return [...section.querySelectorAll('input, textarea, select')];
  };
  qa.ensureSection = (slug) => {
    const section = qa.section(slug);
    if (!section) return 'no section: ' + slug;
    const inputs = qa.sectionInputs(slug);
    if (inputs && inputs.length) return 'open';
    const header = section.querySelector('button');
    if (header) header.click();
    return 'clicked';
  };
  // Walks up a few ancestor levels looking for a preceding <span> label — covers
  // both a field whose label is a direct sibling of its input (MetricField) and
  // one whose label sits beside the input's wrapper (a hand-rolled SliderControl
  // row). More robust than hardcoding either shape.
  qa.labelFor = (el) => {
    let node = el;
    for (let i = 0; i < 3 && node; i++) {
      const sib = node.previousElementSibling;
      if (sib && sib.tagName === 'SPAN' && sib.textContent.trim()) return sib.textContent.trim();
      node = node.parentElement;
    }
    return null;
  };
  qa.pickByLabel = (slug, label) => {
    const inputs = qa.sectionInputs(slug);
    if (!inputs) return null;
    return inputs.find((el) => qa.labelFor(el) === label) || null;
  };
  qa.pickByType = (slug, type) => {
    const inputs = qa.sectionInputs(slug);
    if (!inputs) return null;
    const matches = inputs.filter((el) => el.type === type);
    return matches.length === 1 ? matches[0] : null;
  };
  qa.setEl = (el, value) => {
    if (!el) return { error: 'no matching field' };
    const from = el.value;
    if (el.tagName === 'SELECT') {
      const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value').set;
      setter.call(el, value);
      el.dispatchEvent(new Event('change', { bubbles: true }));
      return { from, to: value };
    }
    el.focus();
    const proto = el.tagName === 'TEXTAREA' ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
    const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
    if (el.type === 'range') {
      el.dispatchEvent(new Event('change', { bubbles: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true }));
    } else {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
      el.blur();
    }
    return { from, to: value };
  };
  qa.enableInspector = () => {
    if ([...document.querySelectorAll('h3, [class*="panel"]')].length && document.body.textContent.includes('Select an element')) return 'on';
    const btn = [...document.querySelectorAll('button')].find(b => b.textContent.trim() === 'Inspector');
    if (!btn) return 'no inspector button';
    btn.click();
    return 'toggled';
  };
  qa.injectFault = (match, status) => { window.__qaFault = { match, status: status || 500 }; return 'armed'; };
  window.__qa = qa;
  return 'qa ready';
})()`;

const FRAME_SIGNATURE_EXPR =
  "(() => { const f = window.__qa.frame(); if (!f) return null; const r = f.getBoundingClientRect(); return Math.round(r.x*1000+r.y*100+r.width*10+r.height); })()";

// A prior commit can resize the property panel (opening it, or its content
// changing height), which shifts the preview frame's on-page position. Computing
// click coordinates mid-reflow silently clicks the wrong spot — the click still
// lands on the overlay, so it doesn't error, it just selects nothing (or the
// wrong element). Wait for two consecutive reads of the frame's rect to agree
// before trusting it, instead of guessing how long a reflow takes.
async function waitForStableFrame({ tries = 10, interval = 100 } = {}) {
  let prev = abEval(FRAME_SIGNATURE_EXPR);
  for (let i = 0; i < tries; i++) {
    await sleep(interval);
    const next = abEval(FRAME_SIGNATURE_EXPR);
    if (next != null && next === prev) return true;
    prev = next;
  }
  return false;
}

async function select(sel) {
  abEval("window.__qa.clear()");
  await waitForStableFrame();
  const coords = abEval(`window.__qa.coords(${JSON.stringify(sel)})`);
  if (!Array.isArray(coords)) return { error: "no coords" };
  ab("mouse", "move", String(coords[0]), String(coords[1]));
  ab("mouse", "down", "left");
  await sleep(150); // deliberate gesture delay to simulate a real click, not an async wait
  ab("mouse", "up", "left");
  await waitFor("window.__qa.lastSel() !== null");
  return abEval("window.__qa.lastSel()");
}

// `pick` locates the field to edit: byLabel("Size") finds the input beside a
// "Size" label; byType("range") finds the section's sole range input. Neither
// depends on knowing the fixture's current value ahead of time.
const byLabel = (label) => (slug) =>
  `window.__qa.pickByLabel(${JSON.stringify(slug)}, ${JSON.stringify(label)})`;
const byType = (type) => (slug) =>
  `window.__qa.pickByType(${JSON.stringify(slug)}, ${JSON.stringify(type)})`;

async function commit(sectionSlug, pick, value) {
  abEval("window.__qa.clear()");
  abEval(`window.__qa.ensureSection(${JSON.stringify(sectionSlug)})`);
  await waitFor(`(window.__qa.sectionInputs(${JSON.stringify(sectionSlug)}) || []).length > 0`);
  const r = abEval(`window.__qa.setEl(${pick(sectionSlug)}, ${JSON.stringify(value)})`);
  await waitFor("window.__patchLog.length > 0");
  return r;
}

async function openStudio(url) {
  ab("open", url);
  await waitFor("document.readyState === 'complete' && !!document.querySelector('button')", {
    timeout: 15000,
  });
  abEval(HELPERS);
  // "a button exists" fires on the app shell alone; wait for the actual preview
  // iframe to mount before handing control back, or a caller's first frame()
  // lookup races the composition load and comes back null.
  await waitFor("!!window.__qa.frame()", { timeout: 15000 });
}

// fallow-ignore-next-line complexity
async function main() {
  await openStudio(`${STUDIO_URL}/?v=e2e${Date.now()}`);
  abEval("window.__qa.enableInspector()");
  await waitFor("document.body.textContent.includes('Select an element')", { timeout: 5000 });

  let s = await select("#qa-headline");
  check("select.headline", s && s.selector === "#qa-headline", JSON.stringify(s));
  let r = await commit("text", byLabel("Size"), "72px");
  check(
    "text.size",
    await waitForDisk("index.html", "font-size: 72px"),
    `set=${JSON.stringify(r)}`,
  );

  s = await select("#qa-shape");
  check("select.shape", s && s.selector === "#qa-shape", JSON.stringify(s));
  r = await commit("transparency", byType("range"), "80");
  check(
    "style.opacity",
    await waitForDisk("index.html", "opacity: 0.8"),
    `set=${JSON.stringify(r)}`,
  );
  r = await commit("radius", byLabel("All"), "24");
  check(
    "style.radius",
    await waitForDisk("index.html", "border-radius: 24px"),
    `set=${JSON.stringify(r)}`,
  );

  s = await select("#qa-video");
  check("select.video", s && s.selector === "#qa-video", JSON.stringify(s));
  r = await commit("video", byLabel("Volume"), "80");
  check(
    "media.volume",
    await waitForDisk("index.html", 'data-volume="0.8"'),
    `set=${JSON.stringify(r)}`,
  );

  s = await select("#qa-sub-title");
  check(
    "select.sub-title",
    s && s.selector === "#qa-sub-title" && s.src === "compositions/qa-sub.html",
    JSON.stringify(s),
  );
  r = await commit("text", byLabel("Size"), "48px");
  check(
    "sub.text-size",
    await waitForDisk("compositions/qa-sub.html", "font-size: 48px"),
    `set=${JSON.stringify(r)}`,
  );

  // Fault injection: the server rejects the patch — the panel must surface the
  // rejection and the value already on disk (72px, from the first cell) must
  // survive untouched, not silently take on the value that failed to persist.
  s = await select("#qa-headline");
  check("select.headline-again", s && s.selector === "#qa-headline", JSON.stringify(s));
  abEval("window.__qa.injectFault('file-mutations/patch-element', 500)");
  r = await commit("text", byLabel("Size"), "90px");
  await waitFor('document.body.textContent.includes("Couldn\'t save")', { timeout: 4000 });
  const toastShown = abEval('document.body.textContent.includes("Couldn\'t save")');
  check("fault.toast-shown", toastShown === true, `set=${JSON.stringify(r)}`);
  check(
    "fault.no-persist",
    !disk("index.html", "font-size: 90px"),
    "rejected value must not reach disk",
  );
  check(
    "fault.prior-value-survives",
    disk("index.html", "font-size: 72px"),
    "prior committed value must survive",
  );

  // Reload survival for the headline edit.
  await openStudio(`${STUDIO_URL}/?v=r${Date.now()}`);
  const survived = abEval(
    `(() => { const f = window.__qa.frame(); const el = f && f.contentDocument.querySelector('#qa-headline'); return el ? f.contentWindow.getComputedStyle(el).fontSize : null; })()`,
  );
  check("reload.survival", survived === "72px", String(survived));

  console.log(failures === 0 ? "ALL PASS" : `${failures} FAILURES`);
  process.exit(failures === 0 ? 0 : 1);
}
main().catch((e) => {
  console.error("RUNNER ERROR", e);
  process.exit(1);
});
