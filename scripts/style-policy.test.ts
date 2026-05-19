import assert from "node:assert/strict";
import test from "node:test";

import {
  collectAsciiEllipsisInEn,
  collectCurlyApostropheInEn,
  collectCssHardcodedColorMatches,
  collectCssNamedColorMatches,
  collectMiscasedAcronymInEn,
  collectUnicodeEscapeInEn,
  collectUnpunctuatedHintInEn,
} from "./style-policy.ts";

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

// ---------------------------------------------------------------------------
// collectAsciiEllipsisInEn
// ---------------------------------------------------------------------------

test("collectAsciiEllipsisInEn flags ASCII ellipsis in a plain string value", () => {
  const source = `export const en = {\n  'settings.loading': 'Loading...',\n};\n`;
  const matches = collectAsciiEllipsisInEn(source);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.rule, "ascii-ellipsis");
  assert.equal(matches[0]?.line, 2);
});

test("collectAsciiEllipsisInEn passes when Unicode ellipsis is used", () => {
  const source = `export const en = {\n  'settings.loading': 'Loading…',\n};\n`;
  const matches = collectAsciiEllipsisInEn(source);
  assert.equal(matches.length, 0);
});

test("collectAsciiEllipsisInEn allows ASCII ellipsis inside {placeholder} syntax", () => {
  // {..} is not a real placeholder; {...} with exactly 3 dots would need special
  // handling but the real case is `{...}` used as a spread-like placeholder.
  const source = `export const en = {\n  'x': 'See {...} for details',\n};\n`;
  const matches = collectAsciiEllipsisInEn(source);
  assert.equal(matches.length, 0);
});

test("collectAsciiEllipsisInEn skips tasks.sample.* keys (editorial markdown)", () => {
  const source = [
    "export const en = {",
    "  'tasks.sample.mcp.body4': '- Tool-call schemas via JSON-RPC...',",
    "};",
  ].join("\n");
  const matches = collectAsciiEllipsisInEn(source);
  assert.equal(matches.length, 0);
});

test("collectAsciiEllipsisInEn allows ASCII ellipsis inside backtick code spans", () => {
  // Value contains backtick-quoted CLI syntax: `od run ...`
  const source =
    "export const en = {\n  'x': '`od run ...` — start a run',\n};\n";
  const matches = collectAsciiEllipsisInEn(source);
  assert.equal(matches.length, 0);
});

// ---------------------------------------------------------------------------
// collectUnicodeEscapeInEn
// ---------------------------------------------------------------------------

test("collectUnicodeEscapeInEn flags \\u2026 ellipsis escape", () => {
  const source = `export const en = {\n  'x': 'Loading\\u2026',\n};\n`;
  const matches = collectUnicodeEscapeInEn(source);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.rule, "unicode-escape");
});

test("collectUnicodeEscapeInEn flags \\u2014 em-dash escape", () => {
  const source = `export const en = {\n  'x': 'Save\\u2014Done',\n};\n`;
  const matches = collectUnicodeEscapeInEn(source);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.rule, "unicode-escape");
});

test("collectUnicodeEscapeInEn flags \\u2019 curly-apostrophe escape", () => {
  const source = `export const en = {\n  'x': 'can\\u2019t stop',\n};\n`;
  const matches = collectUnicodeEscapeInEn(source);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.rule, "unicode-escape");
});

test("collectUnicodeEscapeInEn passes when literal Unicode characters are used", () => {
  const source = `export const en = {\n  'x': 'Loading…',\n  'y': 'Save — Done',\n};\n`;
  const matches = collectUnicodeEscapeInEn(source);
  assert.equal(matches.length, 0);
});

// ---------------------------------------------------------------------------
// collectCurlyApostropheInEn
// ---------------------------------------------------------------------------

test("collectCurlyApostropheInEn flags a curly right single quotation mark", () => {
  const curly = "’";
  const source = `export const en = {\n  'x': 'can${curly}t',\n};\n`;
  const matches = collectCurlyApostropheInEn(source);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.rule, "curly-apostrophe");
});

test("collectCurlyApostropheInEn passes when straight apostrophe is used", () => {
  const source = `export const en = {\n  'x': "can't stop",\n};\n`;
  const matches = collectCurlyApostropheInEn(source);
  assert.equal(matches.length, 0);
});

test("collectCurlyApostropheInEn passes with no apostrophes", () => {
  const source = `export const en = {\n  'x': 'Loading',\n};\n`;
  const matches = collectCurlyApostropheInEn(source);
  assert.equal(matches.length, 0);
});

