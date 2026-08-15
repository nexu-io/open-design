import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const here = dirname(fileURLToPath(import.meta.url));
const desktopRoot = join(here, "../..");

function readSource(relativePath: string): string {
  return readFileSync(join(desktopRoot, relativePath), "utf8");
}

// Extracts a top-level `function <name>(...) { ... }` declaration. The export
// pipeline helpers all end with a column-0 closing brace, so the first
// newline-followed-by-`}` after the declaration is that function's own end
// (the same convention the sibling artifact-export-image-height test relies on).
function extractFunction(source: string, name: string): string {
  const start = source.indexOf(`function ${name}(`);
  if (start < 0) throw new Error(`${name} not found in source`);
  const end = source.indexOf("\n}", start);
  if (end < 0) throw new Error(`closing brace for ${name} not found`);
  return source.slice(start, end + 2);
}

// Strips the `name: string` / `): string` annotations from the extracted
// helper signatures so the pure helpers can compile as plain JavaScript. These
// helpers are dependency-free and carry no other type syntax in their bodies.
function stripTypeAnnotations(source: string): string {
  return source
    .replace(/\b(\w+)\s*:\s*string\b/g, "$1")
    .replace(/\)\s*:\s*string\b/g, ")");
}

function compileInjectTitle(
  source: string,
  escapeName: string,
): (doc: string, title: string) => string {
  const escape = stripTypeAnnotations(extractFunction(source, escapeName));
  const injectTitle = stripTypeAnnotations(extractFunction(source, "injectTitle"));
  const factory = new Function(`${escape}\n${injectTitle}\nreturn injectTitle;`);
  return factory() as (doc: string, title: string) => string;
}

const DOC = "<html><head><title>Old</title></head><body><p>BODY MARKER</p></body></html>";

// Titles carrying JavaScript `String.prototype.replace` replacement patterns.
// With a string replacement argument, ECMA-262 `GetSubstitution` expands
// `$$`, `$&`, `$\``, and `$'` inside the inserted title, corrupting the
// rendered document. Each escaped value is what the surrounding escape helper
// (`escapeHtmlText` / `escapeText`) should produce — `& < >` HTML-escaped,
// with every `$` sequence left intact.
const TITLES: ReadonlyArray<{ title: string; escaped: string }> = [
  { title: "Save $$$ This Quarter", escaped: "Save $$$ This Quarter" },
  { title: "Before $& After", escaped: "Before $&amp; After" },
  { title: "Rock $'n Roll Tour", escaped: "Rock $'n Roll Tour" },
  { title: "Price $`drop", escaped: "Price $`drop" },
  { title: "A <B> & $& C", escaped: "A &lt;B&gt; &amp; $&amp; C" },
];

const FILES = [
  ["pdf-export.ts", "escapeHtmlText"],
  ["artifact-export.ts", "escapeText"],
] as const;

function expectedDocument(escapedTitle: string): string {
  return `<html><head><title>${escapedTitle}</title></head><body><p>BODY MARKER</p></body></html>`;
}

describe.each(FILES)("%s injectTitle", (file, escapeName) => {
  const injectTitle = compileInjectTitle(readSource(join("src/main", file)), escapeName);

  for (const { title, escaped } of TITLES) {
    it(`inserts the title verbatim for ${JSON.stringify(title)}`, () => {
      expect(injectTitle(DOC, title)).toBe(expectedDocument(escaped));
    });
  }
});
