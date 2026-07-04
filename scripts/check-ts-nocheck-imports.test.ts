import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  collectRelativeSpecifiers,
  collectTsNocheckImportViolationsFromSource,
  hasLeadingTsNocheck,
  resolvesRelativeSpecifier,
} from "./check-ts-nocheck-imports.ts";

test("hasLeadingTsNocheck detects a leading pragma, including after an author comment", () => {
  assert.equal(hasLeadingTsNocheck("// @ts-nocheck\nimport x from './x.js';"), true);
  assert.equal(
    hasLeadingTsNocheck("// Authors: someone\n// @ts-nocheck — carried over\nexport const a = 1;"),
    true,
  );
});

test("hasLeadingTsNocheck ignores @ts-nocheck that is not leading trivia", () => {
  assert.equal(hasLeadingTsNocheck("export const a = 1;\n// @ts-nocheck\n"), false);
  assert.equal(hasLeadingTsNocheck("const s = '@ts-nocheck';\n"), false);
  assert.equal(hasLeadingTsNocheck("import x from './x.js';\n"), false);
});

test("collectRelativeSpecifiers gathers every relative import edge, with line numbers", () => {
  const refs = collectRelativeSpecifiers(
    "a.ts",
    [
      "import { a } from './static.js';",
      "export { b } from './reexport.js';",
      "import type { C } from './type-only.js';",
      "const d = await import('./dynamic.js');",
      "type E = import('./import-type.js').E;",
    ].join("\n"),
  );

  assert.deepEqual(
    refs.map((reference) => reference.specifier),
    ["./static.js", "./reexport.js", "./type-only.js", "./dynamic.js", "./import-type.js"],
  );
  assert.deepEqual(
    refs.map((reference) => reference.lineNumber),
    [1, 2, 3, 4, 5],
  );
});

test("collectRelativeSpecifiers ignores external specifiers and string literals in comments/expressions", () => {
  const refs = collectRelativeSpecifiers(
    "a.ts",
    [
      "import path from 'node:path';",
      "import { Button } from '@open-design/components';",
      "// import { x } from './commented.js';",
      "const label = './not-an-import.js';",
    ].join("\n"),
  );

  assert.deepEqual(refs, []);
});

test("resolvesRelativeSpecifier maps .js specifiers to their real sibling and follows directory barrels", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "od-tsnocheck-"));
  await writeFile(path.join(root, "sibling.ts"), "export const a = 1;", "utf8");
  await mkdir(path.join(root, "domain"), { recursive: true });
  await writeFile(path.join(root, "domain", "index.ts"), "export const b = 2;", "utf8");
  await writeFile(path.join(root, "data.json"), "{}", "utf8");

  // `./sibling.js` resolves to sibling.ts (NodeNext .js -> .ts).
  assert.equal(resolvesRelativeSpecifier(root, "./sibling.js"), true);
  // `./domain/index.js` resolves to the barrel file.
  assert.equal(resolvesRelativeSpecifier(root, "./domain/index.js"), true);
  // extensionless directory import resolves via index.*
  assert.equal(resolvesRelativeSpecifier(root, "./domain"), true);
  // asset import must exist verbatim.
  assert.equal(resolvesRelativeSpecifier(root, "./data.json"), true);
  // a barrel-move casualty: the flat file no longer exists.
  assert.equal(resolvesRelativeSpecifier(root, "./sibling-moved.js"), false);
  assert.equal(resolvesRelativeSpecifier(root, "./domain/missing.js"), false);

  await rm(root, { force: true, recursive: true });
});

test("collectTsNocheckImportViolationsFromSource flags only the unresolved import in a @ts-nocheck file", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "od-tsnocheck-"));
  await writeFile(path.join(root, "present.ts"), "export const a = 1;", "utf8");

  const violations = collectTsNocheckImportViolationsFromSource(
    "module.ts",
    ["// @ts-nocheck", "import { a } from './present.js';", "import { b } from './gone.js';"].join("\n"),
    root,
  );

  assert.equal(violations.length, 1);
  assert.equal(violations[0]?.specifier, "./gone.js");
  assert.equal(violations[0]?.lineNumber, 3);

  await rm(root, { force: true, recursive: true });
});

test("collectTsNocheckImportViolationsFromSource ignores files without a leading @ts-nocheck", () => {
  // Same broken import, but the file is type-checked normally, so tsc already
  // guards it — this check must not double-report it.
  const violations = collectTsNocheckImportViolationsFromSource(
    "module.ts",
    "import { b } from './definitely-gone.js';",
    "/tmp/does-not-matter",
  );

  assert.deepEqual(violations, []);
});
