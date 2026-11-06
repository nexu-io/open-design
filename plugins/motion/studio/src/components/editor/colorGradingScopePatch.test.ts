import { describe, expect, it } from "vitest";
import { patchMediaColorGradingInHtml } from "./colorGradingScopePatch";

describe("patchMediaColorGradingInHtml", () => {
  it.each(['"', "'"])("replaces and removes long grading values quoted with %s", (quote) => {
    const otherQuote = quote === '"' ? "'" : '"';
    for (const value of [
      "",
      "line1\nline2",
      "a".repeat(100_000),
      `data-color-grading=${otherQuote}a`.repeat(10_000),
    ]) {
      const html = `<img alt="kept"\tDATA-COLOR-GRADING=${quote}${value}${quote} />`;
      expect(patchMediaColorGradingInHtml(html, "new")).toEqual({
        html: '<img alt="kept" data-color-grading="new" />',
        count: 1,
      });
      expect(patchMediaColorGradingInHtml(html, null)).toEqual({
        html: '<img alt="kept" />',
        count: 1,
      });
    }
  });

  it("adds color grading to video and image tags only", () => {
    const { html, count } = patchMediaColorGradingInHtml(
      `<div><video id="v"></video><img id="i" /><audio id="a"></audio></div>`,
      `{"preset":"clean-studio"}`,
    );

    expect(count).toBe(2);
    expect(html).toContain(
      `video id="v" data-color-grading="{&quot;preset&quot;:&quot;clean-studio&quot;}"`,
    );
    expect(html).toContain(
      `img id="i" data-color-grading="{&quot;preset&quot;:&quot;clean-studio&quot;}"`,
    );
    expect(html).toContain(`<audio id="a"></audio>`);
  });

  it("replaces existing color grading without touching other attributes", () => {
    const { html, count } = patchMediaColorGradingInHtml(
      `<video muted data-color-grading='old' playsinline></video>`,
      `{"adjust":{"exposure":0.2}}`,
    );

    expect(count).toBe(1);
    expect(html).toBe(
      `<video muted data-color-grading="{&quot;adjust&quot;:{&quot;exposure&quot;:0.2}}" playsinline></video>`,
    );
  });

  it("keeps quoted greater-than characters inside media attributes", () => {
    const { html, count } = patchMediaColorGradingInHtml(
      `<img alt="before > after" src="photo.jpg">`,
      `{"adjust":{"contrast":0.1}}`,
    );

    expect(count).toBe(1);
    expect(html).toBe(
      `<img alt="before > after" src="photo.jpg" data-color-grading="{&quot;adjust&quot;:{&quot;contrast&quot;:0.1}}">`,
    );
  });

  it("removes color grading when value is empty", () => {
    const { html, count } = patchMediaColorGradingInHtml(
      `<video data-color-grading="old"></video><img alt="">`,
      null,
    );

    expect(count).toBe(1);
    expect(html).toBe(`<video></video><img alt="">`);
  });

  it("does not patch media-looking text inside scripts, styles, or comments", () => {
    const { html, count } = patchMediaColorGradingInHtml(
      [
        `<script>const tpl = '<video id="script-video"></video>';</script>`,
        `<style>.icon::before { content: "<img>"; }</style>`,
        `<!-- <img id="commented"> -->`,
        `<video id="real"></video>`,
      ].join(""),
      `{"preset":"clean-studio"}`,
    );

    expect(count).toBe(1);
    expect(html).toContain(`<script>const tpl = '<video id="script-video"></video>';</script>`);
    expect(html).toContain(`<style>.icon::before { content: "<img>"; }</style>`);
    expect(html).toContain(`<!-- <img id="commented"> -->`);
    expect(html).toContain(
      `<video id="real" data-color-grading="{&quot;preset&quot;:&quot;clean-studio&quot;}"></video>`,
    );
  });
});
