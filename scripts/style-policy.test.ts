import assert from "node:assert/strict";
import test from "node:test";

import { collectCssHardcodedColorMatches, collectCssNamedColorMatches } from "./style-policy.ts";

test("collectCssNamedColorMatches finds named colors inside CSS shorthands and functions", () => {
  const source = [
    ".example { border: 1px solid red; }",
    ".gradient { background: linear-gradient(red, blue); }",
  ].join("\n");

  assert.deepEqual(
    collectCssNamedColorMatches(source).map((match) => match.value.toLowerCase()),
    ["red", "red", "blue"],
  );
});

test("collectCssNamedColorMatches covers mixed-case and full CSS named colors", () => {
  const source = ".example { border-color: RebeccaPurple; outline-color: tomato; }";

  assert.deepEqual(
    collectCssNamedColorMatches(source).map((match) => match.value),
    ["RebeccaPurple", "tomato"],
  );
});

test("collectCssNamedColorMatches keeps CSS-wide special keywords exempt", () => {
  const source = ".example { color: transparent; fill: currentColor; border-color: inherit; }";
  assert.deepEqual(collectCssNamedColorMatches(source), []);
});

test("collectCssNamedColorMatches skips strings, comments, urls, and var references", () => {
  const source = [
    "/* .ignored { color: red; } */",
    '.content { content: "green"; }',
    '.content-declaration { content: "{ color: red; }"; }',
    ".comment { color: /* red */ var(--blue); }",
    ".asset { background: url('/icons/blue.svg'); }",
  ].join("\n");

  assert.deepEqual(collectCssNamedColorMatches(source), []);
});

test("collectCssHardcodedColorMatches scans CSS var fallbacks", () => {
  const source = ".example { color: var(--missing-red, red); background: var(--x, rgb(1 2 3)); }";

  assert.deepEqual(
    collectCssHardcodedColorMatches(source).map((match) => match.value),
    ["red", "rgb(1 2 3)"],
  );
});

test("collectCssHardcodedColorMatches finds CSS colors in declaration values", () => {
  const source = ".example { color: #ff0000; background: rgb(255 0 0); border-color: hsl(0 100% 50%); }";

  assert.deepEqual(
    collectCssHardcodedColorMatches(source).map((match) => match.value),
    ["#ff0000", "rgb(255 0 0)", "hsl(0 100% 50%)"],
  );
});
