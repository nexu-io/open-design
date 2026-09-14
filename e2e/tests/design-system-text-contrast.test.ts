import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "vitest";

const repoRoot = fileURLToPath(new URL("../../", import.meta.url));

function srgbComponent(value: number): number {
  const c = value / 255;
  return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
}

function relativeLuminance(hex: string): number {
  const clean = hex.replace(/^#/, "");
  const r = Number.parseInt(clean.slice(0, 2), 16);
  const g = Number.parseInt(clean.slice(2, 4), 16);
  const b = Number.parseInt(clean.slice(4, 6), 16);
  return 0.2126 * srgbComponent(r) + 0.7152 * srgbComponent(g) + 0.0722 * srgbComponent(b);
}

function contrastRatio(foreground: string, background: string): number {
  const [lighter, darker] = [relativeLuminance(foreground), relativeLuminance(background)].sort(
    (a, b) => b - a,
  );
  return (lighter + 0.05) / (darker + 0.05);
}

function readTokens(brand: string): Record<string, string> {
  const css = readFileSync(path.join(repoRoot, "design-systems", brand, "tokens.css"), "utf8");
  const declarations: Record<string, string> = {};
  for (const match of css.matchAll(/(--[A-Za-z0-9_-]+)\s*:\s*([^;]+);/g)) {
    declarations[match[1]!] = match[2]!.trim();
  }
  return declarations;
}
// meet WCAG AA normal text (4.5:1). Regression guard for PR #8135 review:
// both systems originally shipped brand-faithful accents that failed.
const TEXT_PAIRS: ReadonlyArray<{
  brand: string;
  foreground: string;
  background: string;
  context: string;
}> = [
  // riso fixture pairs
  { brand: "riso", foreground: "--accent-on", background: "--accent", context: "btn-primary label" },
  { brand: "riso", foreground: "--accent", background: "--bg", context: "title-highlight + links" },
  { brand: "riso", foreground: "--meta", background: "--bg", context: "eyebrow" },
  { brand: "riso", foreground: "--meta", background: "--surface", context: "status row" },
  { brand: "riso", foreground: "--meta", background: "--surface-warm", context: "badge" },
  { brand: "riso", foreground: "--muted", background: "--bg", context: "muted copy" },
  { brand: "riso", foreground: "--fg-2", background: "--bg", context: "lede" },
  { brand: "riso", foreground: "--fg", background: "--bg", context: "body" },
  // terracotta fixture pairs
  { brand: "terracotta", foreground: "--accent-on", background: "--accent", context: "btn-primary label" },
  {
    brand: "terracotta",
    foreground: "--accent",
    background: "--bg",
    context: "title-highlight + links",
  },
  { brand: "terracotta", foreground: "--muted", background: "--bg", context: "eyebrow + captions" },
  { brand: "terracotta", foreground: "--muted", background: "--surface", context: "status row" },
  { brand: "terracotta", foreground: "--meta", background: "--surface-warm", context: "badge" },
  { brand: "terracotta", foreground: "--fg-2", background: "--bg", context: "lede" },
  { brand: "terracotta", foreground: "--fg", background: "--bg", context: "body" },
];

test("[P2] riso/terracotta fixture text pairs meet WCAG AA normal text", () => {
  const failures: string[] = [];
  for (const pair of TEXT_PAIRS) {
    const tokens = readTokens(pair.brand);
    const foreground = tokens[pair.foreground];
    const background = tokens[pair.background];
    if (foreground == null || background == null) {
      failures.push(`${pair.brand} ${pair.context}: missing token ${foreground == null ? pair.foreground : pair.background}`);
      continue;
    }
    const ratio = contrastRatio(foreground, background);
    if (ratio < 4.5) {
      failures.push(
        `${pair.brand} ${pair.context}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1, below 4.5:1`,
      );
    }
  }
  assert.deepEqual(failures, []);
});
