/**
 * Pure form-logic guards for the Variables declaration form:
 * mergeDeclarationEdit (unmodeled-key passthrough on same-type edits) and
 * declarationFromDraft (per-type parsing + validation).
 */

import { describe, it, expect } from "vitest";
import { createMemoryAdapter, openComposition } from "@hyperframes/sdk";
import {
  mergeDeclarationEdit,
  declarationFromDraft,
  draftFromDeclaration,
  EMPTY_DRAFT,
} from "./VariablesDeclarationForm.js";
import type { CompositionVariable } from "@hyperframes/core/variables";

const fontDefault = {
  name: "monospace",
  source: "assets/brand.css",
  vendor: { familyId: "brand", weights: [400, 700] },
};
const imageDefault = {
  url: "assets/logo.svg",
  alt: "Brand logo",
  fit: "contain" as const,
  vendor: { assetId: "logo", crop: { x: 0, y: 1 } },
};
const objectDeclarations = [
  {
    id: "font",
    type: "font",
    label: "Brand font",
    default: fontDefault,
  },
  {
    id: "logo",
    type: "image",
    label: "Brand logo",
    default: imageDefault,
  },
] satisfies CompositionVariable[];

describe("mergeDeclarationEdit", () => {
  it("preserves unmodeled keys on a same-type edit", () => {
    // The form owns id/label/type/default/description/min/max/step/options; every
    // other key (source, brandRole, unit, maxLength, …) must ride through a Save.
    const original = {
      id: "brand",
      type: "font",
      label: "Brand font",
      default: "Inter",
      source: "brand-kit",
      default_name: "Inter",
      brandRole: "heading",
    } as unknown as CompositionVariable;
    const edited = {
      id: "brand",
      type: "font",
      label: "Brand heading font",
      default: "Inter",
    } as CompositionVariable;

    const merged = mergeDeclarationEdit(original, edited) as Record<string, unknown>;
    expect(merged.label).toBe("Brand heading font");
    expect(merged.source).toBe("brand-kit");
    expect(merged.default_name).toBe("Inter");
    expect(merged.brandRole).toBe("heading");
  });

  it("drops old type-specific metadata when the type changes", () => {
    const original = {
      id: "count",
      type: "number",
      label: "Count",
      default: 3,
      min: 0,
      max: 10,
    } as CompositionVariable;
    const edited = {
      id: "count",
      type: "string",
      label: "Count",
      default: "3",
    } as CompositionVariable;

    const merged = mergeDeclarationEdit(original, edited) as Record<string, unknown>;
    expect(merged).toEqual(edited);
    expect(merged.min).toBeUndefined();
    expect(merged.max).toBeUndefined();
  });
});

