import { describe, expect, it } from "vitest";
import {
  applyPatch,
  applyPatchByTarget,
  readAttributeByTarget,
  readTagAttribute,
  readTagSnippetByTarget,
  type PatchOperation,
} from "./sourcePatcher";

describe("applyPatchByTarget", () => {
  it("removes all duplicate boolean attributes so unmuting cannot reveal another", () => {
    expect(
      applyPatch(`<video id="clip" muted muted></video>`, "clip", {
        type: "html-attribute",
        property: "muted",
        value: null,
      }),
    ).toBe(`<video id="clip"></video>`);
  });

  it("locates Unicode custom tags and respects the first duplicate attribute", () => {
    const html = `<my-élement id="real" id="other" data-duration="1"></my-élement>`;
    const op: PatchOperation = { type: "attribute", property: "duration", value: "2" };
    expect(applyPatch(html, "real", op)).toContain('data-duration="2"');
    expect(applyPatch(html, "other", op)).toBe(html);
  });

  it("reads and patches only the real source outside quoted attribute content", () => {
    const html = `<video id="hero" title="example src='other.mp4'" data-src="lazy.mp4" src="assets/it's.mp4"></video>`;
    expect(readTagAttribute(html, "src")).toBe("assets/it's.mp4");
    const op: PatchOperation = { type: "html-attribute", property: "src", value: "new.mp4" };
    const expected = `<video id="hero" title="example src='other.mp4'" data-src="lazy.mp4" src="new.mp4"></video>`;
    expect(applyPatch(html, "hero", op)).toBe(expected);
    expect(applyPatchByTarget(html, { id: "hero" }, op)).toBe(expected);
  });

  it("does not locate a target through a prefixed or quoted id", () => {
    const html = `<video data-id="hero" title="id='hero'" src="other.mp4"></video><video id="hero" src="real.mp4"></video>`;
    expect(readTagSnippetByTarget(html, { id: "hero" })).toContain('src="real.mp4"');
  });

  it.each(['"', "'"])("patches long and multiline styles quoted with %s", (quote) => {
    const otherQuote = quote === '"' ? "'" : '"';
    const op: PatchOperation = { type: "inline-style", property: "opacity", value: "0.5" };
    for (const value of [
      "",
      "line1\nline2",
      "a".repeat(100_000),
      `style=${otherQuote}a`.repeat(10_000),
    ]) {
      const html = `<img id="hero" class="hero" style=${quote}--label:${value}${quote} />`;
      const expected = `<img id="hero" class="hero" style=${quote}--label: ${value}; opacity: 0.5${quote} />`;
      expect(applyPatch(html, "hero", op)).toBe(expected);
      expect(applyPatchByTarget(html, { selector: ".hero" }, op)).toBe(expected);
    }
  });

  it("updates a composition host by data-composition-id selector", () => {
    const html = `<div data-composition-id="intro" data-start="0" data-track-index="1"></div>`;
    const op: PatchOperation = { type: "attribute", property: "start", value: "2.5" };

    expect(applyPatchByTarget(html, { selector: '[data-composition-id="intro"]' }, op)).toContain(
      'data-start="2.5"',
    );
  });

  it("updates a class-based layer when the clip has no DOM id", () => {
    const html = `<div class="headline clip" data-start="0" data-track-index="1"></div>`;
    const op: PatchOperation = { type: "attribute", property: "track-index", value: "3" };

    expect(applyPatchByTarget(html, { selector: ".headline" }, op)).toContain(
      'data-track-index="3"',
    );
  });

  it("removes a boolean data attribute by selector", () => {
    const html = `<div class="headline clip" data-start="0" data-hidden></div>`;
    const op: PatchOperation = { type: "attribute", property: "hidden", value: null };

    expect(applyPatchByTarget(html, { selector: ".headline" }, op)).toBe(
      `<div class="headline clip" data-start="0"></div>`,
    );
  });

  it("updates inline z-index by selector when the clip has no DOM id", () => {
    const html = `<div class="headline clip" style="position: absolute; opacity: 1" data-start="0"></div>`;
    const op: PatchOperation = { type: "inline-style", property: "z-index", value: "3" };

    expect(applyPatchByTarget(html, { selector: ".headline" }, op)).toContain(
      'style="position: absolute; opacity: 1; z-index: 3"',
    );
  });

  it("adds inline style to a self-closing void element without malforming it", () => {
    const html = `<img id="gif-img" class="clip" data-start="1" src="earth.gif" alt="earth" />`;
    const op: PatchOperation = { type: "inline-style", property: "z-index", value: "3" };

    const result = applyPatch(html, "gif-img", op);
    expect(result).toBe(
      `<img id="gif-img" class="clip" data-start="1" src="earth.gif" alt="earth" style="z-index: 3" />`,
    );
    expect(result).not.toContain("/ style");
  });

  it("adds inline style to a self-closing void element matched by selector", () => {
    const html = `<img class="clip hero" data-start="0" src="bg.png" alt="" />`;
    const op: PatchOperation = { type: "inline-style", property: "opacity", value: "0.5" };

    const result = applyPatchByTarget(html, { selector: ".hero" }, op);
    expect(result).toBe(
      `<img class="clip hero" data-start="0" src="bg.png" alt="" style="opacity: 0.5" />`,
    );
    expect(result).not.toContain("/ style");
  });

  it.each(["", " ", "\t\r\n", "\u00a0\u2028", " ".repeat(100_000)])(
    "preserves self-closing whitespace handling (case %#)",
    (whitespace) => {
      const prefix = '<img id="hero" class="hero"';
      const op: PatchOperation = { type: "inline-style", property: "opacity", value: "0.5" };
      for (const suffix of ["/", "/\n", "/\r", "/\r\n", "/\u2028", "", "x", "/ "]) {
        const tag = prefix + whitespace + suffix;
        const selfClosing = suffix === "/";
        // The original operation removes whitespace before the slash only.
        const expectedBase = selfClosing ? prefix + suffix.slice(1) : tag;
        const expected = `${expectedBase} style="opacity: 0.5"${selfClosing ? " /" : ""}>`;
        expect(applyPatch(tag + ">", "hero", op)).toBe(expected);
        expect(applyPatchByTarget(tag + ">", { selector: ".hero" }, op)).toBe(expected);
      }
    },
  );

  it("patches inline move styles by target", () => {
    const html = `<div id="card" style="position: absolute; left: 108px; top: 112px"></div>`;

    const withLeft = applyPatchByTarget(
      html,
      { id: "card" },
      { type: "inline-style", property: "left", value: "160px" },
    );
    const withTop = applyPatchByTarget(
      withLeft,
      { id: "card" },
      { type: "inline-style", property: "top", value: "140px" },
    );

    expect(withTop).toContain('style="position: absolute; left: 160px; top: 140px"');
  });

  it("patches inline resize styles by target", () => {
    const html = `<div id="card" style="position: absolute; width: 380px; height: 196px"></div>`;

    const withWidth = applyPatchByTarget(
      html,
      { id: "card" },
      { type: "inline-style", property: "width", value: "420px" },
    );
    const withHeight = applyPatchByTarget(
      withWidth,
      { id: "card" },
      { type: "inline-style", property: "height", value: "220px" },
    );

    expect(withHeight).toContain('style="position: absolute; width: 420px; height: 220px"');
  });

  it("escapes quoted CSS urls inside double-quoted style attributes", () => {
    const html = `<div id="card" style="position: absolute; opacity: 1"></div>`;

    const withBackground = applyPatchByTarget(
      html,
      { id: "card" },
      {
        type: "inline-style",
        property: "background-image",
        value: `url("../ChatGPT Image Apr 22, 2026.png")`,
      },
    );
    const withRadius = applyPatchByTarget(
      withBackground,
      { id: "card" },
      { type: "inline-style", property: "border-radius", value: "12px" },
    );

    expect(withRadius).toContain(
      "background-image: url(&quot;../ChatGPT Image Apr 22, 2026.png&quot;)",
    );
    expect(withRadius).toContain("border-radius: 12px");
  });

  it("updates media timing attributes by selector", () => {
    const html = `<video class="hero clip" data-start="0.2" data-duration="1.4" data-media-start="0.4"></video>`;

    const withDuration = applyPatchByTarget(
      html,
      { selector: ".hero" },
      {
        type: "attribute",
        property: "duration",
        value: "1.1",
      },
    );
    const withMediaStart = applyPatchByTarget(
      withDuration,
      { selector: ".hero" },
      {
        type: "attribute",
        property: "media-start",
        value: "0.7",
      },
    );

    expect(withMediaStart).toContain('data-duration="1.1"');
    expect(withMediaStart).toContain('data-media-start="0.7"');
  });

  it("reads media timing attributes by selector", () => {
    const html = `<div class="hero clip" data-start="0.2" data-duration="1.4" data-media-start="0.4"></div>`;

    expect(readAttributeByTarget(html, { selector: ".hero" }, "media-start")).toBe("0.4");
    expect(readAttributeByTarget(html, { selector: ".hero" }, "duration")).toBe("1.4");
  });

  it("reads the matched tag snippet by target", () => {
    const html = `<section id="hero" class="card clip" style="left: 120px; top: 180px"></section>`;

    expect(readTagSnippetByTarget(html, { id: "hero" })).toBe(
      `<section id="hero" class="card clip" style="left: 120px; top: 180px"`,
    );
  });

  it("patches and reads single-quoted attributes and styles", () => {
    const html =
      "<section id='hero' class='card clip' data-start='0.2' style='left: 120px; top: 180px'></section>";

    const moved = applyPatchByTarget(
      html,
      { id: "hero" },
      { type: "inline-style", property: "left", value: "160px" },
    );
    const updated = applyPatchByTarget(
      moved,
      { id: "hero" },
      { type: "attribute", property: "start", value: "0.4" },
    );

    expect(updated).toContain(`style='left: 160px; top: 180px'`);
    expect(updated).toContain(`data-start="0.4"`);
    expect(readAttributeByTarget(updated, { id: "hero" }, "start")).toBe("0.4");
  });

  it("replaces the full text body of a nested element by id", () => {
    const html =
      '<div id="panel"><strong>Headline</strong><span>Supporting copy</span></div><p>Outside</p>';

    const patched = applyPatch(html, "panel", {
      type: "text-content",
      property: "text",
      value: "<strong>New headline</strong><span>New supporting copy</span>",
    });

    expect(patched).toContain(
      '<div id="panel"><strong>New headline</strong><span>New supporting copy</span></div>',
    );
    expect(patched).toContain("<p>Outside</p>");
  });

  it("does not stop at the first child closing tag when patching nested text", () => {
    const html =
      '<section id="card"><div><strong>Headline</strong></div><div>Copy</div></section><p>Outside</p>';

    const patched = applyPatchByTarget(
      html,
      { id: "card" },
      {
        type: "text-content",
        property: "text",
        value: "<strong>New headline</strong>",
      },
    );

    expect(patched).toBe(
      '<section id="card"><strong>New headline</strong></section><p>Outside</p>',
    );
  });

  it("patches the correct duplicate selector occurrence", () => {
    const html = [
      `<div class="headline clip" data-start="0"></div>`,
      `<div class="headline clip" data-start="1"></div>`,
    ].join("");

    const patched = applyPatchByTarget(
      html,
      { selector: ".headline", selectorIndex: 1 },
      {
        type: "attribute",
        property: "start",
        value: "2.5",
      },
    );

    expect(patched).toContain(`<div class="headline clip" data-start="0"></div>`);
    expect(patched).toContain(`<div class="headline clip" data-start="2.5"></div>`);
  });

  it("escapes JSON attribute values containing double-quotes and round-trips them", () => {
    const html = `<div id="card" data-start="0"></div>`;
    const motionJson = JSON.stringify({ preset: "fadeIn", start: 0, duration: 1.5 });

    const patched = applyPatch(html, "card", {
      type: "attribute",
      property: "data-hf-studio-motion",
      value: motionJson,
    });

    // The raw HTML must NOT contain unescaped quotes inside the attribute
    expect(patched).not.toMatch(/data-hf-studio-motion="[^"]*"[^"]*"/);
    // Entities should be present
    expect(patched).toContain("&quot;");

    // Reading the attribute back should return the original JSON
    const readBack = readAttributeByTarget(patched, { id: "card" }, "data-hf-studio-motion");
    expect(readBack).toBe(motionJson);
  });

  it("escapes and round-trips data-hf-studio-motion-original-transform with quotes", () => {
    const html = `<div id="hero" data-start="0"></div>`;
    const transform = `rotate(15deg) translate("50px", "100px")`;

    const patched = applyPatchByTarget(
      html,
      { id: "hero" },
      {
        type: "attribute",
        property: "data-hf-studio-motion-original-transform",
        value: transform,
      },
    );

    // No broken attribute boundary
    expect(patched).not.toMatch(/data-hf-studio-motion-original-transform="[^"]*"[^"]*"/);

    const readBack = readAttributeByTarget(
      patched,
      { id: "hero" },
      "data-hf-studio-motion-original-transform",
    );
    expect(readBack).toBe(transform);
  });

  it("escapes ampersands and angle brackets in attribute values", () => {
    const html = `<div id="el" data-start="0"></div>`;
    const value = `a&b<c>d"e`;

    const patched = applyPatch(html, "el", {
      type: "attribute",
      property: "data-custom",
      value,
    });

    expect(patched).toContain("a&amp;b&lt;c&gt;d&quot;e");

    const readBack = readAttributeByTarget(patched, { id: "el" }, "data-custom");
    expect(readBack).toBe(value);
  });

  it("updates an already-escaped attribute value to a new escaped value", () => {
    const html = `<div id="card" data-start="0"></div>`;
    const first = JSON.stringify({ preset: "fadeIn" });
    const second = JSON.stringify({ preset: "slideUp", easing: "ease-out" });

    const patched1 = applyPatch(html, "card", {
      type: "attribute",
      property: "data-hf-studio-motion",
      value: first,
    });
    const patched2 = applyPatch(patched1, "card", {
      type: "attribute",
      property: "data-hf-studio-motion",
      value: second,
    });

    const readBack = readAttributeByTarget(patched2, { id: "card" }, "data-hf-studio-motion");
    expect(readBack).toBe(second);
  });
});

