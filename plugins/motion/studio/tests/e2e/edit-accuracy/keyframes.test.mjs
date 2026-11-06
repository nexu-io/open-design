import { mkdtempSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { keyframeDrift, openedGroups, strayCss } from "./case.mjs";
import { buildGrid, writeFixture } from "./grid.mjs";
import { accurate } from "./ratchet.mjs";

const at = (values) => ({ values });

describe("keyframeDrift", () => {
  it("passes when every other keyframe reads back its value, and names the one that moved", () => {
    const before = { 0: at({ width: 240 }), 3: at({ width: 360 }) };
    expect(keyframeDrift(before, before)).toMatchObject({ pass: true, diff: 0 });
    const r = keyframeDrift(before, { 0: at({ width: 240 }), 3: at({ width: 372 }) });
    expect(r).toMatchObject({ pass: false, diff: 12, time: 3, prop: "width" });
  });

  it("fails a value it could not read", () => {
    const before = { 0: at({ x: 0 }) };
    expect(keyframeDrift(before, { 0: at({ x: Number.NaN }) }).pass).toBe(false);
  });
});

describe("openedGroups", () => {
  const page = (...tweens) => ({
    "index.html": `<div id="target"></div><script>
      var tl = gsap.timeline({ paused: true });
      ${tweens.join("\n")}
    </script>`,
  });
  const size = 'tl.to("#target", { width: 300, duration: 2 }, 0);';
  const x = 'tl.to("#target", { x: 60, duration: 2 }, 0);';

  it("passes an edit that keyframes another channel of a property already animated", () => {
    const keyframed =
      'tl.to("#target", { keyframes: { "50%": { width: 280, height: 200 } }, duration: 2 }, 0);';
    expect(openedGroups(page(size), page(keyframed))).toEqual([]);
    expect(
      openedGroups(page(x), page(x, 'tl.set("#target", { y: 30, data: "hf-hold" }, 0);')),
    ).toEqual([]);
    const marked =
      'tl.to("#target", { keyframes: { "0%": { width: 240, _auto: 1, transformOrigin: "50% 50%" }, "100%": { width: 300 } }, duration: 2 }, 0);';
    expect(openedGroups(page(size), page(marked))).toEqual([]);
  });

  it("names a property group nothing animated, and ignores a static gsap.set hold", () => {
    expect(
      openedGroups(page(size), page(size, 'tl.to("#target", { y: 20, duration: 2 }, 0);')),
    ).toEqual(["position"]);
    expect(openedGroups(page(size), page(size, 'gsap.set("#target", { x: 20 });'))).toEqual([]);
    const upper = {
      "index.html": `<div id="target"></div><SCRIPT type="text/javascript">var tl = gsap.timeline(); ${size} tl.to("#target", { y: 9, duration: 1 }, 0);</SCRIPT >`,
    };
    expect(openedGroups(page(size), upper)).toEqual(["position"]);
  });
});

describe("strayCss", () => {
  const file = (rule, inline = "") =>
    `<style>#target { position: absolute; ${rule} }</style><div ${inline}id="target" class="clip"></div>`;
  const original = { "index.html": file("left: 560px; width: 240px;") };

  it("allows plain CSS on a property nothing animates", () => {
    const saved = { "index.html": file("left: 600px; width: 240px;") };
    expect(strayCss(original, saved, ["width"])).toMatchObject({ pass: true });
  });

  it("catches an animated property written as plain CSS, in the rule or inline", () => {
    const rule = { "index.html": file("left: 560px; width: 260px;") };
    expect(strayCss(original, rule, ["width"]).stray).toEqual([
      "index.html rule width: 240px -> 260px",
    ]);
    const inline = { "index.html": file("left: 560px; width: 240px;", 'style="width: 260px" ') };
    expect(strayCss(original, inline, ["width"]).stray).toEqual([
      "index.html inline width: - -> 260px",
    ]);
  });
});

describe("the keyframed grid", () => {
  const grid = buildGrid("keyframes");

  it("crosses 6 variants, 5 gestures and 3 playheads each with rotation and zoom at the root, plus a nested resize per variant", () => {
    expect(grid).toHaveLength(6 * 5 * 3 * 2 * 2 + 6);
    const nested = grid.filter((c) => c.nesting === "nested");
    expect(nested.map((c) => c.id)).toContain("resize-scale-px-r0-nested-z100-on");
    expect(nested).toHaveLength(6);
    expect(
      nested.every(
        (c) => c.gesture === "resize" && c.at === "on" && c.zoom === 100 && c.rotation === 0,
      ),
    ).toBe(true);
    expect(new Set(grid.map((c) => c.id)).size).toBe(grid.length);
    expect(new Set(grid.map((c) => c.gsap))).toEqual(
      new Set(["size", "scale", "spin", "keys", "fromto", "late"]),
    );
    const on = grid.find((c) => c.id === "resize-keys-px-r0-root-z100-on");
    expect(on).toMatchObject({ playhead: 2, keys: { times: [0, 3], render: 3 } });
    expect(grid.find((c) => c.id === "resize-keys-px-r0-root-z100-mid").keys.times).toEqual([
      0, 2, 3,
    ]);
  });

  it("puts the playhead before a range that starts late and after every range", () => {
    expect(grid.find((c) => c.id === "resize-late-px-r0-root-z100-before")).toMatchObject({
      playhead: 0.5,
      keys: { times: [1, 2, 3], render: 3 },
    });
    expect(grid.find((c) => c.id === "resize-size-px-r0-root-z100-after")).toMatchObject({
      playhead: 3.5,
      keys: { times: [0, 2, 3] },
    });
    expect(grid.some((c) => c.id === "resize-late-px-r0-root-z100-mid")).toBe(false);
    expect(grid.some((c) => c.id === "resize-size-px-r0-root-z100-before")).toBe(false);
  });

  it("writes each variant's timeline into the file that holds the target", () => {
    // Nested keyframed cases left the grid; the fixture still writes them.
    const spec = {
      ...grid.find((c) => c.id === "move-fromto-px-r30-root-z100-on"),
      nesting: "nested",
    };
    const dir = mkdtempSync(join(tmpdir(), "edit-bench-keys-"));
    writeFixture(spec, dir);
    const sub = readFileSync(join(dir, "compositions/sub.html"), "utf8");
    expect(sub).toContain('tl.from("#target", { x: -60, duration: 2, ease: "none" }, 0);');
    expect(sub).toContain(
      'tl.fromTo("#target", { x: 0 }, { x: 60, duration: 1, ease: "none" }, 2);',
    );
  });

  it("runs in the full grid beside the cases already there", () => {
    const full = buildGrid("full").map((c) => c.id);
    expect(full).toEqual(expect.arrayContaining(grid.map((c) => c.id)));
    expect(full.length).toBeGreaterThan(grid.length);
    expect(new Set(full).size).toBe(full.length);
  });
});

describe("the gate on keyframed cases", () => {
  const good = { tracking: 0, drop: 0, reload: 0, render: 0, undo: true };
  it("fails a moved keyframe, stray CSS, a far render or an unmeasured one, and ignores old entries", () => {
    expect(accurate({ ...good, keys: true, css: true, renderKey: 0.1 })).toBe(true);
    expect(accurate({ ...good, keys: false, css: true, renderKey: 0.1 })).toBe(false);
    expect(accurate({ ...good, keys: true, css: false, renderKey: 0.1 })).toBe(false);
    expect(accurate({ ...good, keys: true, css: true, renderKey: 0.6 })).toBe(false);
    expect(accurate({ ...good, keys: true, css: true, renderKey: null })).toBe(false);
    expect(accurate(good)).toBe(true);
  });
});
