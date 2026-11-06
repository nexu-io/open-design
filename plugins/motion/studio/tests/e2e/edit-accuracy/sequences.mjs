/** Drag paths and edit sequences: several steps with no settle between, then the usual commit, undo and reload. */
import { watch } from "node:fs";
import { dirname, join } from "node:path";
import { COMPOSITION, PLAYHEAD } from "./grid.mjs";
import { hashOf, traceBench } from "./trace.mjs";
import { centre, dist, percentile, quadDistance } from "./geometry.mjs";
import {
  VIEWPORT,
  blurPreview,
  inStudio,
  chord,
  controlDrag,
  measure,
  measureShown,
  nextFrame,
  openStudio,
  pointerGesture,
  readFiles,
  recording,
  sameFiles,
  selectTarget,
  settled,
  saveFault,
  seekTo,
  sleep,
  smoothness,
  timedWrite,
  waitForFiles,
} from "./case.mjs";
import { scoreTeleport, stopFrames } from "./teleport.mjs";

// The frame sampler sees every painted frame, so a path needs few pointer steps (each costs a CDP read).
const STEP_PX = 28;
const STRAIGHT_STEPS = 20;
const UNDONE_QUIET_MS = 3000;
const AUTO_KEYFRAME = 'button[aria-label="Auto-record manual edits as keyframes"]';
const ADD_KEYFRAME = 'button[aria-label^="Add keyframe at playhead"]';

/** Every step but a seek or a toggle writes the file once. */
const saves = (step) => step.do !== "seek" && step.do !== "autokey";

/** `n` evenly spaced points from `a` (excluded) to `b` (included). */
const legN = (a, b, n) =>
  Array.from({ length: n }, (_, i) => [
    a[0] + ((b[0] - a[0]) * (i + 1)) / n,
    a[1] + ((b[1] - a[1]) * (i + 1)) / n,
  ]);
const leg = (a, b) => legN(a, b, Math.max(1, Math.ceil(dist(a, b) / STEP_PX)));
const legs = (start, points) => points.flatMap((p, i) => leg(i ? points[i - 1] : start, p));
const at = (v, [fx, fy]) => [v.x0 + fx * (v.x1 - v.x0), v.y0 + fy * (v.y1 - v.y0)];

/** Screen paths from the press point `p` inside `v`, the part of the canvas the preview shows. */
const ROUTES = {
  zigzag: (p, v) =>
    legs(
      p,
      [
        [0.1, 0.15],
        [0.3, 0.85],
        [0.5, 0.15],
        [0.7, 0.85],
        [0.9, 0.15],
        [0.6, 0.5],
      ].map((f) => at(v, f)),
    ),
  circle: (p, v) => {
    const r = 0.3 * Math.min(v.x1 - v.x0, v.y1 - v.y0);
    const ring = Array.from({ length: 45 }, (_, i) => {
      const a = (2 * Math.PI * (i + 1)) / 45;
      return [p[0] - r + r * Math.cos(a), p[1] + r * Math.sin(a)];
    });
    return [...ring, ...leg(p, [p[0] + 0.08 * (v.x1 - v.x0), p[1] + 0.08 * (v.y1 - v.y0)])];
  },
  flick: (p, v) => legN(p, at(v, [0.75, 0.7]), 4),
  pause: (p) => {
    const half = legN(p, [p[0] + 90, p[1] + 45], 20);
    return [...half, { pause: 1000 }, ...legN(half.at(-1), [p[0] + 180, p[1] + 90], 20)];
  },
  // Just before the release, Chromium resends the press point with no button down; the drop must not take it.
  stray: (p) => [...legN(p, [p[0] + 180, p[1] + 90], 20), { stray: p }],
  edge: (p, v) => {
    const out = [Math.min(v.edge + 60, VIEWPORT.width - 2), p[1]];
    return legs(p, [out, [p[0] + 60, p[1] + 30]]);
  },
};

/** The canvas the preview shows, in screen px: the composition clipped by the stage's scroll box. */
async function visibleCanvas(page, m) {
  const clip = await page.$eval('[data-testid="preview-zoom-stage"]', (stage) => {
    for (let n = stage.parentElement; n; n = n.parentElement) {
      const s = getComputedStyle(n);
      if (s.overflowX === "visible" && s.overflowY === "visible") continue;
      const r = n.getBoundingClientRect();
      return [r.left, r.top, r.right, r.bottom];
    }
    return [0, 0, innerWidth, innerHeight];
  });
  const [a, b] = [m.map.toScreen([0, 0]), m.map.toScreen([COMPOSITION.width, COMPOSITION.height])];
  const v = {
    x0: Math.max(a[0], clip[0]),
    y0: Math.max(a[1], clip[1]),
    x1: Math.min(b[0], clip[2]),
    y1: Math.min(b[1], clip[3]),
  };
  return { ...v, edge: v.x1 };
}

