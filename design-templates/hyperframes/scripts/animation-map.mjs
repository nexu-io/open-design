#!/usr/bin/env node
// animation-map.mjs — HyperFrames animation map for agents
//
// Reads every GSAP timeline registered in window.__timelines, enumerates
// tweens, samples bboxes at N points per tween, computes flags and
// human-readable summaries. Outputs a single animation-map.json.
//
// Usage:
//   node skills/hyperframes/scripts/animation-map.mjs <composition-dir> \
//     [--frames N] [--out <dir>] [--min-duration S] [--width W] [--height H] [--fps N]

import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";
import { hyperframesPackageSpec, importPackagesOrBootstrap } from "./package-loader.mjs";

const {
  createFileServer,
  createCaptureSession,
  initializeSession,
  closeCaptureSession,
  getCompositionDuration,
} = (
  await importPackagesOrBootstrap(["@hyperframes/producer"], {
    npmPackages: [hyperframesPackageSpec("@hyperframes/producer")],
  })
)["@hyperframes/producer"];

// ─── CLI ─────────────────────────────────────────────────────────────────────

const args = parseArgs(process.argv.slice(2));
if (!args.composition) die("missing <composition-dir>");

const FRAMES = Number(args.frames ?? 6);
const OUT_DIR = resolve(args.out ?? ".hyperframes/anim-map");
const MIN_DUR = Number(args["min-duration"] ?? 0.15);
const WIDTH = Number(args.width ?? 1920);
const HEIGHT = Number(args.height ?? 1080);
const FPS = Number(args.fps ?? 30);
const COMP_DIR = resolve(args.composition);

await mkdir(OUT_DIR, { recursive: true });

// ─── Main ────────────────────────────────────────────────────────────────────

const server = await createFileServer({ projectDir: COMP_DIR, port: 0 });
const session = await createCaptureSession(
  server.url,
  OUT_DIR,
  { width: WIDTH, height: HEIGHT, fps: FPS, format: "png" },
  null,
);
await initializeSession(session);

try {
  const duration = await getCompositionDuration(session);
  const tweens = await enumerateTweens(session);
  const kept = tweens.filter((tw) => tw.end - tw.start >= MIN_DUR);

  const report = {
    composition: COMP_DIR,
    duration,
    totalTweens: tweens.length,
    mappedTweens: kept.length,
    skippedMicroTweens: tweens.length - kept.length,
    tweens: [],
  };

  for (let i = 0; i < kept.length; i++) {
    const tw = kept[i];
    const times = Array.from(
      { length: FRAMES },
      (_, k) => +(tw.start + ((k + 0.5) / FRAMES) * (tw.end - tw.start)).toFixed(3),
    );

    const bboxes = [];
    for (const t of times) {
      await seekTo(session, t);
      const bbox = await measureTarget(session, tw.selectorHint);
      bboxes.push({ t, ...bbox });
    }

    const animProps = tw.props.filter(
      (p) => !["parent", "overwrite", "immediateRender", "startAt", "runBackwards"].includes(p),
    );
    const flags = computeFlags(tw, bboxes, { width: WIDTH, height: HEIGHT });
    const summary = describeTween(tw, animProps, bboxes, flags);

    report.tweens.push({
      index: i + 1,
      selector: tw.selectorHint,
      targets: tw.targetCount,
      props: animProps,
      start: +tw.start.toFixed(3),
      end: +tw.end.toFixed(3),
      duration: +(tw.end - tw.start).toFixed(3),
      ease: tw.ease,
      bboxes,
      flags,
      summary,
    });
  }

  markCollisions(report.tweens);

  for (const tw of report.tweens) {
    if (tw.flags.includes("collision") && !tw.summary.includes("collision")) {
      tw.summary += " Overlaps another animated element.";
    }
  }

  // ── Composition-level analysis ──
  report.choreography = buildTimeline(report.tweens, duration);
  report.density = computeDensity(report.tweens, duration);
  report.staggers = detectStaggers(report.tweens);
  report.elements = buildElementLifecycles(report.tweens);
  report.deadZones = findDeadZones(report.density, duration);
  report.snapshots = await captureSnapshots(session, report.tweens, duration);

  await writeFile(join(OUT_DIR, "animation-map.json"), JSON.stringify(report, null, 2));

  printSummary(report);
} finally {
  await closeCaptureSession(session).catch(() => {});
  server.close();
}

