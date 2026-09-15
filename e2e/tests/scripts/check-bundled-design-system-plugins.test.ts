import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, test } from "vitest";

import {
  bundledDesignSystemViolations,
  KNOWN_UNPAIRED,
  KNOWN_UNPAIRED_CEILING,
  expectedRegistrySource,
  readBundledDesignSystemInput,
  registrySources,
  type BundledDesignSystemInput,
  type BundledPluginFiles,
} from "../../../scripts/check-bundled-design-system-plugins.ts";

const COMPLETE: BundledPluginFiles = { manifest: "ok", design: "ok" };

function inputFor(options: {
  brands: readonly string[];
  bundled: readonly string[];
  sources?: readonly string[];
  knownUnpaired?: readonly string[];
  knownUnpairedCeiling?: number;
  files?: ReadonlyMap<string, BundledPluginFiles>;
}): BundledDesignSystemInput {
  const { brands, bundled, knownUnpaired = [], knownUnpairedCeiling = knownUnpaired.length } = options;
  return {
    brands,
    bundled,
    filesByBundledSlug: options.files ?? new Map(bundled.map((slug) => [slug, COMPLETE] as const)),
    registrySources: options.sources ?? bundled.map(expectedRegistrySource),
    knownUnpaired,
    knownUnpairedCeiling,
  };
}

const only = (violations: string[]): string => {
  assert.equal(violations.length, 1, `expected one violation, got ${JSON.stringify(violations, null, 2)}`);
  return violations[0]!;
};

describe("brand and bundled plugin pairing", () => {
  test("passes when every brand is paired, complete, and listed once", () => {
    assert.deepEqual(
      bundledDesignSystemViolations(inputFor({ brands: ["linear", "vercel"], bundled: ["linear", "vercel"] })),
      [],
    );
  });

  // The #6387 shape: a brand ships on one side only, so its card has nowhere
  // to link.
  test("reports a brand that ships no bundled plugin", () => {
    const violation = only(bundledDesignSystemViolations(inputFor({ brands: ["linear", "kumo"], bundled: ["linear"] })));
    assert.match(violation, /design-systems\/kumo: no bundled plugin/);
  });

  // The mirror direction: the marketplace offers a system whose tokens do not
  // ship. Checking only brand -> bundled leaves this invisible.
  test("reports a bundled plugin with no brand package", () => {
    const violation = only(bundledDesignSystemViolations(inputFor({ brands: ["linear"], bundled: ["linear", "ghost"] })));
    assert.match(violation, /plugins\/_official\/design-systems\/ghost: no brand package/);
  });

  test("accepts a brand recorded as a known gap", () => {
    assert.deepEqual(
      bundledDesignSystemViolations(
        inputFor({ brands: ["linear", "kumo"], bundled: ["linear"], knownUnpaired: ["kumo"] }),
      ),
      [],
    );
  });

  test("reports a known-gap entry that is now paired", () => {
    const violation = only(
      bundledDesignSystemViolations(inputFor({ brands: ["kumo"], bundled: ["kumo"], knownUnpaired: ["kumo"] })),
    );
    assert.match(violation, /kumo is paired now — drop it from KNOWN_UNPAIRED/);
  });

  // The list records known work; it is not a place to park new gaps. Recording
  // one more than the ceiling allows fails, so growth cannot pass as a
  // one-line addition among the existing entries.
  test("reports a known-gap list that has grown past its ceiling", () => {
    const violations = bundledDesignSystemViolations(
      inputFor({
        brands: ["kumo", "newbrand"],
        bundled: [],
        knownUnpaired: ["kumo", "newbrand"],
        knownUnpairedCeiling: 1,
      }),
    );
    assert.match(only(violations), /KNOWN_UNPAIRED holds 2 brands but KNOWN_UNPAIRED_CEILING is 1/);
  });

  test("the shipped list is within its own ceiling", () => {
    assert.ok(
      KNOWN_UNPAIRED.length <= KNOWN_UNPAIRED_CEILING,
      `KNOWN_UNPAIRED has ${KNOWN_UNPAIRED.length} entries, ceiling is ${KNOWN_UNPAIRED_CEILING}`,
    );
  });

  test("reports a known-gap entry whose brand no longer exists", () => {
    const violation = only(
      bundledDesignSystemViolations(
        inputFor({ brands: ["linear"], bundled: ["linear"], knownUnpaired: ["removed-brand"] }),
      ),
    );
    assert.match(violation, /design-systems\/removed-brand no longer exists/);
  });

  test("accumulates independent violations rather than reporting the first", () => {
    const violations = bundledDesignSystemViolations(
      inputFor({
        brands: ["linear", "kumo"],
        bundled: ["linear", "ghost"],
        sources: [expectedRegistrySource("linear")],
      }),
    );
    assert.equal(violations.length, 3);
    assert.ok(violations.some((v) => /design-systems\/kumo: no bundled plugin/.test(v)));
    assert.ok(violations.some((v) => /ghost: no brand package/.test(v)));
    assert.ok(violations.some((v) => /no entry sources .*design-systems\/ghost/.test(v)));
  });
});