describe("motion attribute round-trip via sourcePatcher", () => {
  it("round-trips data-hf-studio-motion JSON through patch and read", () => {
    const html = `<div id="hero" style="position: absolute">Hero</div>`;
    const motion = {
      start: 0.5,
      duration: 1,
      ease: "power3.out",
      from: { opacity: 0, y: 40 },
      to: { opacity: 1, y: 0 },
    };
    const motionJson = JSON.stringify(motion);

    const patched = applyPatchByTarget(
      html,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion", value: motionJson },
    );

    const readBack = readAttributeByTarget(patched, { id: "hero" }, "data-hf-studio-motion");
    expect(readBack).toBeDefined();
    expect(JSON.parse(readBack!)).toEqual(motion);
  });

  it("round-trips motion with customEase containing SVG path data", () => {
    const html = `<div id="card" class="clip" data-start="0" data-duration="10">Card</div>`;
    const motion = {
      start: 0.25,
      duration: 0.8,
      ease: "studio-card-bounce",
      customEase: { id: "studio-card-bounce", data: "M0,0 C0.18,0.9 0.32,1 1,1" },
      from: { y: 44, autoAlpha: 0 },
      to: { y: 0, autoAlpha: 1 },
    };
    const motionJson = JSON.stringify(motion);

    const patched = applyPatchByTarget(
      html,
      { id: "card" },
      { type: "attribute", property: "data-hf-studio-motion", value: motionJson },
    );

    const readBack = readAttributeByTarget(patched, { id: "card" }, "data-hf-studio-motion");
    expect(readBack).toBeDefined();
    expect(JSON.parse(readBack!)).toEqual(motion);
  });

  it("round-trips all four motion attributes (motion + three originals)", () => {
    const html = `<div id="hero" style="transform: rotate(5deg); opacity: 0.8; visibility: visible">Hero</div>`;
    const motion = {
      start: 0,
      duration: 0.6,
      ease: "power2.out",
      from: { autoAlpha: 0, y: 32 },
      // fallow-ignore-next-line code-duplication
      to: { autoAlpha: 1, y: 0 },
    };

    let result = html;
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion", value: JSON.stringify(motion) },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      {
        type: "attribute",
        property: "data-hf-studio-motion-original-transform",
        value: "rotate(5deg)",
      },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion-original-opacity", value: "0.8" },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      {
        type: "attribute",
        property: "data-hf-studio-motion-original-visibility",
        value: "visible",
      },
    );

    expect(
      JSON.parse(readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion")!),
    ).toEqual(motion);
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-transform"),
    ).toBe("rotate(5deg)");
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-opacity"),
    ).toBe("0.8");
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-visibility"),
    ).toBe("visible");
  });

  it("removes all four motion attributes when clearing", () => {
    const html = `<div id="hero" style="position: absolute">Hero</div>`;
    const motion = {
      start: 0,
      duration: 1,
      ease: "none",
      from: { opacity: 0 },
      // fallow-ignore-next-line code-duplication
      to: { opacity: 1 },
    };

    let result = html;
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion", value: JSON.stringify(motion) },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion-original-transform", value: "" },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion-original-opacity", value: "1" },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion-original-visibility", value: "" },
    );

    // Verify all four attributes exist
    expect(readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion")).toBeDefined();
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-transform"),
    ).toBeDefined();
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-opacity"),
    ).toBeDefined();
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-visibility"),
    ).toBeDefined();

    // Remove all four
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion", value: null },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion-original-transform", value: null },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion-original-opacity", value: null },
    );
    result = applyPatchByTarget(
      result,
      { id: "hero" },
      { type: "attribute", property: "data-hf-studio-motion-original-visibility", value: null },
    );

    expect(readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion")).toBeUndefined();
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-transform"),
    ).toBeUndefined();
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-opacity"),
    ).toBeUndefined();
    expect(
      readAttributeByTarget(result, { id: "hero" }, "data-hf-studio-motion-original-visibility"),
    ).toBeUndefined();
  });

  it("round-trips motion via selector when element has no id", () => {
    const html = `<div class="headline clip" style="position: absolute">Title</div>`;
    const motion = {
      start: 0.3,
      duration: 0.5,
      ease: "sine.out",
      from: { scale: 0.88, autoAlpha: 0 },
      to: { scale: 1, autoAlpha: 1 },
    };

    const patched = applyPatchByTarget(
      html,
      { selector: ".headline" },
      { type: "attribute", property: "data-hf-studio-motion", value: JSON.stringify(motion) },
    );

    const readBack = readAttributeByTarget(
      patched,
      { selector: ".headline" },
      "data-hf-studio-motion",
    );
    expect(readBack).toBeDefined();
    expect(JSON.parse(readBack!)).toEqual(motion);
  });
});

