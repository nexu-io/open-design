// The token gate (R11, AE1). Tailwind silently drops a class it cannot compile, so `rounded-button`
// renders as no radius and nothing goes red. This compiles Studio's real entry stylesheet with every
// class the source claims and reports any candidate producing no selector as `file: class`.
// Tailwind is the only judge, so there is no allowlist; a failing class is fixed, never excused.

import { readFileSync } from "node:fs";
import path from "node:path";
import { compile } from "tailwindcss";
import { describe, expect, it } from "vitest";
import { extractClassCandidates } from "./classCandidates";
import { listSourceFiles, loadStylesheet, STYLES_DIR } from "./styleSources";

// A class selector in the emitted CSS, escapes removed: `.hover\:bg-surface\/50` reads back as its candidate.
const CLASS_SELECTOR = /\.((?:\\.|[^\s.,{}()>+~:[\]#'"*/\\])+)/g;

// Tailwind's `group`/`peer` variant markers (`group/card`) produce no rule of their own, so no
// compiled selector can vouch for them. Nothing else is exempt.
const MARKERS = new Set(["group", "peer"]);

// `hf-` is HyperFrames' reserved prefix for semantic hooks, not utilities, so Tailwind is the
// wrong judge of them.
const HOOK_PREFIX = /^hf-/;

/** Compile Studio's stylesheet and return every class it can produce. */
async function resolvable(candidates: string[]): Promise<Set<string>> {
  const compiled = await compile(readFileSync(path.join(STYLES_DIR, "studio.css"), "utf8"), {
    base: STYLES_DIR,
    loadStylesheet,
  });
  // Include the host theme and the unified connection/gallery styles imported by the app.
  const hostStyles = ["../motion/theme.css", "../motion/workspace.css", "../motion/media-gateway.css", "../../../web/design-system/controls.css", "../../../web/connect.css", "../../../web/template-gallery.css"];
  const css = compiled.build(candidates) + hostStyles.map(file => readFileSync(path.join(STYLES_DIR, file), "utf8")).join("\n");
  const selectors = new Set<string>();
  for (const [, selector] of css.matchAll(CLASS_SELECTOR)) {
    selectors.add(selector.replace(/\\(.)/g, "$1"));
  }
  return selectors;
}

// `file: class` for every class the sources claim that Tailwind cannot make. Sources are passed
// in so the fixtures exercise the same code path as the tree.
async function unresolved(sources: ReadonlyMap<string, string>): Promise<string[]> {
  const claims = new Map<string, string[]>();
  for (const [file, source] of sources) {
    for (const candidate of extractClassCandidates(source)) {
      const seen = claims.get(candidate.base);
      if (seen) seen.push(file);
      else claims.set(candidate.base, [file]);
    }
  }
  const produced = await resolvable([...claims.keys()]);
  const failures: string[] = [];
  for (const [candidate, files] of claims) {
    if (produced.has(candidate) || MARKERS.has(candidate.split("/")[0])) continue;
    if (HOOK_PREFIX.test(candidate)) continue;
    for (const file of files) failures.push(`${file}: ${candidate}`);
  }
  return failures.sort();
}

// Every file the gate reads, mirroring the `@source` globs in `studio.css`. Tests are excluded:
// a fixture in a test is not markup.
function studioSources(): Map<string, string> {
  return listSourceFiles((file) => /\.tsx?$/.test(file) && !/\.test\.tsx?$/.test(file));
}

describe("token gate", () => {
  it("names the file and the class when a class resolves to nothing", async () => {
    // AE1: `rounded-hologram` looks like a token name but is defined nowhere. The map is named
    // `buttonSizes`, not `sizeStyles`: the `cn()` that consumes it puts it in front of the gate.
    const failures = await unresolved(
      new Map([
        [
          "ui/Button.tsx",
          `const buttonSizes = { md: "h-8 rounded-hologram text-mega" };
           const Button = ({ size }) => <button className={cn(buttonSizes[size])} />;`,
        ],
      ]),
    );

    expect(failures).toEqual(["ui/Button.tsx: rounded-hologram", "ui/Button.tsx: text-mega"]);
  });

  it("accepts an arbitrary value and reports it as one", async () => {
    const source = `<div className="text-[11px]" />`;

    expect(await unresolved(new Map([["a.tsx", source]]))).toEqual([]);
    expect(extractClassCandidates(source).filter((c) => c.arbitrary)).toHaveLength(1);
  });

  it("accepts variants, static utilities and Studio's own CSS classes", async () => {
    // `timeline-clip` is a plain rule in `components.css`, not a utility.
    const source = `<div className="hover:bg-surface/50 text-center border-dashed timeline-clip" />`;

    expect(await unresolved(new Map([["a.tsx", source]]))).toEqual([]);
  });

  it("leaves Studio's own hook prefix and Tailwind's variant markers alone", async () => {
    const source = `<div className="group group/card peer hf-fx-node" />`;

    expect(await unresolved(new Map([["a.tsx", source]]))).toEqual([]);
  });

  it("claims nothing for a template chunk that touches an interpolation", async () => {
    expect(await unresolved(new Map([["a.tsx", "<div className={`w-${i}`} />"]]))).toEqual([]);
  });

  it("resolves every class Studio's own source claims", async () => {
    expect(await unresolved(studioSources())).toEqual([]);
  });
});