describe("bundled plugin completeness", () => {
  // Existence alone is not enough: an unreadable manifest resolves no detail
  // page, which is the same user-visible failure as no plugin at all.
  test.each([
    ["a missing manifest", { manifest: "missing", design: "ok" }, /missing open-design\.json/],
    ["an unparseable manifest", { manifest: "unparseable", design: "ok" }, /open-design\.json is not valid JSON/],
    ["a missing DESIGN.md", { manifest: "ok", design: "missing" }, /missing DESIGN\.md/],
    ["an empty DESIGN.md", { manifest: "ok", design: "empty" }, /DESIGN\.md is empty/],
  ] as const)("reports %s", (_label, files, pattern) => {
    const violation = only(
      bundledDesignSystemViolations(
        inputFor({ brands: ["linear"], bundled: ["linear"], files: new Map([["linear", files]]) }),
      ),
    );
    assert.match(violation, pattern);
  });

  test("reports a bundled plugin whose files could not be read", () => {
    const violation = only(
      bundledDesignSystemViolations(inputFor({ brands: ["linear"], bundled: ["linear"], files: new Map() })),
    );
    assert.match(violation, /could not read its files/);
  });
});

describe("marketplace registry", () => {
  test("reports a bundled plugin the registry does not offer", () => {
    const violation = only(
      bundledDesignSystemViolations(inputFor({ brands: ["linear"], bundled: ["linear"], sources: [] })),
    );
    assert.match(violation, /no entry sources ".*design-systems\/linear"/);
  });

  test("reports a duplicate entry, which would list one system twice", () => {
    const violation = only(
      bundledDesignSystemViolations(
        inputFor({
          brands: ["linear"],
          bundled: ["linear"],
          sources: [expectedRegistrySource("linear"), expectedRegistrySource("linear")],
        }),
      ),
    );
    assert.match(violation, /2 entries source .*design-systems\/linear/);
  });

  // A source is only useful if it resolves. Matching the trailing slug alone
  // accepts another repository, another ref, or a path below the plugin
  // directory — each of which produces the broken card this check is for.
  test.each([
    ["another repository", "github:attacker/evil-fork@main/plugins/_official/design-systems/linear"],
    ["another ref", "github:nexu-io/open-design@deleted-branch/plugins/_official/design-systems/linear"],
    ["a traversal prefix", "lol../../../plugins/_official/design-systems/linear"],
    ["a file below the plugin", "github:nexu-io/open-design@main/plugins/_official/design-systems/linear/DESIGN.md"],
    ["a trailing slash", "github:nexu-io/open-design@main/plugins/_official/design-systems/linear/"],
  ])("rejects a source naming %s", (_label, source) => {
    const violations = bundledDesignSystemViolations(
      inputFor({ brands: ["linear"], bundled: ["linear"], sources: [source] }),
    );
    assert.equal(violations.length, 2);
    assert.ok(violations.some((v) => /no entry sources/.test(v)));
    assert.ok(violations.some((v) => /is not a shipped bundled design system/.test(v)));
  });

  test("reports an entry for a bundled plugin that no longer ships", () => {
    const violation = only(
      bundledDesignSystemViolations(
        inputFor({
          brands: ["linear"],
          bundled: ["linear"],
          sources: [expectedRegistrySource("linear"), expectedRegistrySource("deleted")],
        }),
      ),
    );
    assert.match(violation, /is not a shipped bundled design system/);
  });

  test("ignores entries for other plugin categories", () => {
    assert.deepEqual(
      bundledDesignSystemViolations(
        inputFor({
          brands: ["linear"],
          bundled: ["linear"],
          sources: [
            expectedRegistrySource("linear"),
            "github:nexu-io/open-design@main/plugins/_official/atoms/build-test",
            "github:nexu-io/open-design@main/plugins/_official/examples/data-report",
          ],
        }),
      ),
      [],
    );
  });
});

