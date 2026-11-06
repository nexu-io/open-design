import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";
import { menuClasses } from "./menuStyle";

const spacing = /(^| )-?(p|py|pt|pb|m|my|mt|mb)-\d/;
const root = join(__dirname, "../..");

/** Panels that are not a column of rows: a dialog, a crop toolbar, a preset card and a bare speed list. */
const NOT_ROW_MENUS = new Set([
  "player/components/AudioGainDialog.tsx",
  "components/editor/CropPresetBar.tsx",
  "components/editor/EaseCurveSection.tsx",
  "player/components/SpeedMenu.tsx",
]);

function sources(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) return sources(path);
    return /\.tsx$/.test(name) && !/\.test\./.test(name) ? [path] : [];
  });
}

const files = sources(root).map((path) => ({
  name: relative(root, path).replaceAll("\\", "/"),
  text: readFileSync(path, "utf8"),
}));

describe("menu style", () => {
  it("adds no padding or margin around a menu's rows", () => {
    for (const key of ["panel", "group", "divider"] as const)
      expect(menuClasses[key], key).not.toMatch(spacing);
  });

  it("clips the panel to its own rounded corners, so a highlight never pokes out of them", () => {
    expect(menuClasses.panel).toContain("overflow-hidden");
    expect(menuClasses.panel).toMatch(/(^| )rounded-/);
  });

  it("is the only place a menu panel's fill, border and shadow are written", () => {
    const handBuilt = files
      .filter(({ name }) => !NOT_ROW_MENUS.has(name))
      .filter(({ text }) =>
        [...text.matchAll(/["'`]([^"'`]*)["'`]/g)].some(
          ([, literal]) =>
            /shadow-(lg|xl)/.test(literal!) && /bg-(neutral-900|panel-bg-2)\b/.test(literal!),
        ),
      )
      .map(({ name }) => name);
    expect(handBuilt).toEqual([]);
  });

  it("is the panel of every role=menu, wherever its element is written", () => {
    const unowned = files
      .filter(({ text }) => text.includes('role="menu"'))
      .filter(({ name, text }) => !NOT_ROW_MENUS.has(name) && !text.includes("menuClasses.panel"))
      .map(({ name }) => name);
    expect(unowned).toEqual([]);
  });
});
