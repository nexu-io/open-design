/** Teleport: per painted frame, the dragged element's box against the box the pointer put it at. */
import { COMPOSITION } from "./grid.mjs";
import {
  centre,
  compositionMapper,
  dist,
  localToQuad,
  mid,
  parseInset,
  quadToLocal,
  visibleQuad,
} from "./geometry.mjs";
import { LIMIT_PX } from "./report.mjs";

// Geometry the page script uses, kept outside it so it can be tested; frameSamplerScript ships them together.
function mul(a, b) {
  return [
    a[0] * b[0] + a[2] * b[1],
    a[1] * b[0] + a[3] * b[1],
    a[0] * b[2] + a[2] * b[3],
    a[1] * b[2] + a[3] * b[3],
  ];
}

function apply(m, [x, y]) {
  return [m[0] * x + m[2] * y, m[1] * x + m[3] * y];
}

function rotation(value) {
  const parts = value === "none" ? [] : value.trim().split(/\s+/);
  const deg = parts.length
    ? Number.parseFloat(parts.at(-1)) * Math.sign(Number(parts.at(-2) ?? 1))
    : 0;
  const r = (deg * Math.PI) / 180;
  return [Math.cos(r), Math.sin(r), -Math.sin(r), Math.cos(r)];
}

// CSS applies translate, rotate, scale, then transform; only the linear part matters around the centre.
function ownLinear(node) {
  const s = node.ownerDocument.defaultView.getComputedStyle(node);
  const [sx, sy = sx] = s.scale === "none" ? [1] : s.scale.split(/\s+/).map(Number);
  const t = s.transform === "none" ? null : new DOMMatrix(s.transform);
  return mul(mul(rotation(s.rotate), [sx, 0, 0, sy]), t ? [t.a, t.b, t.c, t.d] : [1, 0, 0, 1]);
}

function parentOf(node) {
  return node.parentElement ?? node.getRootNode().host ?? null;
}

function linear(node) {
  let m = [1, 0, 0, 1];
  for (let n = node; n; n = parentOf(n)) m = mul(ownLinear(n), m);
  return m;
}

/** Border-box size in CSS px: offsetWidth rounds to whole px, and a bounding rect grows with rotation. */
// fallow-ignore-next-line complexity
function boxSize(el) {
  const s = el.ownerDocument.defaultView.getComputedStyle(el);
  const px = (v) => Number.parseFloat(v) || 0;
  const edges = (a, b) =>
    s.boxSizing === "border-box"
      ? 0
      : px(s[`padding${a}`]) +
        px(s[`padding${b}`]) +
        px(s[`border${a}Width`]) +
        px(s[`border${b}Width`]);
  return [px(s.width) + edges("Left", "Right"), px(s.height) + edges("Top", "Bottom")];
}

/** The element's quad in top-frame px, crossing each iframe through its element's own transform. */
export function quadOf(el, top = el.ownerDocument.defaultView.top) {
  const r = el.getBoundingClientRect();
  let c = [r.left + r.width / 2, r.top + r.height / 2];
  let m = linear(el);
  for (let win = el.ownerDocument.defaultView; win !== top; win = win.parent) {
    const f = win.frameElement;
    const fr = f.getBoundingClientRect();
    const fm = linear(f);
    const fs = f.ownerDocument.defaultView.getComputedStyle(f);
    const [fw, fh] = boxSize(f);
    const inset = [
      f.clientLeft + parseFloat(fs.paddingLeft),
      f.clientTop + parseFloat(fs.paddingTop),
    ];
    const d = apply(fm, [c[0] + inset[0] - fw / 2, c[1] + inset[1] - fh / 2]);
    c = [fr.left + fr.width / 2 + d[0], fr.top + fr.height / 2 + d[1]];
    m = mul(fm, m);
  }
  const [w, h] = boxSize(el);
  const corner = (u, v) => {
    const d = apply(m, [u * w, v * h]);
    return [c[0] + d[0], c[1] + d[1]];
  };
  return [corner(-0.5, -0.5), corner(0.5, -0.5), corner(0.5, 0.5), corner(-0.5, 0.5)];
}

/**
 * Page script for the top frame: as each frame paints, the pointer and the element's quad, all in top-frame px.
 * A quad is the box's centre plus its composed 2D linear transform, which DOM rects alone cannot give.
 */
