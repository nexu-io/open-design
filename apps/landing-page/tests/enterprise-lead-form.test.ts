import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

const FORM_PATH = new URL("../app/_components/enterprise-lead-form.astro", import.meta.url);

const REQUIRED_SELECT_IDS = [
  "ent-team-size",
  "ent-seats",
  "ent-country",
  "ent-budget",
  "ent-use-case",
  "ent-industry",
];

describe("enterprise lead form", () => {
  it("mirrors required custom-select semantics onto the visible trigger", async () => {
    const source = await readFile(FORM_PATH, "utf8");

    for (const id of REQUIRED_SELECT_IDS) {
      assert.match(
        source,
        new RegExp(
          [
            `<button[^>]+class="ent-cselect__trigger"`,
            `[^>]+role="combobox"`,
            `[^>]+aria-controls="${id}-menu"`,
            `[^>]+aria-labelledby="${id}-label ${id}-value"`,
            `[^>]+aria-describedby="${id}-error"`,
            `[^>]+aria-errormessage="${id}-error"`,
            `[^>]+aria-required="true"`,
            `[^>]+aria-invalid="false"`,
          ].join(""),
        ),
      );
      assert.match(source, new RegExp(`<span class="ent-cselect__value is-placeholder" id="${id}-value"`));
      assert.match(source, new RegExp(`<ul class="ent-cselect__menu" id="${id}-menu"`));
    }

    assert.match(source, /trigger\.setAttribute\('aria-invalid', bad \? 'true' : 'false'\)/);
  });
});