describe("registry source extraction", () => {
  test("collects sources in file order and keeps duplicates", () => {
    assert.deepEqual(registrySources({ plugins: [{ source: "a" }, { source: "b" }, { source: "a" }] }), ["a", "b", "a"]);
  });

  test("tolerates malformed shapes without throwing", () => {
    assert.deepEqual(registrySources({}), []);
    assert.deepEqual(registrySources(null), []);
    assert.deepEqual(registrySources([]), []);
    assert.deepEqual(registrySources({ plugins: [null, 7, { source: 42 }, {}] }), []);
  });
});

describe("reading the repository", () => {
  let root: string | undefined;

  afterEach(() => {
    if (root !== undefined) rmSync(root, { recursive: true, force: true });
    root = undefined;
  });

  function fixture(): string {
    const created = mkdtempSync(path.join(os.tmpdir(), "od-bundled-ds-"));
    root = created;
    mkdirSync(path.join(created, "design-systems/linear"), { recursive: true });
    mkdirSync(path.join(created, "design-systems/_schema"), { recursive: true });
    writeFileSync(path.join(created, "design-systems/README.md"), "not a brand\n");
    const plugin = path.join(created, "plugins/_official/design-systems/linear");
    mkdirSync(plugin, { recursive: true });
    writeFileSync(path.join(plugin, "open-design.json"), JSON.stringify({ name: "open-design/linear" }));
    writeFileSync(path.join(plugin, "DESIGN.md"), "# Linear\n");
    mkdirSync(path.join(created, "plugins/registry/official"), { recursive: true });
    writeFileSync(
      path.join(created, "plugins/registry/official/open-design-marketplace.json"),
      JSON.stringify({ plugins: [{ source: expectedRegistrySource("linear") }] }),
    );
    return created;
  }

  test("excludes _schema and non-directory entries from the brand list", async () => {
    const input = await readBundledDesignSystemInput(fixture());
    assert.deepEqual(input.brands, ["linear"]);
    assert.deepEqual(bundledDesignSystemViolations({ ...input, knownUnpaired: [] }), []);
  });

  test("reads a parseable manifest and a non-empty DESIGN.md as complete", async () => {
    const input = await readBundledDesignSystemInput(fixture());
    assert.deepEqual(input.filesByBundledSlug.get("linear"), { manifest: "ok", design: "ok" });
  });

  test("classifies an unparseable manifest and an empty DESIGN.md", async () => {
    const created = fixture();
    const plugin = path.join(created, "plugins/_official/design-systems/linear");
    writeFileSync(path.join(plugin, "open-design.json"), "not json {{{");
    writeFileSync(path.join(plugin, "DESIGN.md"), "   \n");
    const input = await readBundledDesignSystemInput(created);
    assert.deepEqual(input.filesByBundledSlug.get("linear"), { manifest: "unparseable", design: "empty" });
  });

  // A symlinked package still ships, and `Dirent.isDirectory()` is false for a
  // link — without following it the brand would vanish from the check.
  test("counts a symlinked brand directory as a brand", async () => {
    const created = fixture();
    mkdirSync(path.join(created, "elsewhere/vercel"), { recursive: true });
    symlinkSync(path.join(created, "elsewhere/vercel"), path.join(created, "design-systems/vercel"), "dir");
    const input = await readBundledDesignSystemInput(created);
    assert.deepEqual(input.brands, ["linear", "vercel"]);
  });

  test("ignores a broken symlink, which points at no package", async () => {
    const created = fixture();
    symlinkSync(path.join(created, "nothing-here"), path.join(created, "design-systems/dangling"), "dir");
    const input = await readBundledDesignSystemInput(created);
    assert.deepEqual(input.brands, ["linear"]);
  });

  test("fails with one diagnosis when the registry has no plugins array", async () => {
    const created = fixture();
    writeFileSync(path.join(created, "plugins/registry/official/open-design-marketplace.json"), "[]");
    await assert.rejects(readBundledDesignSystemInput(created), /has no "plugins" array/);
  });
});