// ---------------------------------------------------------------------------
// collectMiscasedAcronymInEn
// ---------------------------------------------------------------------------

test("collectMiscasedAcronymInEn flags lowercase html in a value", () => {
  const source = `export const en = {\n  'x': 'Export as html',\n};\n`;
  const matches = collectMiscasedAcronymInEn(source);
  assert.equal(matches.some((m) => m.rule === "miscased-acronym:HTML"), true);
});

test("collectMiscasedAcronymInEn flags mixed-case Api in a value", () => {
  const source = `export const en = {\n  'x': 'Use the Api key.',\n};\n`;
  const matches = collectMiscasedAcronymInEn(source);
  assert.equal(matches.some((m) => m.rule === "miscased-acronym:API"), true);
});

test("collectMiscasedAcronymInEn passes for correctly cased acronyms", () => {
  const source = `export const en = {\n  'x': 'Export as HTML, set via API.',\n};\n`;
  const matches = collectMiscasedAcronymInEn(source);
  assert.equal(matches.length, 0);
});

test("collectMiscasedAcronymInEn does NOT flag standalone id without noun-phrase context", () => {
  const source = `export const en = {\n  'x': 'An id is needed.',\n};\n`;
  const matches = collectMiscasedAcronymInEn(source);
  assert.equal(matches.filter((m) => m.rule === "miscased-acronym:ID").length, 0);
});

test("collectMiscasedAcronymInEn flags lowercase id after noun context", () => {
  const source = `export const en = {\n  'x': 'Enter the project id.',\n};\n`;
  const matches = collectMiscasedAcronymInEn(source);
  assert.equal(matches.some((m) => m.rule === "miscased-acronym:ID"), true);
});

test("collectMiscasedAcronymInEn passes for correctly cased ID after noun context", () => {
  const source = `export const en = {\n  'x': 'Enter the project ID.',\n};\n`;
  const matches = collectMiscasedAcronymInEn(source);
  assert.equal(matches.filter((m) => m.rule === "miscased-acronym:ID").length, 0);
});

test("collectMiscasedAcronymInEn allows acronyms inside backtick code spans", () => {
  // Value contains backtick-quoted CLI syntax: `od plugin apply <id>`
  const source =
    "export const en = {\n  'x': 'Run `od plugin apply <id>` to apply.',\n};\n";
  const matches = collectMiscasedAcronymInEn(source);
  assert.equal(matches.filter((m) => m.rule === "miscased-acronym:ID").length, 0);
});

// ---------------------------------------------------------------------------
// collectUnpunctuatedHintInEn
// ---------------------------------------------------------------------------

test("collectUnpunctuatedHintInEn flags a Hint value missing trailing period", () => {
  const source = [
    "export const en = {",
    "  'settings.aboutHint': 'Switch the interface language saved to this browser',",
    "};",
  ].join("\n");
  const matches = collectUnpunctuatedHintInEn(source);
  assert.equal(matches.length, 1);
  assert.equal(matches[0]?.rule, "hint-missing-period");
});

test("collectUnpunctuatedHintInEn passes when Hint value ends with a period", () => {
  const source = [
    "export const en = {",
    "  'settings.aboutHint': 'Version and runtime details.',",
    "};",
  ].join("\n");
  const matches = collectUnpunctuatedHintInEn(source);
  assert.equal(matches.length, 0);
});

test("collectUnpunctuatedHintInEn skips short noun-phrase hints (<= 4 words)", () => {
  const source = [
    "export const en = {",
    "  'x.tabHint': 'Your plugins',",
    "};",
  ].join("\n");
  const matches = collectUnpunctuatedHintInEn(source);
  assert.equal(matches.length, 0);
});

test("collectUnpunctuatedHintInEn skips hints that start with lowercase (not sentence)", () => {
  const source = [
    "export const en = {",
    "  'x.hint': 'not a sentence with several words here',",
    "};",
  ].join("\n");
  const matches = collectUnpunctuatedHintInEn(source);
  assert.equal(matches.length, 0);
});

test("collectUnpunctuatedHintInEn accepts Unicode ellipsis as terminal punctuation", () => {
  const source = [
    "export const en = {",
    "  'settings.mcpHint': 'Loading model configuration from the daemon…',",
    "};",
  ].join("\n");
  const matches = collectUnpunctuatedHintInEn(source);
  assert.equal(matches.length, 0);
});