// T3 — id-based targeting (R1).
describe("T3 — hfId targeting (spec for R1)", () => {
  it("updates inline style by data-hf-id", () => {
    const html = `<h1 data-hf-id="hf-x7k2" style="color: red">Hello</h1>`;
    const result = applyPatchByTarget(
      html,
      { hfId: "hf-x7k2" },
      {
        type: "inline-style",
        property: "color",
        value: "blue",
      },
    );
    expect(result).toContain("color: blue");
    expect(result).toContain('data-hf-id="hf-x7k2"');
  });

  it("updates text content by data-hf-id", () => {
    const html = `<p data-hf-id="hf-a1b2">Old text</p>`;
    const result = applyPatchByTarget(
      html,
      { hfId: "hf-a1b2" },
      {
        type: "text-content",
        property: "",
        value: "New text",
      },
    );
    expect(result).toContain(">New text<");
  });

  it("updates attribute by data-hf-id", () => {
    const html = `<div data-hf-id="hf-c3d4" data-start="0"></div>`;
    const result = applyPatchByTarget(
      html,
      { hfId: "hf-c3d4" },
      {
        type: "attribute",
        property: "start",
        value: "2.5",
      },
    );
    expect(result).toContain('data-start="2.5"');
  });

  it("data-hf-id attribute is preserved after a style patch", () => {
    const html = `<h1 data-hf-id="hf-x7k2" style="color: red">Hello</h1>`;
    const patched = applyPatchByTarget(
      html,
      { hfId: "hf-x7k2" },
      {
        type: "inline-style",
        property: "color",
        value: "blue",
      },
    );
    expect(readAttributeByTarget(patched, { hfId: "hf-x7k2" }, "data-hf-id")).toBe("hf-x7k2");
  });

  it("hfId lookup falls through to selector when hfId not found", () => {
    const html = `<h1 class="headline" style="color: red">Hello</h1>`;
    const result = applyPatchByTarget(
      html,
      { hfId: "hf-missing", selector: ".headline" },
      { type: "inline-style", property: "color", value: "blue" },
    );
    expect(result).toContain("color: blue");
  });

  it("hfId match is authoritative — selector is not used as a narrowing filter", () => {
    // hfId matches h1; selector points at h2. hfId wins — patch lands on h1, h2 untouched.
    const html = `<h1 data-hf-id="hf-x7k2" class="a">A</h1><h2 class="b">B</h2>`;
    const result = applyPatchByTarget(
      html,
      { hfId: "hf-x7k2", selector: ".b" },
      { type: "inline-style", property: "color", value: "blue" },
    );
    expect(result).toContain('data-hf-id="hf-x7k2"');
    const h1End = result.indexOf("</h1>");
    const bluePos = result.indexOf("color: blue");
    expect(bluePos).toBeGreaterThan(-1);
    expect(bluePos).toBeLessThan(h1End);
    expect(result).toContain('<h2 class="b">B</h2>');
  });
});