function frameSampler() {
  if (window.top !== window) return;
  const rec = { on: false, selector: null, pointer: null, down: false, samples: [] };
  window.__editBenchFrames = rec;
  for (const type of ["pointerdown", "pointermove", "pointerup"])
    window.addEventListener(
      type,
      (e) => {
        // The stray move case.mjs sends is not where the pointer is.
        if (!e.isTrusted) return;
        rec.pointer = [e.clientX, e.clientY];
        // From the buttons, not the event type: a move after release is not a drag.
        rec.down = (e.buttons & 1) === 1;
        // Kept as it happens, so a release that no frame painted still ends the drag at its own point.
        if (type === "pointerup" && rec.on)
          rec.samples.push({ t: performance.now(), up: rec.pointer });
      },
      true,
    );
  // Studio's previews sit in <hyperframes-player> shadow roots, which window.frames does not list.
  const previewWindows = () =>
    Array.from(document.querySelectorAll("iframe, hyperframes-player"))
      .flatMap((e) => (e.shadowRoot ? Array.from(e.shadowRoot.querySelectorAll("iframe")) : [e]))
      .map((e) => e.contentWindow)
      .filter((f) => {
        try {
          return f.location.pathname.includes("/preview");
        } catch {
          return false; // cross-origin
        }
      });
  // The largest visible preview holding the element; Studio loads edits in a hidden shadow frame.
  // fallow-ignore-next-line complexity
  const findElement = (selector) => {
    let best = null;
    for (const f of previewWindows()) {
      const el = f.document.querySelector(selector);
      const fe = f.frameElement;
      if (!el || !fe.checkVisibility({ visibilityProperty: true, opacityProperty: true })) continue;
      const r = fe.getBoundingClientRect();
      if (!best || r.width * r.height > best.area) best = { el, area: r.width * r.height };
    }
    // A page with no preview (the blank-page control) holds its element itself.
    return best?.el ?? document.querySelector(selector);
  };
  // fallow-ignore-next-line complexity
  const read = () => {
    const el = findElement(rec.selector);
    const root = el?.ownerDocument.querySelector('[data-composition-id="main"]');
    const outline = document.querySelector("[data-dom-edit-crop-frame] > div.border-dashed");
    const waiting = document.querySelector("[data-dom-edit-press-waiting]");
    rec.samples.push({
      t: performance.now(),
      pointer: rec.pointer,
      down: rec.down,
      ...(root && { root: quadOf(root) }),
      ...(el && {
        quad: quadOf(el),
        size: boxSize(el),
        clip: el.ownerDocument.defaultView.getComputedStyle(el).clipPath,
      }),
      ...(outline && { outline: quadOf(outline) }),
      ...(waiting && { waitingQuad: quadOf(waiting) }),
    });
  };
  // ResizeObserver runs after every document's rAF callbacks and layout, just before paint, so it reads
  // what the frame shows. A task after paint can see a state no frame painted.
  const tick = document.createElement("div");
  tick.style.cssText = "position: fixed; height: 1px; opacity: 0; pointer-events: none";
  new ResizeObserver(() => {
    if (!rec.on) return;
    try {
      read();
    } catch (error) {
      rec.samples.push({ t: performance.now(), error: String(error) });
    }
  }).observe(tick);
  const loop = () => {
    if (rec.on) {
      if (!tick.isConnected) document.documentElement.append(tick);
      tick.style.width = tick.style.width === "1px" ? "2px" : "1px";
    }
    requestAnimationFrame(loop);
  };
  requestAnimationFrame(loop);
}

/** The page script with the geometry it calls, for evaluateOnNewDocument; scoped so no page global clashes. */
export const frameSamplerScript = `(() => {
${[mul, apply, rotation, ownLinear, parentOf, linear, boxSize, quadOf].map(String).join("\n")}
(${frameSampler})();
})();`;

/** Starts recording, or marks the next drag in one already running, so the gap between drags is sampled. */
export const startFrames = (page, selector) =>
  page.evaluate((sel) => {
    const rec = window.__editBenchFrames;
    if (!rec.on) Object.assign(rec, { on: true, samples: [], marks: [] });
    rec.selector = sel;
    rec.marks.push(rec.samples.length);
  }, selector);

/** Stops recording: one window of frames per drag, each running until the next drag's mark. */
export async function stopFrames(page) {
  const { samples, marks } = await page.evaluate(() => {
    const rec = window.__editBenchFrames;
    rec.on = false;
    return { samples: rec.samples, marks: rec.marks ?? [] };
  });
  return marks.map((m, i) => samples.slice(m, marks[i + 1] ?? samples.length));
}

const boxOf = (s, map) => {
  const quad = s.quad.map(map.toComp);
  const size = { width: s.size[0], height: s.size[1] };
  if (s.waitingQuad) {
    const shown = s.waitingQuad.map(map.toComp);
    return { quad: shown, size, visible: shown };
  }
  return { quad, size, visible: visibleQuad(quad, size, parseInset(s.clip)) };
};