// ─── Seek helper ────────────────────────────────────────────────────────────

async function seekTo(session, t) {
  await session.page.evaluate((time) => {
    if (window.__hf && typeof window.__hf.seek === "function") {
      window.__hf.seek(time);
      return;
    }
    const tls = window.__timelines;
    if (tls) {
      for (const tl of Object.values(tls)) {
        if (typeof tl.seek === "function") tl.seek(time);
      }
    }
  }, t);
  await new Promise((r) => setTimeout(r, 100));
}

// ─── Timeline introspection ──────────────────────────────────────────────────

async function enumerateTweens(session) {
  return await session.page.evaluate(() => {
    const results = [];
    const registry = window.__timelines || {};

    const selectorOf = (el) => {
      if (!el || !(el instanceof Element)) return null;
      if (el.id) return `#${el.id}`;
      const cls = [...el.classList].slice(0, 2).join(".");
      return cls ? `${el.tagName.toLowerCase()}.${cls}` : el.tagName.toLowerCase();
    };

    const walk = (node, parentOffset = 0) => {
      if (!node) return;
      if (typeof node.getChildren === "function") {
        const offset = parentOffset + (node.startTime?.() ?? 0);
        for (const child of node.getChildren(true, true, true)) {
          walk(child, offset);
        }
        return;
      }
      const targets = (node.targets?.() ?? []).filter((t) => t instanceof Element);
      if (!targets.length) return;
      const vars = node.vars ?? {};
      const props = Object.keys(vars).filter(
        (k) =>
          ![
            "duration",
            "ease",
            "delay",
            "repeat",
            "yoyo",
            "onStart",
            "onUpdate",
            "onComplete",
            "stagger",
          ].includes(k),
      );
      const start = parentOffset + (node.startTime?.() ?? 0);
      const end = start + (node.duration?.() ?? 0);
      results.push({
        selectorHint: selectorOf(targets[0]) ?? "(unknown)",
        targetCount: targets.length,
        props,
        start,
        end,
        ease: typeof vars.ease === "string" ? vars.ease : (vars.ease?.toString?.() ?? "none"),
      });
    };

    for (const tl of Object.values(registry)) walk(tl, 0);
    results.sort((a, b) => a.start - b.start);
    return results;
  });
}

async function measureTarget(session, selector) {
  return await session.page.evaluate((sel) => {
    const el = document.querySelector(sel);
    if (!el) return { x: 0, y: 0, w: 0, h: 0, missing: true };
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return {
      x: Math.round(r.x),
      y: Math.round(r.y),
      w: Math.round(r.width),
      h: Math.round(r.height),
      opacity: parseFloat(cs.opacity),
      visible: cs.visibility !== "hidden" && cs.display !== "none",
    };
  }, selector);
}

// ─── Tween description (the key output for agents) ──────────────────────────