describe("file names with special characters", () => {
  const src = (value: string): PatchOperation => ({
    type: "html-attribute",
    property: "src",
    value,
  });

  it("replaces a double-quoted value that holds an apostrophe instead of adding a second one", () => {
    expect(applyPatch(`<img id="a" src="assets/it's.png">`, "a", src("assets/b.png"))).toBe(
      `<img id="a" src="assets/b.png">`,
    );
    expect(applyPatch(`<img id="a" src='assets/say "hi".png'>`, "a", src("b.png"))).toBe(
      `<img id="a" src="b.png">`,
    );
  });

  it("writes $ sequences in a value literally", () => {
    expect(applyPatch(`<img id="a" src="old.png">`, "a", src("assets/$100 bill.png"))).toBe(
      `<img id="a" src="assets/$100 bill.png">`,
    );
    expect(applyPatch(`<img id="a">`, "a", src("$&$1.png"))).toBe(
      `<img id="a" src="$&amp;$1.png">`,
    );
    expect(
      applyPatch(`<div id="a" data-src="old">`, "a", {
        type: "attribute",
        property: "src",
        value: "$' and $`",
      }),
    ).toBe(`<div id="a" data-src="$' and $\`">`);
  });

  it("reads a data attribute whose value holds the other quote kind", () => {
    expect(readAttributeByTarget(`<div id="a" data-title="it's here">`, { id: "a" }, "title")).toBe(
      "it's here",
    );
  });
});

