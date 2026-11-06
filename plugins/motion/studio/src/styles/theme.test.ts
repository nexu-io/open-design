// @vitest-environment happy-dom

/** Guards the ways `theme.css` can silently break: a dropped CSS custom
 * property, a utility that stops compiling, the stock Tailwind palette
 * leaking back in, or the legacy colours drifting from it. */

import { readFileSync } from "node:fs";
import path from "node:path";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { Gear, IconContext } from "@phosphor-icons/react";
import { compile } from "tailwindcss";
import { afterEach, describe, expect, it } from "vitest";
import { readIconTokens } from "./iconTokens";
import { loadStylesheet, STYLES_DIR, TAILWIND_DIR } from "./styleSources";

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function buildSource(source: string, candidates: string[]): Promise<string> {
  const compiled = await compile(source, { base: STYLES_DIR, loadStylesheet });
  return compiled.build(candidates);
}

const build = (entry: string, candidates: string[]) =>
  buildSource(readFileSync(path.join(STYLES_DIR, entry), "utf8"), candidates);

function rootVariables(css: string): Map<string, string> {
  const block = css.match(/:root, :host \{([\s\S]*?)\n {2}\}/);
  const vars = new Map<string, string>();
  for (const line of (block?.[1] ?? "").split(";")) {
    const match = line.match(/(--[a-z0-9-]+):([\s\S]+)/i);
    if (match) vars.set(match[1], match[2].trim().replace(/\s+/g, " "));
  }
  return vars;
}

const themeSource = readFileSync(path.join(STYLES_DIR, "theme.css"), "utf8");

function declaredValue(name: string): string {
  const match = themeSource.match(new RegExp(`\\n\\s*${name}:\\s*([^;]+);`));
  if (!match) throw new Error(`theme.css does not declare ${name}`);
  return match[1].trim();
}

afterEach(() => {
  document.body.innerHTML = "";
  document.documentElement.removeAttribute("style");
});