function describeTween(tw, props, bboxes, flags) {
  const dur = (tw.end - tw.start).toFixed(2);
  const parts = [];

  parts.push(`${tw.selectorHint} animates ${props.join("+")} over ${dur}s (${tw.ease})`);

  // Movement
  const first = bboxes[0];
  const last = bboxes[bboxes.length - 1];
  if (first && last) {
    const dx = last.x - first.x;
    const dy = last.y - first.y;
    if (Math.abs(dx) > 3 || Math.abs(dy) > 3) {
      const dirs = [];
      if (Math.abs(dy) > 3) dirs.push(dy < 0 ? `${Math.abs(dy)}px up` : `${Math.abs(dy)}px down`);
      if (Math.abs(dx) > 3)
        dirs.push(dx < 0 ? `${Math.abs(dx)}px left` : `${Math.abs(dx)}px right`);
      parts.push(`moves ${dirs.join(" and ")}`);
    }
  }

  // Opacity
  if (first && last && first.opacity !== undefined && last.opacity !== undefined) {
    const o1 = first.opacity;
    const o2 = last.opacity;
    if (Math.abs(o2 - o1) > 0.1) {
      if (o1 < 0.1 && o2 > 0.5) parts.push("fades in");
      else if (o1 > 0.5 && o2 < 0.1) parts.push("fades out");
      else parts.push(`opacity ${o1.toFixed(1)}→${o2.toFixed(1)}`);
    }
  }

  // Scale (from props)
  if (props.includes("scale") || props.includes("scaleX") || props.includes("scaleY")) {
    parts.push("scales");
  }

  // Size changes
  if (first && last) {
    const dw = last.w - first.w;
    const dh = last.h - first.h;
    if (Math.abs(dw) > 5) parts.push(`width ${first.w}→${last.w}px`);
    if (Math.abs(dh) > 5) parts.push(`height ${first.h}→${last.h}px`);
  }

  // Visibility
  if (first && last && first.visible !== last.visible) {
    parts.push(last.visible ? "becomes visible" : "becomes hidden");
  }

  // Final position
  if (last && !last.missing) {
    parts.push(`ends at (${last.x}, ${last.y}) ${last.w}×${last.h}px`);
  }

  // Flags
  if (flags.length > 0) {
    parts.push(`FLAGS: ${flags.join(", ")}`);
  }

  return parts.join(". ") + ".";
}

// ─── Flag computation ───────────────────────────────────────────────────────

function computeFlags(tw, bboxes, { width, height }) {
  const flags = [];
  const dur = tw.end - tw.start;

  if (bboxes.every((b) => b.w === 0 || b.h === 0)) flags.push("degenerate");

  const anyOffscreen = bboxes.some(
    (b) =>
      b.x + b.w <= 0 ||
      b.y + b.h <= 0 ||
      b.x >= width ||
      b.y >= height ||
      b.x < -b.w * 0.5 ||
      b.y < -b.h * 0.5 ||
      b.x + b.w > width + b.w * 0.5 ||
      b.y + b.h > height + b.h * 0.5,
  );
  if (anyOffscreen) flags.push("offscreen");

  if (bboxes.every((b) => b.opacity !== undefined && b.opacity < 0.01 && b.visible)) {
    flags.push("invisible");
  }

  if (dur < 0.2 && tw.props.some((p) => ["y", "x", "opacity", "scale"].includes(p))) {
    flags.push("paced-fast");
  }
  if (dur > 2.0) flags.push("paced-slow");

  return flags;
}

function markCollisions(tweens) {
  for (let i = 0; i < tweens.length; i++) {
    for (let j = i + 1; j < tweens.length; j++) {
      const a = tweens[i];
      const b = tweens[j];
      if (a.end <= b.start || b.end <= a.start) continue;
      for (const ba of a.bboxes) {
        const bb = b.bboxes.find((x) => Math.abs(x.t - ba.t) < 0.05);
        if (!bb) continue;
        const overlap = rectOverlapArea(ba, bb);
        const aArea = ba.w * ba.h;
        if (aArea > 0 && overlap / aArea > 0.3) {
          if (!a.flags.includes("collision")) a.flags.push("collision");
          if (!b.flags.includes("collision")) b.flags.push("collision");
          break;
        }
      }
    }
  }
}

function rectOverlapArea(a, b) {
  const x1 = Math.max(a.x, b.x);
  const y1 = Math.max(a.y, b.y);
  const x2 = Math.min(a.x + a.w, b.x + b.w);
  const y2 = Math.min(a.y + a.h, b.y + b.h);
  return Math.max(0, x2 - x1) * Math.max(0, y2 - y1);
}

// ─── Composition-level analysis ─────────────────────────────────────────────

