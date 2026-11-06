// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import {
  extendRootDurationInSource,
  patchRootCompositionDuration,
  readRootCompositionDuration,
} from "./rootDuration";

describe("extendRootDurationInSource", () => {
  it("extends data-duration when the new end is bigger than the root duration", () => {
    const source = [
      `<div data-composition-id="main" data-duration="4">`,
      `  <section id="clip" data-start="2" data-duration="3"></section>`,
      `</div>`,
    ].join("\n");

    expect(extendRootDurationInSource(source, 5.25)).toContain(
      `data-composition-id="main" data-duration="5.25"`,
    );
  });

  it("does nothing when the new end is smaller than or equal to the root duration", () => {
    const source = `<div data-composition-id="main" data-duration="6"></div>`;

    expect(extendRootDurationInSource(source, 5)).toBe(source);
    expect(extendRootDurationInSource(source, 6)).toBe(source);
  });

  it("leaves non-root data-duration attributes untouched by the extension", () => {
    const source = [
      `<div data-duration="3"></div>`,
      `<div data-composition-id="main" data-duration="4"></div>`,
    ].join("\n");
    const patched = extendRootDurationInSource(source, 7);

    expect(patched).toContain(`<div data-duration="3"></div>`);
    expect(patched).toContain(`<div data-composition-id="main" data-duration="7"></div>`);
  });

  // Reviewer round-2 finding #3: the old regex was attribute-ORDER-dependent and
  // double-quotes-only, so these hand-authored variants silently no-op'd.
  it("extends when data-duration is declared BEFORE data-composition-id", () => {
    const source = `<div data-duration="4" data-composition-id="main"></div>`;
    expect(extendRootDurationInSource(source, 9)).toBe(
      `<div data-duration="9" data-composition-id="main"></div>`,
    );
  });

  it("extends when attributes use single quotes", () => {
    const source = `<div data-composition-id='main' data-duration='4'></div>`;
    expect(extendRootDurationInSource(source, 9)).toBe(
      `<div data-composition-id='main' data-duration='9'></div>`,
    );
  });

  it("extends with swapped order AND single quotes AND extra whitespace", () => {
    const source = `<div  data-duration = '4'  data-composition-id = 'main' >x</div>`;
    expect(extendRootDurationInSource(source, 9)).toBe(
      `<div  data-duration = '9'  data-composition-id = 'main' >x</div>`,
    );
  });
});

describe("readRootCompositionDuration", () => {
  it("reads the root duration regardless of attribute order or quote style", () => {
    expect(
      readRootCompositionDuration(`<div data-composition-id="main" data-duration="4"></div>`),
    ).toBe(4);
    expect(
      readRootCompositionDuration(`<div data-duration="4" data-composition-id="main"></div>`),
    ).toBe(4);
    expect(
      readRootCompositionDuration(`<div data-composition-id='main' data-duration='4.5'></div>`),
    ).toBe(4.5);
  });

  it("reads the FIRST composition when several are present", () => {
    const source = [
      `<div data-composition-id="root" data-duration="10"></div>`,
      `<div data-composition-id="nested" data-duration="2"></div>`,
    ].join("\n");
    expect(readRootCompositionDuration(source)).toBe(10);
  });

  it("returns null when there is no composition root", () => {
    expect(readRootCompositionDuration(`<div data-duration="4"></div>`)).toBeNull();
  });

  it("returns null when the root has no data-duration attribute", () => {
    expect(readRootCompositionDuration(`<div data-composition-id="main"></div>`)).toBeNull();
  });
});

describe("patchRootCompositionDuration", () => {
  it("rewrites only the root's data-duration value, preserving surrounding bytes", () => {
    const source = [
      `<!doctype html>`,
      `<div data-composition-id="main" data-duration="4" data-width="640">`,
      `  <img src="a.png" data-duration="3" />`,
      `</div>`,
    ].join("\n");
    const patched = patchRootCompositionDuration(source, "8");
    expect(patched).toBe(
      [
        `<!doctype html>`,
        `<div data-composition-id="main" data-duration="8" data-width="640">`,
        `  <img src="a.png" data-duration="3" />`,
        `</div>`,
      ].join("\n"),
    );
  });

  it("keeps single-quote style when rewriting", () => {
    expect(
      patchRootCompositionDuration(`<div data-composition-id='main' data-duration='4'></div>`, "8"),
    ).toBe(`<div data-composition-id='main' data-duration='8'></div>`);
  });

  it("is a no-op when the root has no data-duration attribute", () => {
    const source = `<div data-composition-id="main"></div>`;
    expect(patchRootCompositionDuration(source, "8")).toBe(source);
  });
});
