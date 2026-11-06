import { describe, expect, it } from "vitest";
import { extractClassCandidates } from "./classCandidates";

function bases(source: string): string[] {
  return extractClassCandidates(source)
    .map((candidate) => candidate.base)
    .sort();
}

describe("extractClassCandidates", () => {
  it("reads a plain className attribute", () => {
    expect(bases(`<div className="text-center border-dashed" />`)).toEqual([
      "border-dashed",
      "text-center",
    ]);
  });

  it("reads every string a class-building call is given", () => {
    const source = `<div className={cn("flex", open && "bg-surface", { "text-accent": on })} />`;

    expect(bases(source)).toEqual(["bg-surface", "flex", "text-accent"]);
  });

  it("reads a class map that never touches a className literal", () => {
    // The shape Studio's primitives use: the utility only reaches markup
    // through a lookup, so an attribute-only reader would miss it entirely.
    const source = `const sizeStyles: Record<ButtonSize, string> = {
      sm: "h-7 px-2.5 rounded-button",
    };`;

    expect(bases(source)).toEqual(["h-7", "px-2.5", "rounded-button"]);
  });

  it("reads a class map whose name says nothing about classes", () => {
    // The defect this replaced: candidate-ness was decided by the binding's
    // name, so the same classes were gated in `sizeStyles` and invisible in
    // `buttonSizes`. What makes them classes is where they are used.
    const source = `const fooSizes = { md: "h-ctl rounded-hologram" };
      const Foo = ({ size }) => <span className={cn(fooSizes[size])} />;`;

    expect(bases(source)).toEqual(["h-ctl", "rounded-hologram"]);
  });

  it("follows an identifier that contains a dollar sign", () => {
    const source = `const $cls = "flex-none";\nconst a = <div className={$cls} />;`;

    expect(bases(source)).toEqual(["flex-none"]);
  });

  it("does not read a lookup key's default value as a class", () => {
    // `variant` is the key, not the class list, so the default it falls back
    // to is a map entry name and never reaches markup.
    const source = `const map = { ghost: "bg-transparent" };
      const Foo = ({ variant = "ghost" }) => <span className={map[variant]} />;`;

    expect(bases(source)).toEqual(["bg-transparent"]);
  });

  it("leaves a lookup table alone when nothing uses it as a class", () => {
    const source = `const labels = { md: "Medium size" };
      const Foo = () => <span title={labels.md} />;`;

    expect(bases(source)).toEqual([]);
  });

  it("drops the template chunk that touches an interpolation", () => {
    expect(bases("<div className={`w-${i} flex`} />")).toEqual(["flex"]);
  });

  it("keeps a chunk that whitespace separates from the interpolation", () => {
    expect(bases("<div className={`${base} flex `} />")).toEqual(["flex"]);
  });

  it("strips variant prefixes, including bracketed ones", () => {
    const source = `<div className="hover:bg-surface/50 md:group-data-[open]:text-accent" />`;

    expect(bases(source)).toEqual(["bg-surface/50", "text-accent"]);
  });

  it("flags bracketed arbitrary values so the sweep can count them", () => {
    const found = extractClassCandidates(`<div className="text-[11px] text-center" />`);

    expect(found.filter((candidate) => candidate.arbitrary).map((c) => c.raw)).toEqual([
      "text-[11px]",
    ]);
  });

  it("ignores strings that are not class lists", () => {
    const source = `const styles = getComputedStyle(el);
      const label = "Export video";
      log("failed to open the project file");`;

    expect(bases(source)).toEqual([]);
  });

  it("does not read past the end of a class region", () => {
    const source = `<div className="flex" title="Export video" />`;

    expect(bases(source)).toEqual(["flex"]);
  });

  it("survives an unterminated region without hanging", () => {
    expect(bases(`<div className={cn("flex",`)).toEqual(["flex"]);
  });
});