function buildTimeline(tweens, duration) {
  const cols = 60;
  const lines = [];
  const secPerCol = duration / cols;

  lines.push("Timeline (" + duration.toFixed(1) + "s, each char ≈ " + secPerCol.toFixed(2) + "s):");
  lines.push("  " + "0s" + " ".repeat(cols - 8) + duration.toFixed(0) + "s");
  lines.push("  " + "┼" + "─".repeat(cols - 1) + "┤");

  for (const tw of tweens) {
    const startCol = Math.floor(tw.start / secPerCol);
    const endCol = Math.min(cols, Math.ceil(tw.end / secPerCol));
    const bar =
      " ".repeat(startCol) +
      "█".repeat(Math.max(1, endCol - startCol)) +
      " ".repeat(Math.max(0, cols - endCol));
    const label = tw.selector + " " + tw.props.join("+");
    lines.push("  " + bar + "  " + label);
  }

  return lines.join("\n");
}

function computeDensity(tweens, duration) {
  const buckets = [];
  for (let t = 0; t < duration; t += 0.5) {
    const active = tweens.filter((tw) => tw.start <= t + 0.5 && tw.end >= t);
    buckets.push({ t: +t.toFixed(1), activeTweens: active.length });
  }
  return buckets;
}

function findDeadZones(density, duration) {
  const zones = [];
  let zoneStart = null;
  for (const d of density) {
    if (d.activeTweens === 0) {
      if (zoneStart === null) zoneStart = d.t;
    } else {
      if (zoneStart !== null) {
        const zoneEnd = d.t;
        if (zoneEnd - zoneStart >= 1.0) {
          zones.push({
            start: zoneStart,
            end: zoneEnd,
            duration: +(zoneEnd - zoneStart).toFixed(1),
            note:
              "No animation for " +
              (zoneEnd - zoneStart).toFixed(1) +
              "s. Intentional hold or missing entrance?",
          });
        }
        zoneStart = null;
      }
    }
  }
  if (zoneStart !== null && duration - zoneStart >= 1.0) {
    zones.push({
      start: zoneStart,
      end: +duration.toFixed(1),
      duration: +(duration - zoneStart).toFixed(1),
      note:
        "No animation for " +
        (duration - zoneStart).toFixed(1) +
        "s at end. Final hold or missing outro?",
    });
  }
  return zones;
}

function detectStaggers(tweens) {
  const groups = [];
  const used = new Set();

  for (let i = 0; i < tweens.length; i++) {
    if (used.has(i)) continue;
    const tw = tweens[i];
    const group = [tw];
    used.add(i);

    for (let j = i + 1; j < tweens.length; j++) {
      if (used.has(j)) continue;
      const other = tweens[j];
      const sameProps = tw.props.join(",") === other.props.join(",");
      const sameDuration = Math.abs(tw.duration - other.duration) < 0.05;
      const closeInTime = other.start - tw.start < tw.duration * 4;
      if (sameProps && sameDuration && closeInTime) {
        group.push(other);
        used.add(j);
      }
    }

    if (group.length >= 3) {
      const intervals = [];
      for (let k = 1; k < group.length; k++) {
        intervals.push(+(group[k].start - group[k - 1].start).toFixed(3));
      }
      const avgInterval = intervals.reduce((a, b) => a + b, 0) / intervals.length;
      const maxDrift = Math.max(...intervals.map((iv) => Math.abs(iv - avgInterval)));
      const consistent = maxDrift < avgInterval * 0.3;

      groups.push({
        elements: group.map((g) => g.selector),
        props: tw.props,
        count: group.length,
        intervals,
        avgInterval: +avgInterval.toFixed(3),
        consistent,
        note: consistent
          ? group.length +
            " elements stagger at " +
            (avgInterval * 1000).toFixed(0) +
            "ms intervals"
          : group.length +
            " elements stagger with uneven intervals (" +
            intervals.map((iv) => (iv * 1000).toFixed(0) + "ms").join(", ") +
            ")",
      });
    }
  }

  return groups;
}

