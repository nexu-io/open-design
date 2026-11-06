// The edit accuracy grid: one flat-coloured element in a generated project, crossed with one gesture.
// Projects are written to a tmp dir per case; nothing checked in is edited.
import { mkdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { dragCases } from "./drags.mjs";

export const COMPOSITION = { width: 1920, height: 1080 };
/** Frame-aligned at 30 fps, inside every tween, so preview and producer sample the same instant. */
export const PLAYHEAD = 1;
export const TARGET = { width: 240, height: 160, color: "#f0c020" };
export const BACKGROUND = "#202020";
const NESTED_HOST = { left: 160, top: 90, width: 1600, height: 900 };
// Fixtures keep the CDN URL users author; the bench serves it from the repo's gsap (`localAsset`).
const require = createRequire(import.meta.url);
export const FIXTURE_CDN = "https://cdn.jsdelivr.net/";
const GSAP_DIST = `${FIXTURE_CDN}npm/gsap@${require("gsap/package.json").version}/dist/`;
const GSAP_CDN = `${GSAP_DIST}gsap.min.js`;
const LOCAL_GSAP_DIST = dirname(require.resolve("gsap/dist/gsap.min.js"));

/** The repo file a CDN URL is served from (the installed gsap's dist), so no case waits on the network. */
export function localAsset(url) {
  if (!url.startsWith(GSAP_DIST)) return undefined;
  const file = join(LOCAL_GSAP_DIST, url.slice(GSAP_DIST.length));
  return statSync(file, { throwIfNoEntry: false })?.isFile() ? file : undefined;
}

// Studio has corner handles only (ResizeHandle is nw|ne|sw|se); its edge strips crop, so there is no edge resize.
const GESTURES = ["move", "resize", "rotate", "crop", "nudge"];
// Trimmed from 2061 cases: across 444 historical result snapshots, zoom 200, the pct and center placements and most nested
// keyframed cases never failed where a kept case with the same gesture, GSAP mode and playhead did not. Drag paths and
// sequences still cover pct, center and zoom 200.
const AXES = {
  // idle: GSAP loaded and a paused timeline tweens another element; the target itself is plain CSS.
  gsap: ["none", "idle", "tween", "hold"],
  placement: ["px", "xpercent"],
  rotation: [0, 30],
  nesting: ["root", "nested"],
  zoom: [50, 100],
};

// Timelines with keyframes at `times` (0, 2 and 3 s unless set) on the property each animates; `css` is it in CSS.
const T = '"#target"';
const KEYFRAMED = {
  size: {
    lines: [
      `tl.to(${T}, { width: 300, height: 200, duration: 2, ease: "none" }, 0);`,
      `tl.to(${T}, { width: 360, height: 240, duration: 1, ease: "none" }, 2);`,
    ],
    props: ["width", "height"],
    css: ["width", "height"],
  },
  scale: {
    lines: [
      `tl.to(${T}, { scale: 1.25, duration: 2, ease: "none" }, 0);`,
      `tl.to(${T}, { scale: 1.5, duration: 1, ease: "none" }, 2);`,
    ],
    props: ["scaleX", "scaleY"],
    css: ["scale", "transform"],
  },
  spin: {
    lines: [
      `tl.to(${T}, { rotation: 20, duration: 2, ease: "none" }, 0);`,
      `tl.to(${T}, { rotation: 40, duration: 1, ease: "none" }, 2);`,
    ],
    props: ["rotation"],
    css: ["rotate", "transform"],
  },
  // A resize meets a keyframes array that also animates width.
  keys: {
    lines: [
      `tl.to(${T}, { keyframes: [{ x: 60, width: 280, duration: 2, ease: "none" }, { x: 120, width: 320, duration: 1, ease: "none" }] }, 0);`,
    ],
    props: ["x", "width"],
    css: ["left", "top", "translate", "transform", "width"],
  },
  fromto: {
    lines: [
      `tl.from(${T}, { x: -60, duration: 2, ease: "none" }, 0);`,
      `tl.fromTo(${T}, { x: 0 }, { x: 60, duration: 1, ease: "none" }, 2);`,
    ],
    props: ["x"],
    css: ["left", "top", "translate", "transform"],
  },
  late: {
    lines: [
      `tl.to(${T}, { width: 300, height: 200, duration: 1, ease: "none" }, 1);`,
      `tl.to(${T}, { width: 360, height: 240, duration: 1, ease: "none" }, 2);`,
    ],
    props: ["width", "height"],
    css: ["width", "height"],
    times: [1, 2, 3],
  },
};
const KEY_TIMES = [0, 2, 3];
// On a keyframe the edit changes that keyframe; anywhere else, before or after the range too, it adds one there.
const AT = { on: 2, mid: 1, before: 0.5, after: 3.5 };
const playheadsFor = (times) =>
  Object.keys(AT).filter(
    (at) => at === "on" || (!times.includes(AT[at]) && (at !== "before" || AT.before < times[0])),
  );

function keyframedCases() {
  return product({
    gsap: Object.keys(KEYFRAMED),
    placement: ["px"],
    rotation: AXES.rotation,
    nesting: AXES.nesting,
    zoom: AXES.zoom,
    gesture: GESTURES,
  })
    .flatMap((c) => {
      const times = KEYFRAMED[c.gsap].times ?? KEY_TIMES;
      return playheadsFor(times).map((at) => ({
        id: `${caseId(c)}-${at}`,
        ...c,
        at,
        playhead: AT[at],
        keys: {
          times: times.filter((t) => t !== AT[at]),
          props: KEYFRAMED[c.gsap].props,
          css: KEYFRAMED[c.gsap].css,
          render: times.at(-1),
        },
      }));
    })
    .filter((c) => c.nesting === "root" || NESTED_KEYFRAMED(c));
}

// Nested keyframed cases are kept only for a resize on a keyframe at zoom 100 without rotation, so the PR slice
// still catches the nested resize regression two historical gate runs failed on (resize-scale-px-r0-nested-z100-on).
const NESTED_KEYFRAMED = (c) =>
  c.gesture === "resize" && c.at === "on" && c.zoom === 100 && c.rotation === 0;

const product = (axes) =>
  Object.entries(axes).reduce(
    (rows, [key, values]) => rows.flatMap((row) => values.map((v) => ({ ...row, [key]: v }))),
    [{}],
  );
const caseId = (c) =>
  [c.gesture, c.gsap, c.placement, `r${c.rotation}`, c.nesting, `z${c.zoom}`].join("-");

/**
 * `pr` is the pull request slice, zoom 100 and no rotation in both nestings: it held a regressed case for 10 of the 11
 * pull requests the full gate caught in its first two weeks (the miss was a zoom 50 pick). The merge queue runs `full`.
 * `keyframes` is the GSAP-animated set alone, which `full` also runs.
 */
export function buildGrid(kind = "full") {
  if (kind === "keyframes") return keyframedCases();
  return (
    product({ ...AXES, gesture: GESTURES })
      // xPercent only exists through GSAP on the target itself.
      .filter((c) => c.placement !== "xpercent" || !["none", "idle"].includes(c.gsap))
      .map((c) => ({ id: caseId(c), ...c, other: c.gsap === "idle" }))
      .concat(dragCases(), keyframedCases())
      .filter((c) => kind !== "pr" || (c.zoom === 100 && c.rotation === 0))
  );
}

const PLACEMENT_CSS = {
  px: "left: 560px; top: 300px; translate: 40px 30px;",
  pct: "left: 560px; top: 300px; translate: 25% 25%;",
  center: "left: 50%; top: 50%; translate: -50% -50%;",
  xpercent: "left: 50%; top: 50%;",
  transform: "left: 50%; top: 50%; transform: translate(-50%, -50%);",
};

// A second element for the sequences that switch between two; its luminance is under the render's threshold.
const OTHER = { width: 200, height: 120, color: "#0000ff" };
const OTHER_PLACEMENT_CSS = {
  px: "left: 1100px; top: 560px; translate: 40px 30px;",
  pct: "left: 1100px; top: 560px; translate: 25% 25%;",
  center: "left: 75%; top: 75%; translate: -50% -50%;",
};

const TEXT = "Edit accuracy bench";
const targetText = (spec) => (spec.text ? TEXT : "");

function targetCss(spec) {
  const rotate = spec.rotation ? ` rotate: ${spec.rotation}deg;` : "";
  const other = spec.other
    ? `\n      #other { position: absolute; ${OTHER_PLACEMENT_CSS[spec.placement]} width: ${OTHER.width}px; height: ${OTHER.height}px; background: ${OTHER.color}; }`
    : "";
  // White text reads as full coverage in the render's luminance box, so it leaves that metric alone.
  const text = spec.text ? " color: #ffffff; font: 28px/1.2 sans-serif;" : "";
  return `#target { position: absolute; ${PLACEMENT_CSS[spec.placement]} width: ${TARGET.width}px; height: ${TARGET.height}px; background: ${TARGET.color};${rotate}${text} }${other}`;
}

// fallow-ignore-next-line complexity
function gsapLines(spec) {
  if (KEYFRAMED[spec.gsap]) return KEYFRAMED[spec.gsap].lines;
  if (spec.gsap === "idle") return [`tl.to("#other", { x: 120, duration: 4, ease: "none" }, 0);`];
  const percent = spec.placement === "xpercent" ? ", xPercent: -50, yPercent: -50" : "";
  if (spec.gsap === "hold") return [`gsap.set("#target", { x: 40, y: 20${percent} });`];
  if (spec.gsap === "tlhold")
    return [
      `tl.to("#other", { x: 120, duration: 10 }, 0);`,
      `tl.set("#target", { x: 40, y: 20 }, 0);`,
    ];
  const lines = [`tl.to("#target", { x: 120, y: 60, duration: 4, ease: "none" }, 0);`];
  if (percent) lines.unshift(`gsap.set("#target", { ${percent.slice(2)} });`);
  return lines;
}

function timelineScript(id, lines) {
  return `<script src="${GSAP_CDN}"></script>
    <script>
      (function () {
        window.__timelines = window.__timelines || {};
        var tl = gsap.timeline({ paused: true });
        ${lines.join("\n        ")}
        window.__timelines["${id}"] = tl;
      })();
    </script>`;
}

// fallow-ignore-next-line complexity
function rootHtml(spec) {
  const nested = spec.nesting === "nested";
  const body = nested
    ? `<div id="scene-sub" data-composition-id="sub" data-composition-src="compositions/sub.html" data-start="0" data-duration="4" data-track-index="1" style="position: absolute; left: ${NESTED_HOST.left}px; top: ${NESTED_HOST.top}px; width: ${NESTED_HOST.width}px; height: ${NESTED_HOST.height}px; overflow: hidden"></div>`
    : `<div id="target" class="clip" data-start="0" data-duration="4" data-track-index="1">${targetText(spec)}</div>${spec.other ? `\n      <div id="other" class="clip" data-start="0" data-duration="4" data-track-index="2"></div>` : ""}`;
  const script = spec.gsap === "none" ? "" : timelineScript("main", nested ? [] : gsapLines(spec));
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <style>
      html, body { margin: 0; width: ${COMPOSITION.width}px; height: ${COMPOSITION.height}px; overflow: hidden; background: ${BACKGROUND}; }
      #root { position: relative; width: 100%; height: 100%; }
      ${nested ? "" : targetCss(spec)}
    </style>
  </head>
  <body>
    <div id="root" data-composition-id="main" data-start="0" data-duration="4" data-width="${COMPOSITION.width}" data-height="${COMPOSITION.height}">
      ${body}
    </div>
    ${script}
  </body>
</html>
`;
}

function subHtml(spec) {
  const script = spec.gsap === "none" ? "" : timelineScript("sub", gsapLines(spec));
  return `<template id="sub-template">
  <div id="sub" data-composition-id="sub" data-width="${NESTED_HOST.width}" data-height="${NESTED_HOST.height}">
    <div id="target">${targetText(spec)}</div>${spec.other ? `\n    <div id="other"></div>` : ""}
    <style>
      #sub { position: relative; width: ${NESTED_HOST.width}px; height: ${NESTED_HOST.height}px; background: ${BACKGROUND}; overflow: hidden; }
      ${targetCss(spec)}
    </style>
    ${script}
  </div>
</template>
`;
}

const TIMINGS = require("./timings.json");

/** A case's usual seconds on a healthy runner (timings.json); an untimed case counts as the slowest. */
export const expectedSeconds = (c, timings = TIMINGS) =>
  timings[c.id] ?? Math.max(0, ...Object.values(timings));

/**
 * Shard `shard` of `shards`, packed longest first by each case's measured seconds (timings.json, from timings.mjs) so
 * the shards finish together; a case with no timing counts as the slowest. Returned longest first.
 */
export function shardCases(cases, shard, shards, timings = TIMINGS) {
  const cost = (c) => expectedSeconds(c, timings);
  const bins = Array.from({ length: shards }, () => ({ cases: [], seconds: 0 }));
  for (const c of [...cases].sort((a, b) => cost(b) - cost(a) || a.id.localeCompare(b.id))) {
    const lightest = bins.reduce((min, bin) => (bin.seconds < min.seconds ? bin : min));
    lightest.cases.push(c);
    lightest.seconds += cost(c);
  }
  return bins[shard - 1].cases;
}

/** Writes the case's project into `dir` and returns the files a gesture may rewrite. */
export function writeFixture(spec, dir) {
  mkdirSync(dir, { recursive: true });
  writeFileSync(join(dir, "index.html"), rootHtml(spec));
  if (spec.nesting !== "nested") return ["index.html"];
  mkdirSync(join(dir, "compositions"), { recursive: true });
  writeFileSync(join(dir, "compositions/sub.html"), subHtml(spec));
  return ["index.html", "compositions/sub.html"];
}