/** Every distinct saved state in order, read on each file event; atomic replaces mean no torn read. */
export function watchVersions(dir, files) {
  const versions = [readFiles(dir, files)];
  const record = () => {
    const now = readFiles(dir, files);
    if (!sameFiles(now, versions.at(-1))) {
      versions.push(now);
      traceBench("version", { n: versions.length - 1, hash: hashOf(JSON.stringify(now)) });
    }
  };
  const watchers = [...new Set(files.map((f) => dirname(join(dir, f))))].map((d) =>
    watch(d, record),
  );
  return { versions, stop: () => watchers.forEach((w) => w.close()) };
}

/** Studio's own history replies in arrival order: each claim's group, each undo or redo's entry and what it reverts. */
function watchHistory(page) {
  const replies = [];
  const read = (response) => {
    const kind = /\/history\/(claim|step|undo)$/.exec(new URL(response.url()).pathname)?.[1];
    if (!kind || response.request().method() !== "POST") return;
    const status = response.status();
    replies.push(
      response
        .json()
        .catch(() => null)
        // fallow-ignore-next-line complexity
        .then((body) =>
          kind === "claim"
            ? { claim: body?.claimed?.id ?? null, status, readable: Boolean(body) }
            : { id: body?.entry?.id ?? null, undoes: body?.entry?.undoes ?? null, status },
        ),
    );
  };
  page.on("response", read);
  return { replies, stop: () => page.off("response", read) };
}

/** The groups left to undo, oldest first: a claim opens one unless it names the newest (one gesture writing
 * twice), an undo must revert the newest. Anything else is a fault: one gesture, one group, one undo. */
// fallow-ignore-next-line complexity
export function historyGroups(replies) {
  const [stack, faults] = [[], []];
  for (const r of replies) {
    if (r.status !== 200 || r.readable === false) faults.push(`history reply ${r.status}`);
    else if ("claim" in r) {
      if (r.claim && r.claim !== stack.at(-1)) stack.push(r.claim);
    } else if (r.undoes && r.undoes === stack.at(-1)) stack.pop();
    else faults.push(`undid ${r.undoes}, not the newest group ${stack.at(-1)}`);
  }
  if (new Set(stack).size !== stack.length) faults.push("two gestures share a group");
  return { stack, faults };
}

/** The first undo or redo reply after `seen`, or null when none arrives. */
async function steppedAfter(history, seen) {
  for (const deadline = Date.now() + 5000; Date.now() < deadline; await sleep(20)) {
    const found = (await Promise.all(history.replies.slice(seen))).find((r) => "undoes" in r);
    if (found) return found;
  }
  return null;
}

function mergeSmooth(parts) {
  const intervals = parts.flatMap((s) => s.intervals);
  return {
    p95: percentile(intervals, 95),
    frames: intervals.length,
    longTasks: parts.reduce((n, s) => n + s.longTasks, 0),
    intervals,
    work: parts.every((s) => s.work) ? parts.flatMap((s) => s.work) : null,
    wallTimed: parts.reduce((n, s) => n + s.wallTimed, 0),
    ...(parts.some((s) => s.unknown) && {
      unknown: parts
        .map((s) => s.unknown)
        .filter(Boolean)
        .join("; "),
    }),
  };
}

export const slowest = (writes = []) =>
  writes.length ? Math.max(...writes.map((w) => w.ms ?? 0)) : null;

/**
 * Undo (or redo) once per entry: its reply must revert the entry's group and, where the entry knows its
 * bytes, its write must land on them. Stops at the first write that never lands.
 */
// fallow-ignore-next-line complexity
async function walk(ctx, keys, entries, current, history) {
  const [landed, writes, stepped] = [[], [], []];
  for (const want of entries) {
    await blurPreview(ctx.page);
    const [since, seen] = [Date.now(), history.replies.length];
    await chord(ctx.page, keys);
    const w = await timedWrite(ctx, current, since);
    const step = w.reached ? await steppedAfter(history, seen) : null;
    writes.push(w);
    stepped.push(step?.id ?? null);
    landed.push(
      w.reached &&
        Boolean(want.undoes) &&
        step?.undoes === want.undoes &&
        (!want.files || sameFiles(w.files, want.files)),
    );
    current = w.files;
    if (!w.reached) break;
  }
  return {
    ok: landed.length === entries.length && landed.every(Boolean),
    landed,
    writes,
    stepped,
    current,
  };
}