describe("declarationFromDraft", () => {
  for (const original of objectDeclarations) {
    it.each(["label", "description"])(
      `preserves the ${original.type} object on a %s-only edit through save/reopen`,
      async (field) => {
        const draft = draftFromDeclaration(original);
        expect(draft.defaultRaw).toBe(
          original.type === "font" ? original.default.name : original.default.url,
        );
        const edited = declarationFromDraft({ ...draft, [field]: "Updated metadata" });
        if (typeof edited === "string") throw new Error(edited);
        const merged = mergeDeclarationEdit(original, edited);
        expect(merged).toEqual({ ...original, [field]: "Updated metadata" });

        const persist = createMemoryAdapter();
        const session = await openComposition("<html><body></body></html>", {
          persist,
          coalesceMs: 0,
        });
        session.declareVariable(original);
        session.updateVariableDeclaration(original.id, merged);
        await session.flush();
        const reopened = await openComposition(await persist.read("composition.html"));
        try {
          expect(reopened.getVariableValue(original.id)).toEqual(original.default);
          expect(reopened.getVariableDeclarations()).toEqual([merged]);
        } finally {
          reopened.dispose();
          session.dispose();
        }
      },
    );

    it(`edits only the primary ${original.type} value`, () => {
      const edited = declarationFromDraft({
        ...draftFromDeclaration(original),
        defaultRaw: "replacement",
      });
      if (typeof edited === "string") throw new Error(edited);
      expect(mergeDeclarationEdit(original, edited).default).toEqual({
        ...original.default,
        ...(original.type === "font" ? { name: "replacement" } : { url: "replacement" }),
      });
    });

    it(`drops the ${original.type} object when changing type`, () => {
      const edited = declarationFromDraft({
        ...draftFromDeclaration(original),
        type: original.type === "font" ? "image" : "font",
        defaultRaw: "replacement",
      });
      if (typeof edited === "string") throw new Error(edited);
      expect(mergeDeclarationEdit(original, edited)).toEqual({
        id: original.id,
        label: original.label,
        type: original.type === "font" ? "image" : "font",
        default: "replacement",
      });
    });
  }

  it.each(["font", "image"] as const)("keeps %s string defaults scalar", (type) => {
    const original: CompositionVariable = {
      id: "brand",
      label: "Brand",
      type,
      default: "fallback",
    };
    expect(declarationFromDraft(draftFromDeclaration(original))).toEqual(original);
    expect(
      declarationFromDraft({
        ...EMPTY_DRAFT,
        id: "brand",
        label: "Brand",
        type,
        defaultRaw: "fallback",
      }),
    ).toEqual(original);
  });

  it("requires a non-empty id", () => {
    expect(declarationFromDraft({ ...EMPTY_DRAFT, id: "  " })).toBe("Variable id is required.");
  });

  it("parses a string variable verbatim and defaults label to id", () => {
    const decl = declarationFromDraft({ ...EMPTY_DRAFT, id: "title", defaultRaw: "Hello" });
    expect(decl).toEqual({ id: "title", label: "title", type: "string", default: "Hello" });
  });

  it("rejects a non-numeric number default", () => {
    expect(
      declarationFromDraft({ ...EMPTY_DRAFT, id: "n", type: "number", defaultRaw: "abc" }),
    ).toBe("Default must be a number.");
  });

  it("parses a number variable with min/max/step and drops blank constraints", () => {
    const decl = declarationFromDraft({
      ...EMPTY_DRAFT,
      id: "n",
      type: "number",
      defaultRaw: "5",
      min: "0",
      max: "",
      step: "0.5",
    });
    expect(decl).toEqual({ id: "n", label: "n", type: "number", default: 5, min: 0, step: 0.5 });
  });

  it("rejects an enum with no options and an off-list default", () => {
    expect(declarationFromDraft({ ...EMPTY_DRAFT, id: "e", type: "enum", optionsRaw: "" })).toBe(
      "Enum needs at least one option (one per line, value:Label).",
    );
    expect(
      declarationFromDraft({
        ...EMPTY_DRAFT,
        id: "e",
        type: "enum",
        optionsRaw: "wide:Wide\ntall:Tall",
        defaultRaw: "square",
      }),
    ).toBe("Default must be one of the options.");
  });

  it("parses a boolean from the 'true' sentinel", () => {
    expect(
      declarationFromDraft({ ...EMPTY_DRAFT, id: "b", type: "boolean", defaultRaw: "true" }),
    ).toMatchObject({
      type: "boolean",
      default: true,
    });
    expect(
      declarationFromDraft({ ...EMPTY_DRAFT, id: "b", type: "boolean", defaultRaw: "" }),
    ).toMatchObject({
      default: false,
    });
  });

  it("round-trips a declaration through draftFromDeclaration → declarationFromDraft", () => {
    const original: CompositionVariable = {
      id: "count",
      type: "number",
      label: "Count",
      default: 3,
      min: 0,
      max: 10,
    };
    expect(declarationFromDraft(draftFromDeclaration(original))).toEqual(original);
  });
});