/** Each point a gesture moves and where the pointer puts it: press point, resize corner or crop edge. */
// fallow-ignore-next-line complexity
function trackers(gesture, first, p0) {
  const b = boxOf(first, first.map);
  const follow = (grab) => {
    const g0 = grab(first);
    return { grab, implied: (p) => [g0[0] + p[0] - p0[0], g0[1] + p[1] - p0[1]] };
  };
  if (gesture === "resize") return [follow((s) => boxOf(s, s.map).visible[2])];
  if (gesture === "crop") {
    const c0 = centre(b.quad);
    const edge = (s) => {
      const q = s.outline ? s.outline.map(s.map.toComp) : boxOf(s, s.map).visible;
      return mid(q[1], q[2]);
    };
    return [follow(edge), { grab: (s) => centre(boxOf(s, s.map).quad), implied: () => c0 }];
  }
  const local = quadToLocal(b.quad, { width: 1, height: 1 }, p0);
  const grab = (s) => {
    const m = boxOf(s, s.map);
    return localToQuad(m.quad, { width: 1, height: 1 }, local);
  };
  if (gesture !== "rotate") return [follow(grab)];
  const c = centre(b.visible);
  const angle = (p) => Math.atan2(p[1] - c[1], p[0] - c[0]);
  const [dx, dy] = [p0[0] - c[0], p0[1] - c[1]];
  return [
    {
      grab,
      implied: (p) => {
        const a = angle(p) - angle(p0);
        return [
          c[0] + dx * Math.cos(a) - dy * Math.sin(a),
          c[1] + dx * Math.sin(a) + dy * Math.cos(a),
        ];
      },
    },
  ];
}

const round = (v) => Math.round(v * 100) / 100;

/** Fails a frame whose tracked point outran the pointer or left its path; after release, the release point. */
// fallow-ignore-next-line complexity
export function scoreTeleport(gesture, samples) {
  const frames = samples
    .filter((s) => s.quad && s.root && s.pointer)
    .map((s) => ({ ...s, map: compositionMapper(s.root, COMPOSITION) }));
  if (frames.length < 2) {
    const count = (f) => samples.filter(f).length;
    const failed = samples.find((s) => s.error)?.error;
    return {
      max: null,
      error: `${samples.length} frames: ${count((s) => s.quad)} found the element, ${count((s) => s.pointer)} had a pointer${failed ? `; ${failed}` : ""}`,
    };
  }
  const pointer = (s) => s.map.toComp(s.pointer);
  const tracked = trackers(gesture, frames[0], pointer(frames[0])).map((t) => ({
    ...t,
    allowed: [],
    prev: null,
  }));
  let worst = { max: 0, frame: 0, kind: null, point: 0 };
  const trace = [];
  // The drag's own pointer-up; a later one in the window is the next element's selection click.
  const up = samples.find((s) => s.up);
  let [pressedAt, released] = [-1, false];
  for (const [i, s] of frames.entries()) {
    if (pressedAt < 0 && s.down) pressedAt = i;
    released ||= up ? s.t >= up.t : pressedAt >= 0 && i > pressedAt && !s.down;
    // fallow-ignore-next-line complexity
    const row = tracked.map((t, k) => {
      const g = t.grab(s);
      // After release the pointer no longer drags the box: it is owed the release point, wherever the pointer goes.
      if (released && !t.release)
        t.release = up
          ? t.implied(s.map.toComp(up.up))
          : (t.allowed.at(-1) ?? t.implied(pointer(s)));
      const want = released ? t.release : t.implied(pointer(s));
      if (!released) t.allowed.push(want);
      const places = released ? [t.release] : t.allowed;
      const off = Math.min(...places.map((a) => dist(g, a)));
      // Lag is not a jump: a box that catches up after lagging frames may move all the pointer travel it owes.
      const owed = (t.prev?.owed ?? 0) + (t.prev ? dist(want, t.prev.want) : 0);
      const moved = t.prev ? dist(g, t.prev.g) : 0;
      const jump = moved - owed;
      t.prev = { g, want, owed: Math.max(0, owed - moved) };
      if (jump > worst.max) worst = { max: jump, frame: i, kind: "jump", point: k };
      if (off > worst.max) worst = { max: off, frame: i, kind: "off", point: k };
      return { box: g.map(round), pointer: want.map(round), jump: round(jump), off: round(off) };
    });
    trace.push({ t: round(s.t - frames[0].t), down: s.down, points: row });
  }
  return {
    ...worst,
    pass: worst.max <= LIMIT_PX,
    frames: frames.length,
    unmeasured: samples.filter((s) => !s.up).length - frames.length,
    // Kept only when it fails: each tracked point and where the pointer put it, every frame.
    trace: worst.max > LIMIT_PX ? trace : undefined,
  };
}