// fallow-ignore-next-line complexity
async function driveStep(ctx, step, state) {
  const { page } = ctx.A;
  if (step.do === "undo") {
    await blurPreview(page);
    await chord(page, "Control+z");
    // A key's DOM change reaches the CDP quads only after a frame; the next step reads from them.
    await nextFrame(page);
    state.depth -= 1;
    // Undone back to the start, the box belongs where it began; any other undo leaves it unknown here.
    state.intended = state.depth === 0 ? state.start : null;
    return { do: "undo" };
  }
  if (step.do === "nudge") {
    await recording(page, true);
    for (let i = 0; i < step.count; i++) {
      await page.keyboard.press("ArrowRight");
      await nextFrame(page);
    }
    state.smooth.push(smoothness(await recording(page, false)));
    state.depth += 1;
    state.intended = (await measure(ctx.A)).visible;
    return { do: "nudge", count: step.count };
  }
  if (step.do === "text") return editText(ctx.A, step, state);
  if (step.do === "autokey") {
    const pressed = () =>
      page.$eval(AUTO_KEYFRAME, (b) => b.getAttribute("aria-pressed") === "true");
    if (!(await pressed())) await page.click(AUTO_KEYFRAME);
    state.autokey = await pressed();
    return { do: "autokey", on: state.autokey };
  }
  if (step.do === "addkey") {
    // The toolbar's own button, pressed where a person would; the box must not move.
    const pre = await measure(ctx.A);
    await recording(page, true);
    await page.click(ADD_KEYFRAME);
    await nextFrame(page);
    state.smooth.push(smoothness(await recording(page, false)));
    state.depth += 1;
    state.intended = pre.visible;
    return { do: "addkey" };
  }
  if (step.do === "seek") {
    const seek = await page.evaluate(
      (time) => window.__editBench.call("studio_seek", { time }),
      step.time,
    );
    if (!seek?.ok) throw new Error(`studio_seek ${step.time} failed: ${JSON.stringify(seek)}`);
    state.time = step.time;
    return { do: "seek", time: step.time };
  }
  const name = step.element ?? "A";
  const c = ctx[name];
  // In flight: pressed where the last drag let go, without reading the preview first. The waiting
  // marker belongs to the selected element, so another element is read bare until it is selected.
  let pre = step.inFlight
    ? state.last.lastMeasure
    : name === state.selected
      ? (await measureShown(c)).m
      : await measure(c);
  if (name !== state.selected) {
    await selectTarget(c, pre);
    state.selected = name;
    pre = await measure(c);
  }
  const savesAtPress = state.versions.length - 1;
  const v = step.route && (await visibleCanvas(page, pre));
  const route = step.route
    ? (p) => ROUTES[step.route](p, v)
    : step.by && ((p) => legN(p, [p[0] + step.by[0], p[1] + step.by[1]], STRAIGHT_STEPS));
  const drive = await pointerGesture(c, step.gesture, pre, route);
  state.last = drive;
  state.drags.push({ drive, ctx: c });
  state.smooth.push(drive.smooth);
  state.depth += 1;
  state.intended = drive.lastQuad;
  return {
    do: "drag",
    element: name,
    gesture: step.gesture,
    route: step.route,
    tracking: Math.max(...drive.errors),
    pressJump: drive.pressJump,
    savesAtPress,
    hit: drive.diag.hit,
  };
}

/** The word's centre in composition px, read in the preview beside the element. */
const wordPoint = (c, word) =>
  c.handles.target.evaluate(
    (e, w, width) => {
      const node = e.firstChild;
      const range = e.ownerDocument.createRange();
      range.setStart(node, node.data.indexOf(w));
      range.setEnd(node, node.data.indexOf(w) + w.length);
      const b = range.getBoundingClientRect();
      const r = e.ownerDocument
        .querySelector('[data-composition-id="main"]')
        .getBoundingClientRect();
      const k = width / r.width;
      return [(b.left + b.width / 2 - r.left) * k, (b.top + b.height / 2 - r.top) * k];
    },
    word,
    COMPOSITION.width,
  );

