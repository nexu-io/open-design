import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { expect, it } from "vitest";

const SRC = dirname(fileURLToPath(import.meta.url));
const DOM_CTOR = String.raw`(?:HTML\w*Element|SVG\w*Element|Element|Node|Text|ShadowRoot|DocumentFragment)\b`;
// A DOM constructor read off any object, a window most of all, asks which window built a node.
const WINDOW_BOUND = [
  new RegExp(String.raw`[\w$)\]!?]\??\.\s*${DOM_CTOR}`),
  new RegExp(String.raw`^\s*\??\.\s*${DOM_CTOR}`),
  new RegExp(String.raw`\[\s*["'](?:HTML|SVG)\w*Element["']`),
];

function sources(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true, recursive: true })
    .filter((e) => e.isFile() && /\.tsx?$/.test(e.name) && !/\.test(-helpers)?\.tsx?$/.test(e.name))
    .map((e) => join(e.parentPath, e.name));
}

it("no studio source checks a DOM node against a window's own constructor", () => {
  const hits = sources(SRC).flatMap((file) =>
    readFileSync(file, "utf8")
      .split("\n")
      .map((line, i) => ({ line, at: `${relative(SRC, file)}:${i + 1}` }))
      .filter(({ line }) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .filter(({ line }) => WINDOW_BOUND.some((re) => re.test(line)))
      .map(({ at, line }) => `${at}  ${line.trim()}`),
  );
  expect(hits, "use @hyperframes/core/runtime/dom-realm instead").toEqual([]);
});