function buildElementLifecycles(tweens) {
  const elements = {};
  for (const tw of tweens) {
    const sel = tw.selector;
    if (!elements[sel]) {
      elements[sel] = { firstTween: tw.start, lastTween: tw.end, tweenCount: 0, props: new Set() };
    }
    elements[sel].firstTween = Math.min(elements[sel].firstTween, tw.start);
    elements[sel].lastTween = Math.max(elements[sel].lastTween, tw.end);
    elements[sel].tweenCount++;
    tw.props.forEach((p) => elements[sel].props.add(p));
  }

  const result = {};
  for (const [sel, data] of Object.entries(elements)) {
    const lastBbox = findLastBbox(tweens, sel);
    result[sel] = {
      firstAppears: +data.firstTween.toFixed(3),
      lastAnimates: +data.lastTween.toFixed(3),
      tweenCount: data.tweenCount,
      props: [...data.props],
      endsVisible: lastBbox ? lastBbox.opacity > 0.1 && lastBbox.visible : null,
      finalPosition: lastBbox
        ? { x: lastBbox.x, y: lastBbox.y, w: lastBbox.w, h: lastBbox.h }
        : null,
    };
  }
  return result;
}

function findLastBbox(tweens, selector) {
  for (let i = tweens.length - 1; i >= 0; i--) {
    if (tweens[i].selector === selector && tweens[i].bboxes?.length > 0) {
      return tweens[i].bboxes[tweens[i].bboxes.length - 1];
    }
  }
  return null;
}

async function captureSnapshots(session, tweens, duration) {
  const times = [0, duration * 0.25, duration * 0.5, duration * 0.75, duration - 0.1];
  const snapshots = [];

  for (const t of times) {
    await seekTo(session, t);
    const visible = await session.page.evaluate(() => {
      const out = [];
      const els = document.querySelectorAll("[id]");
      for (const el of els) {
        const cs = getComputedStyle(el);
        if (cs.display === "none") continue;
        const opacity = parseFloat(cs.opacity);
        if (opacity < 0.01) continue;
        const rect = el.getBoundingClientRect();
        if (rect.width < 1 || rect.height < 1) continue;
        out.push({
          id: el.id,
          x: Math.round(rect.x),
          y: Math.round(rect.y),
          w: Math.round(rect.width),
          h: Math.round(rect.height),
          opacity: +opacity.toFixed(2),
        });
      }
      return out;
    });

    const activeTweens = tweens
      .filter((tw) => tw.start <= t && tw.end >= t)
      .map((tw) => tw.selector);

    snapshots.push({
      t: +t.toFixed(2),
      visibleElements: visible.length,
      animatingNow: activeTweens,
      elements: visible,
    });
  }

  return snapshots;
}

// ─── Output ─────────────────────────────────────────────────────────────────

function printSummary(report) {
  console.log(
    `\nAnimation map: ${report.mappedTweens}/${report.totalTweens} tweens (skipped ${report.skippedMicroTweens} micro-tweens)`,
  );

  const flagCounts = {};
  for (const tw of report.tweens) {
    for (const f of tw.flags) flagCounts[f] = (flagCounts[f] ?? 0) + 1;
  }
  if (Object.keys(flagCounts).length > 0) {
    for (const [f, n] of Object.entries(flagCounts)) console.log(`  ${f}: ${n}`);
  }
  if (report.staggers?.length > 0) {
    console.log(`  staggers: ${report.staggers.map((s) => s.note).join("; ")}`);
  }
  if (report.deadZones?.length > 0) {
    console.log(
      `  dead zones: ${report.deadZones.map((z) => z.start + "-" + z.end + "s").join(", ")}`,
    );
  }

  console.log(report.choreography);
}

function parseArgs(argv) {
  const out = {};
  let positional = 0;
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith("--")) {
      const k = a.slice(2);
      const v = argv[i + 1]?.startsWith("--") ? true : argv[++i];
      out[k] = v;
    } else if (positional === 0) {
      out.composition = a;
      positional++;
    }
  }
  return out;
}

function die(msg) {
  console.error(`animation-map: ${msg}`);
  process.exit(2);
}