/** Double press to open the text, optionally double-click a word, type, and commit with Enter. */
// fallow-ignore-next-line complexity
async function editText(c, step, state) {
  const { page } = c;
  const pre = await measure(c);
  const at = pre.map.toScreen(centre(pre.visible));
  await recording(page, true);
  await page.mouse.click(at[0], at[1]);
  await sleep(120);
  await page.mouse.click(at[0], at[1]);
  const editing = () =>
    c.handles.target.evaluate((e) => e.isContentEditable && e.ownerDocument.activeElement === e);
  let opened = false;
  for (const deadline = Date.now() + 2000; !opened && Date.now() < deadline; await sleep(50))
    opened = await editing();
  let selection = null;
  if (opened && step.select) {
    const word = pre.map.toScreen(await wordPoint(c, step.select));
    await page.mouse.click(word[0], word[1], { count: 2 });
    await nextFrame(page, 2);
    selection = await c.handles.target.evaluate((e) => ({
      text: e.ownerDocument.getSelection().toString(),
      editing: e.isContentEditable,
    }));
  }
  // Typing with no session open would land on Studio's shortcuts, so a failed open types nothing.
  if (opened) {
    // One key per frame, as the nudges press theirs: a whole word in one frame is no typist's pace.
    for (const key of step.word) {
      await page.keyboard.type(key);
      await nextFrame(page);
    }
    await page.keyboard.press("Enter");
    await nextFrame(page);
  }
  state.smooth.push(smoothness(await recording(page, false)));
  state.depth += 1;
  state.intended = pre.visible;
  state.text = { word: step.word, select: step.select, opened, selection };
  return { do: "text", opened, selection };
}

const round = (m) => m.visible.map((p) => p.map((v) => Math.round(v * 100) / 100));

/**
 * A person's pace: wait for the step's save, then score the settled box against where the step put it
 * (a seek: the box its keyframe time was left with, unless a size key since holds another size there).
 */
async function settleStep(c, steps, step, state, watcher) {
  await untilSaved(watcher, steps.filter(saves).length);
  if (step.do === "seek") state.intended = seekIntended(state);
  const m = await settled(c);
  const held = heldSize(state.sizeKeys, state.time);
  Object.assign(steps.at(-1), {
    saves: watcher.versions.length - 1,
    box: boxError(state, m),
    size: step.do === "seek" ? sizeError(held, m.size) : undefined,
  });
  rememberSizeKey(step, state, m);
  rememberBox(step, state, m);
}

const seekIntended = (state) => {
  const kept = state.keyBoxes.get(state.time);
  return kept && !sizeError(kept.size, heldSize(state.sizeKeys, state.time)) ? kept.visible : null;
};

function rememberSizeKey(step, state, m) {
  if (step.gesture === "resize" && state.autokey) state.sizeKeys.set(state.time, m.size);
}

function rememberBox(step, state, m) {
  if (saves(step))
    state.keyBoxes.set(state.time, { visible: state.intended ?? m.visible, size: m.size });
}

/** Under auto-record, size keys hold their nearest value before the first and after the last. */
export function heldSize(sizeKeys, time) {
  const times = [...sizeKeys.keys()].sort((a, b) => a - b);
  if (!times.length) return undefined;
  return sizeKeys.get(Math.min(Math.max(time, times[0]), times.at(-1)));
}

const sizeError = (a, b) =>
  a && b ? Math.max(Math.abs(a.width - b.width), Math.abs(a.height - b.height)) : 0;

async function untilSaved(watcher, owed) {
  for (const deadline = Date.now() + 10_000; Date.now() < deadline; await sleep(50))
    if (watcher.versions.length - 1 >= owed) return;
  throw new Error(`save ${owed} never landed`);
}

const boxError = (state, m) =>
  state.intended ? quadDistance(state.intended, m.visible) : undefined;

/** One path or sequence case, end to end, against a Studio already serving `dir`. */
export async function runSequence(args) {
  const drags = args.spec.steps.some((s) => s.do === "drag");
  const control = await controlDrag(args.browser, drags ? "move" : "nudge");
  let [watcher, history] = [null, null];
  try {
    return await inStudio(args, (session) => {
      watcher = watchVersions(args.dir, args.files);
      history = watchHistory(session.page);
      return measureSequence(args, session, control, watcher, history);
    });
  } finally {
    watcher?.stop();
    history?.stop();
  }
}

