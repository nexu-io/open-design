import { describe, expect, it } from "vitest";
import type { CompositionVariable } from "@hyperframes/sdk";
import type { BindAction } from "../components/panels/VariablesBindElement";
import {
  matchAction,
  parseVarId,
  readBindingFrom,
  toCamel,
  uniqueId,
  type PromoteChannel,
} from "./variablePromoteHelpers";

function action(kind: BindAction["kind"], styleProp?: string): BindAction {
  return {
    key: `${kind}:${styleProp ?? ""}`,
    label: kind,
    kind,
    styleProp,
    suggestedId: "x",
    declaration: (id) => ({ id, type: "string", label: id, default: "" }),
  };
}

function decl(id: string): CompositionVariable {
  return { id, type: "string", label: id, default: "" };
}

describe("toCamel", () => {
  it("hyphenates CSS props to camelCase", () => {
    expect(toCamel("font-family")).toBe("fontFamily");
    expect(toCamel("background-color")).toBe("backgroundColor");
    expect(toCamel("color")).toBe("color");
  });
});

describe("parseVarId", () => {
  it("extracts the id from a var() reference", () => {
    expect(parseVarId("var(--headline-color)")).toBe("headline-color");
    expect(parseVarId("  var(--brand_1)  ")).toBe("brand_1");
  });
  it("tolerates a simple fallback value and !important", () => {
    expect(parseVarId("var(--accent, #000)")).toBe("accent");
    expect(parseVarId("var(--accent, transparent)")).toBe("accent");
    expect(parseVarId("var(--accent) !important")).toBe("accent");
  });
  it("does not parse a nested-paren fallback (degrades to unbound, not a wrong id)", () => {
    // Rare hand-authored case; regex can't balance parens. Returning null means
    // the control shows as unbound rather than binding to a wrong id.
    expect(parseVarId("var(--accent, rgb(0,0,0))")).toBeNull();
  });
  it("returns null for non-var values", () => {
    expect(parseVarId("#00c3ff")).toBeNull();
    expect(parseVarId("rgb(0,0,0)")).toBeNull();
    expect(parseVarId(undefined)).toBeNull();
    expect(parseVarId("")).toBeNull();
  });
});

describe("readBindingFrom", () => {
  const channels: Record<string, PromoteChannel> = {
    text: { kind: "text" },
    src: { kind: "src" },
    color: { kind: "style", prop: "color" },
    font: { kind: "style", prop: "font-family" },
  };

  it("reads data-var-text / data-var-src from attributes", () => {
    const src = {
      attributes: { "data-var-text": "title", "data-var-src": "logo" },
      inlineStyles: {},
    };
    expect(readBindingFrom(src, channels.text)).toBe("title");
    expect(readBindingFrom(src, channels.src)).toBe("logo");
  });

  it("reads a style-prop binding from inlineStyles var()", () => {
    const src = {
      attributes: {},
      inlineStyles: { color: "var(--accent)", fontFamily: "var(--brand-font)" },
    };
    expect(readBindingFrom(src, channels.color)).toBe("accent");
    expect(readBindingFrom(src, channels.font)).toBe("brand-font");
  });

  it("returns null when the channel is not bound", () => {
    const src = { attributes: {}, inlineStyles: { color: "#fff" } };
    expect(readBindingFrom(src, channels.text)).toBeNull();
    expect(readBindingFrom(src, channels.color)).toBeNull();
  });
});

describe("matchAction", () => {
  const actions = [
    action("text"),
    action("src"),
    action("style", "color"),
    action("style", "font-family"),
  ];

  it("matches text/src by kind", () => {
    expect(matchAction(actions, { kind: "text" })?.kind).toBe("text");
    expect(matchAction(actions, { kind: "src" })?.kind).toBe("src");
  });
  it("matches a style channel by its prop", () => {
    expect(matchAction(actions, { kind: "style", prop: "color" })?.styleProp).toBe("color");
    expect(matchAction(actions, { kind: "style", prop: "font-family" })?.styleProp).toBe(
      "font-family",
    );
  });
  it("returns null when no action fits the channel", () => {
    expect(matchAction(actions, { kind: "style", prop: "background-color" })).toBeNull();
    expect(matchAction([], { kind: "text" })).toBeNull();
  });
});

describe("uniqueId", () => {
  it("returns the base when free", () => {
    expect(uniqueId("headline", [decl("other")])).toBe("headline");
  });
  it("suffixes to avoid collisions", () => {
    expect(uniqueId("headline", [decl("headline")])).toBe("headline-2");
    expect(uniqueId("headline", [decl("headline"), decl("headline-2")])).toBe("headline-3");
  });
});