describe("readTagAttribute", () => {
  it("reads both quote kinds and decodes entities without losing the other quote", () => {
    expect(readTagAttribute(`<video src="assets/it's&amp;ours.mp4">`, "src")).toBe(
      "assets/it's&ours.mp4",
    );
    expect(readTagAttribute(`<video src='assets/say "hi".mp4'>`, "src")).toBe(
      'assets/say "hi".mp4',
    );
  });

  it("distinguishes an empty attribute from a missing attribute", () => {
    expect(readTagAttribute('<video src="">', "src")).toBe("");
    expect(readTagAttribute("<video>", "src")).toBeUndefined();
  });
});

describe("whole attribute names", () => {
  it.each(["data-src", "x-src", "xml:src", "srcset"])(
    "reads and edits src without matching %s",
    (other) => {
      const tag = `<img id="a" ${other}="assets/other.png" src="assets/original.png">`;
      expect(readTagAttribute(tag, "src")).toBe("assets/original.png");
      for (const patch of [
        (op: PatchOperation) => applyPatch(tag, "a", op),
        (op: PatchOperation) => applyPatchByTarget(tag, { id: "a" }, op),
      ]) {
        expect(patch({ type: "html-attribute", property: "src", value: "assets/new.png" })).toBe(
          `<img id="a" ${other}="assets/other.png" src="assets/new.png">`,
        );
        expect(patch({ type: "html-attribute", property: "src", value: null })).toBe(
          `<img id="a" ${other}="assets/other.png">`,
        );
      }
      expect(readTagAttribute(`<img ${other}="assets/other.png">`, "src")).toBeUndefined();
    },
  );

  it("does not treat a longer data attribute as a boolean attribute to remove", () => {
    const tag = '<div id="a" data-title-long="keep">';
    expect(
      applyPatchByTarget(tag, { id: "a" }, { type: "attribute", property: "title", value: null }),
    ).toBe(tag);
  });
});

it("removes a boolean attribute without truncating a longer attribute name", () => {
  const tag = '<video id="a" muted-long="keep" muted>';
  expect(
    applyPatchByTarget(
      tag,
      { id: "a" },
      { type: "html-attribute", property: "muted", value: null },
    ),
  ).toBe('<video id="a" muted-long="keep">');
});

it("decodes an authored apostrophe entity once", () => {
  expect(readTagAttribute("<video src='assets/it&apos;s.mp4'>", "src")).toBe("assets/it's.mp4");
  expect(readTagAttribute("<video src='assets/it&#39;s.mp4'>", "src")).toBe("assets/it's.mp4");
  expect(readTagAttribute('<video src="assets/it&amp;apos;s.mp4">', "src")).toBe(
    "assets/it&apos;s.mp4",
  );
});