describe("studio theme", () => {
  it("emits the semantic palette as custom properties and as utilities", async () => {
    const css = await build("studio.css", ["bg-accent", "text-text-2", "border-border"]);

    expect(rootVariables(css).get("--color-accent")).toBe(
      "light-dark(oklch(0.536 0.114 164), oklch(0.82 0.159 164))",
    );
    expect(css).toContain(".bg-accent {");
    expect(css).toContain("background-color: var(--color-accent)");
  });

  it("resolves an alpha modifier on a plain hex token through color-mix", async () => {
    const css = await build("studio.css", ["bg-accent/30"]);

    expect(css).toMatch(/\.bg-accent\\\/30 \{[\s\S]*?color-mix\(/);
  });

  it("drops every Tailwind default color Studio does not use", async () => {
    // `palette-reset.css` clears the stock palette. The entries Studio's
    // markup still references are re-declared as deprecated aliases (U12
    // removes them); anything outside that set must no longer resolve.
    const css = await build("studio.css", ["bg-neutral-750", "text-teal-500", "bg-neutral-800"]);

    expect(css).not.toContain("bg-neutral-750");
    expect(css).not.toContain("text-teal-500");
    expect(css).toContain(".bg-neutral-800 {");
  });

  it("leaves a host's stock Tailwind colors alone when only theme.css is imported", async () => {
    const css = await buildSource('@import "tailwindcss";\n@import "./theme.css";', [
      "bg-teal-500",
      "text-accent",
    ]);

    expect(css).toContain(".bg-teal-500 {");
    expect(css).toContain(".text-accent {");
  });

  it("keeps selection, playhead and accent as three distinct colors", () => {
    const accent = declaredValue("--color-accent");
    const selection = declaredValue("--color-selection");
    const playhead = declaredValue("--color-playhead");

    expect(new Set([accent, selection, playhead]).size).toBe(3);
  });

  it("names every micro type step in use and leaves the Tailwind sizes alone", async () => {
    const steps = [7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18];
    const css = await build(
      "studio.css",
      steps.map((step) => `text-step-${step}`).concat(["text-xs", "text-sm", "text-lg"]),
    );
    const vars = rootVariables(css);

    for (const step of steps) {
      expect(vars.get(`--text-step-${step}`)).toBe(`${step}px`);
      expect(css).toContain(`.text-step-${step} {`);
    }
    expect(vars.get("--text-xs")).toBe("0.75rem");
    expect(vars.get("--text-sm")).toBe("0.875rem");
    expect(vars.get("--text-lg")).toBe("1.125rem");
  });

  it("opens menus from a visible shape and closes them faster", () => {
    expect(declaredValue("--duration-open")).toBe("120ms");
    expect(declaredValue("--duration-close")).toBe("90ms");
    expect(declaredValue("--duration-tooltip")).toBe("100ms");
    expect(declaredValue("--popup-enter-opacity")).toBe("0.8");
    expect(declaredValue("--popup-enter-scale")).toBe("0.97");
    expect(declaredValue("--duration-hover")).toBe("150ms");
  });

  it("compiles a motion-duration utility with a reduced-motion variant", async () => {
    const css = await build("studio.css", ["duration-press", "duration-open"]);

    expect(css).toMatch(
      /\.duration-press \{[\s\S]*?transition-duration: var\(--duration-press\)[\s\S]*?prefers-reduced-motion: reduce[\s\S]*?transition-duration: 0ms/,
    );
    expect(css).toContain(".duration-open {");
  });

  it("keeps every legacy Tailwind palette entry that is not a role at its upstream value", async () => {
    // These are copies of Tailwind's own values, kept only so existing markup
    // renders unchanged. A Tailwind upgrade that moves one of them would
    // otherwise silently change Studio's colors.
    const upstream = new Map(
      [
        ...readFileSync(path.join(TAILWIND_DIR, "theme.css"), "utf8").matchAll(
          /\n\s*(--color-[a-z]+-(?:50|\d00|950)):\s*([^;]+);/g,
        ),
      ].map(([, name, value]) => [name, value.trim()]),
    );
    const legacy = [
      ...themeSource.matchAll(/\n\s*(--color-[a-z]+-(?:50|\d00|950)):\s*([^;]+);/g),
    ].filter(([, , value]) => !value.trim().startsWith("var("));

    expect(legacy.length).toBeGreaterThan(0);
    for (const [, name, value] of legacy) {
      expect(upstream.has(name), `${name} is not a Tailwind default`).toBe(true);
      expect(`${name}: ${value.trim()}`).toBe(`${name}: ${upstream.get(name)}`);
    }
  });

  it("maps every neutral step onto a Graphite role, so the stock scale follows the theme", () => {
    const steps = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900, 950];

    for (const step of steps) {
      expect(declaredValue(`--color-neutral-${step}`)).toMatch(/^var\(--color-[a-z0-9-]+\)$/);
    }
  });

  it("reads the icon defaults off the theme rather than hard-coding them", () => {
    document.documentElement.style.setProperty("--icon-size", "14px");
    document.documentElement.style.setProperty("--icon-weight", "bold");

    expect(readIconTokens()).toEqual({ size: "14px", weight: "bold" });
  });

  it("gives a child icon the token size and weight when it sets neither", () => {
    document.documentElement.style.setProperty("--icon-size", "14px");
    document.documentElement.style.setProperty("--icon-weight", "bold");

    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    act(() => {
      root.render(
        React.createElement(
          IconContext.Provider,
          { value: readIconTokens() },
          React.createElement(Gear, null),
        ),
      );
    });
    const inherited = host.querySelector("svg");
    const inheritedShape = inherited?.innerHTML;
    act(() => {
      root.render(React.createElement(Gear, { size: 14, weight: "bold" }));
    });
    const explicitShape = host.querySelector("svg")?.innerHTML;
    act(() => root.unmount());

    expect(inherited?.getAttribute("width")).toBe("14px");
    expect(inherited?.getAttribute("height")).toBe("14px");
    expect(inheritedShape).toBe(explicitShape);
  });
});
