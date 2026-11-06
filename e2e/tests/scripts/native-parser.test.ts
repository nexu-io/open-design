import { describe, expect, test } from "vitest";
import { forEachNativeSource, parseSource, withNativeSourceParser } from "../../../scripts/lib/typescript/source.ts";
import { collectRelativeSpecifiers } from "../../../scripts/check-ts-nocheck-imports.ts";

describe("native guard parser", () => {
  test("a shared session invalidates changed source and switches TS/TSX syntax", async () => {
    await withNativeSourceParser(async () => {
      expect(collectRelativeSpecifiers("input.ts", 'const x = <string>value; import "./first.js";')).toEqual([
        { specifier: "./first.js", lineNumber: 1 },
      ]);
      expect(collectRelativeSpecifiers("input.ts", 'import "./second.js";')).toEqual([
        { specifier: "./second.js", lineNumber: 1 },
      ]);
      expect(collectRelativeSpecifiers("input.tsx", 'const view = <div>🌸</div>;\nimport "./third.js";')).toEqual([
        { specifier: "./third.js", lineNumber: 2 },
      ]);
      const oldTree = parseSource("input.ts", "const oldValue = 1;");
      parseSource("input.ts", "const newValue = 2;");
      expect(oldTree.statements[0]?.getText(oldTree)).toBe("const oldValue = 1;");
    });
  });

  test("batch parsing preserves source identity, syntax, and nested session cleanup", async () => {
    const first = 'import "./first.js";';
    const second = 'const view = <div>🌸</div>;\nimport "./second.js";';
    const sources = new Map([["first.ts", first], ["second.tsx", second]]);
    await withNativeSourceParser(async () => {
      expect(collectRelativeSpecifiers("first.ts", first)).toEqual([{ specifier: "./first.js", lineNumber: 1 }]);
      const tree = parseSource("first.ts", first);
      await expect(withNativeSourceParser(async () => {
        expect(collectRelativeSpecifiers("second.tsx", second)).toEqual([{ specifier: "./second.js", lineNumber: 2 }]);
        throw new Error("nested failure");
      }, sources)).rejects.toThrow("nested failure");
      expect(parseSource("first.ts", first)).toBe(tree);
      // A caller's changed content must never reuse its batch entry's AST.
      expect(collectRelativeSpecifiers("first.ts", 'import "./changed.js";')).toEqual([{ specifier: "./changed.js", lineNumber: 1 }]);
      const restored = parseSource("first.ts", first);
      expect(restored.statements[0]?.getText(restored)).toBe(first);
      expect(tree.statements[0]?.getText(tree)).toBe(first);
      expect(collectRelativeSpecifiers("second.tsx", second)).toEqual([{ specifier: "./second.js", lineNumber: 2 }]);
    }, sources);
  });

  test("bounded batches visit every file in order and retain useful old trees", async () => {
    const sources = new Map(Array.from({ length: 270 }, (_, index) => [
      `file-${index}.ts`, `import "./dependency-${index}.js";`,
    ]));
    const visited: string[] = [];
    let firstTree: ReturnType<typeof parseSource> | undefined;
    await forEachNativeSource(sources, (name, source) => {
      firstTree ??= parseSource(name, source);
      expect(collectRelativeSpecifiers(name, source)).toEqual([
        { specifier: `./dependency-${visited.length}.js`, lineNumber: 1 },
      ]);
      visited.push(name);
    });
    expect(visited).toEqual([...sources.keys()]);
    expect(firstTree?.statements[0]?.getText(firstTree)).toBe('import "./dependency-0.js";');
  });

  test("releases a failed session before the next parse", async () => {
    await expect(withNativeSourceParser(async () => {
      parseSource("input.ts", "const before = 1;");
      throw new Error("probe failure");
    })).rejects.toThrow("probe failure");
    const tree = parseSource("input.ts", "const after = 2;");
    expect(tree.statements[0]?.getText(tree)).toBe("const after = 2;");
  });
});