// fallow-ignore-next-line complexity
async function measureSequence({ spec, dir, files, evidence }, session, control, watcher, history) {
  const { page, pre, zoom, shoot, consoleErrors } = session;
  const ctx = { A: session.ctx, B: { ...session.ctx, handles: null, selector: "#other" } };
  const state = {
    selected: "A",
    last: null,
    drags: [],
    smooth: [],
    versions: watcher.versions,
    depth: 0,
    start: pre.visible,
    intended: null,
    text: null,
    autokey: false,
    sizeKeys: new Map(),
    // Settled cases only: the box each keyframe time was left with, which a later seek there must show.
    keyBoxes: new Map(),
    time: spec.playhead ?? PLAYHEAD,
  };
  const steps = [];
  // Back-to-back drags share one recording, so a drag's frames run up to the next press: a jump in
  // the gap fails the earlier drag, whose box must stay where it was let go. Other steps end it.
  const collect = async () => {
    const open = steps.filter((s) => s.do === "drag" && !s.teleport);
    const windows = open.length ? await stopFrames(page) : [];
    open.forEach((s, i) => {
      const frames = windows[i] ?? [];
      s.teleport = scoreTeleport(s.gesture, frames);
      s.elementTeleport = scoreTeleport(
        s.gesture,
        frames.map((f) => ({ ...f, waitingQuad: undefined })),
      ).max;
    });
  };
  for (const step of spec.steps) {
    if (step.do !== "drag") await collect();
    steps.push(await driveStep(ctx, step, state));
    if (spec.settle) await settleStep(ctx.A, steps, step, state, watcher);
  }
  // Every saving step saves once (a nudge burst saves once); wait for all of them. An undo may
  // cancel the save it follows, so one ending undone stops once the file has stayed original for 3 s.
  const owed = spec.steps.filter(saves).length;
  const endsUndone = spec.steps.at(-1).do === "undo" && state.depth === 0;
  let backSince = null;
  for (const deadline = Date.now() + 10_000; Date.now() < deadline; await sleep(50)) {
    if (watcher.versions.length - 1 >= owed) break;
    const back = endsUndone && sameFiles(readFiles(dir, files), watcher.versions[0]);
    backSince = back ? (backSince ?? Date.now()) : null;
    if (backSince !== null && Date.now() - backSince >= UNDONE_QUIET_MS) break;
  }
  await page.waitForFunction(
    () => {
      if (document.querySelector("[data-dom-edit-press-waiting]")) return false;
      const frames = Array.from(document.querySelectorAll("iframe, hyperframes-player")).flatMap(
        (host) =>
          host.shadowRoot ? Array.from(host.shadowRoot.querySelectorAll("iframe")) : [host],
      );
      return frames.every(
        (frame) => !frame.contentDocument?.querySelector("[data-hf-studio-manual-edit-gesture]"),
      );
    },
    { timeout: 20_000 },
  );
  await waitForFiles(ctx.A, { timeout: 5000 });
  watcher.stop();
  const versions = watcher.versions;
  await nextFrame(page, 2);
  await blurPreview(page);
  await page.keyboard.press("Escape");
  const committed = await settled(ctx.A);
  await collect();
  await shoot("committed");
  const committedFiles = readFiles(dir, files);
  evidence.files = committedFiles;

  // The groups the history took, against the steps: each gesture one group, each undo the newest.
  const groups = historyGroups(await Promise.all(history.replies));
  const ids = groups.stack.toReversed();
  const groupsOk = !groups.faults.length && groups.stack.length === state.depth;
  // A settled case knows each step's bytes (its saves ended before the next step); a fast one only
  // where all are undone and all redone, since one gesture may write more than once.
  const stack = [];
  let vi = 0;
  spec.steps.forEach((s, i) => {
    if (!spec.settle || !saves(s)) return;
    if (s.do === "undo") stack.pop();
    else stack.push({ before: versions[vi], after: versions[steps[i].saves] });
    vi = steps[i].saves;
  });
  const last = (i) => i === state.depth - 1;
  const undo = await walk(
    ctx.A,
    "Control+z",
    Array.from({ length: state.depth }, (_, i) => ({
      undoes: ids[i],
      files: spec.settle ? stack.at(-1 - i).before : last(i) ? versions[0] : undefined,
    })),
    committedFiles,
    history,
  );
  // The file the steps should have left: the last surviving save's, or the original when all were undone.
  const expected = spec.settle ? (stack.at(-1)?.after ?? versions[0]) : versions.at(-1);
  const undone = await settled(ctx.A);
  await shoot("undone");
  const redo = undo.ok
    ? await walk(
        ctx.A,
        "Control+Shift+z",
        undo.stepped.toReversed().map((undoes, i) => ({
          undoes,
          files: spec.settle ? stack[i].after : last(i) ? committedFiles : undefined,
        })),
        undo.current,
        history,
      )
    : { ok: false, landed: [] };
  const redone = undo.ok ? await settled(ctx.A) : null;
  // A late write must not land under the reload.
  await waitForFiles(ctx.A, { timeout: 15_000 });

  await page.reload();
  // The reload opens at the case's playhead; the steps may have left it elsewhere.
  const opened = await openStudio(ctx.A);
  const reloaded = state.time === ctx.A.playhead ? opened : await seekTo(ctx.A, state.time);
  await shoot("reloaded");
  const shown = state.text && (await ctx.A.handles.target.evaluate((e) => e.textContent));
  const drags = steps.filter((s) => s.do === "drag");
  const errors = state.drags.flatMap((d) => d.drive.errors);
  const worst = drags.reduce(
    (a, s) => ((s.teleport.max ?? Infinity) > (a.teleport.max ?? Infinity) ? s : a),
    drags[0],
  );
  const quads = Object.fromEntries(
    Object.entries({ pre, committed, undone, redone, reloaded }).filter(([, m]) => m),
  );
  const intended = state.intended ?? committed.visible;
  const has = (files, word) => Boolean(files) && Object.values(files).some((f) => f.includes(word));
  const text = state.text && {
    ...state.text,
    saved: has(committedFiles, state.text.word),
    shown: shown?.includes(state.text.word) ?? false,
  };
  return {
    ...(spec.keyRender !== undefined &&
      state.keyBoxes.has(spec.keyRender) && {
        keyRender: { time: spec.keyRender, visible: state.keyBoxes.get(spec.keyRender).visible },
      }),
    zoom,
    saved: versions.length > 1,
    tracking: errors.length
      ? { max: Math.max(...errors), p95: percentile(errors, 95), frames: errors.length }
      : { max: 0, p95: 0, frames: 0 },
    pressJump: drags.length ? Math.max(...drags.map((s) => s.pressJump)) : null,
    teleport: worst ? { ...worst.teleport, trace: undefined, step: steps.indexOf(worst) } : null,
    // Against the box the last step left: its drag's last frame, the box after its keys, or the start when
    // undone; a settled case also fails on any step whose settled box left where that step put it.
    drop: Math.max(
      quadDistance(intended, committed.visible),
      ...steps.map((s) => Math.max(s.box ?? 0, s.size ?? 0)),
    ),
    reload: Math.max(
      quadDistance(committed.visible, reloaded.visible),
      quadDistance(intended, reloaded.visible),
    ),
    text: text && {
      ...text,
      pass:
        text.opened &&
        text.saved &&
        text.shown &&
        (!text.select || (text.selection?.editing && text.selection.text.trim().length > 0)),
    },
    reloaded: { ...reloaded, time: state.time },
    undo: {
      groups: groupsOk,
      bytes: undo.ok && sameFiles(committedFiles, expected ?? {}),
      box: quadDistance(undone.visible, pre.visible),
      redoBytes: redo.ok,
      redoBox: redone && quadDistance(redone.visible, committed.visible),
      // The slowest write of each walk, judged by the single-case undo rule.
      ms: slowest(undo.writes),
      redoMs: slowest(redo.writes),
    },
    undoTimeout: saveFault([
      ...undo.writes.map((w) => ["undo", w]),
      ...(redo.writes ?? []).map((w) => ["redo", w]),
    ]),
    smooth: { ...mergeSmooth(state.smooth), control },
    unsettled: Object.keys(quads).filter((k) => quads[k].unsettled),
    steps: steps.map(({ teleport, ...s }) => ({
      ...s,
      teleport: teleport && { ...teleport, trace: undefined },
    })),
    diag: {
      saves: { seen: versions.length - 1, owed },
      history: { ...groups, owed: state.depth, undid: undo.stepped ?? [] },
      undoWalk: undo.landed,
      redoWalk: redo.landed,
      traces: Object.fromEntries(
        drags.filter((s) => s.teleport.trace).map((s) => [steps.indexOf(s), s.teleport.trace]),
      ),
      consoleErrors: consoleErrors.slice(0, 5),
      quads: Object.fromEntries(Object.entries(quads).map(([k, m]) => [k, round(m)])),
    },
  };
}
