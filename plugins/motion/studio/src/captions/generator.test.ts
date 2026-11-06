// @vitest-environment node
import { describe, it, expect } from "vitest";
import { Window } from "happy-dom";
import { generateCaptionHtml } from "./generator";
import { buildCaptionModel, TranscriptWord } from "./parser";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const SAMPLE_TRANSCRIPT: TranscriptWord[] = [
  { text: "We", start: 0.1, end: 0.3 },
  { text: "asked", start: 0.4, end: 0.6 },
  { text: "what", start: 0.7, end: 0.9 },
  { text: "you", start: 1.0, end: 1.2 },
  { text: "needed.", start: 1.3, end: 1.8 },
  { text: "Forty-seven", start: 1.9, end: 2.3 },
  { text: "percent", start: 2.4, end: 2.7 },
];

function buildTestModel(wordsPerGroup = 5) {
  return buildCaptionModel(SAMPLE_TRANSCRIPT, {
    width: 1920,
    height: 1080,
    duration: 16,
    wordsPerGroup,
  });
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("generateCaptionHtml", () => {
  it("keeps script-closing text and word IDs as data when HTML is parsed", () => {
    const text = '</ScRiPt><img src=x onerror="alert(1)"><!-- <script> & end';
    const id = '</script><svg onload="alert(2)">';
    const model = buildCaptionModel([{ text, id, start: 0, end: 1 }], {
      width: 1920,
      height: 1080,
      duration: 2,
      wordsPerGroup: 5,
    });
    const window = new Window();
    const template = window.document.createElement("template");
    template.innerHTML = generateCaptionHtml(model);
    const nested = template.content.querySelector("template");
    expect(nested).not.toBeNull();
    const content = nested!.content;
    expect(content.querySelector("img, svg")).toBeNull();
    const scripts = content.querySelectorAll("script");
    expect(scripts).toHaveLength(1);
    const script = scripts[0].textContent;
    const transcript = script.match(/const TRANSCRIPT = ([\s\S]*?);/);
    expect(transcript).not.toBeNull();
    expect(JSON.parse(transcript![1])).toEqual([{ text, id, start: 0, end: 1 }]);
    const wordText = script.match(/\.textContent = (.*);/);
    const wordId = script.match(/\.id = (.*);/);
    expect(JSON.parse(wordText![1])).toBe(text);
    expect(JSON.parse(wordId![1])).toBe(id);
    window.close();
  });

  describe("HTML structure", () => {
    it("wraps output in a <template id='captions-template'>", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain('<template id="captions-template">');
      expect(html).toContain("</template>");
    });

    it("includes correct data-composition-id, data-width, data-height, data-duration attributes", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain('data-composition-id="captions"');
      expect(html).toContain('data-width="1920"');
      expect(html).toContain('data-height="1080"');
      expect(html).toContain('data-duration="16"');
    });

    it("includes the captions-container div", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain('<div id="captions-container"></div>');
    });

    it("includes a <style> block", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("<style>");
      expect(html).toContain("</style>");
    });

    it("includes a <script> block", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("<script>");
      expect(html).toContain("</script>");
    });
  });

  describe("CSS generation", () => {
    it("includes composition base styles with correct dimensions", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain('data-composition-id="captions"');
      expect(html).toContain("width: 1920px");
      expect(html).toContain("height: 1080px");
    });

    it("includes .caption-group base styles with opacity: 0", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain(".caption-group");
      expect(html).toContain("opacity: 0");
    });

    it("includes .word base styles with display: inline-block", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain(".word");
      expect(html).toContain("display: inline-block");
    });

    it("includes per-group CSS class with font styles from DEFAULT_STYLE", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      // DEFAULT_STYLE has fontFamily: "sans-serif" and fontSize: 48
      expect(html).toContain("font-family: sans-serif");
      expect(html).toContain("font-size: 48px");
    });

    it("includes per-group CSS class for each group", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      // Two groups: group-0 and group-1
      expect(html).toContain("group-0");
      expect(html).toContain("group-1");
    });
  });

  describe("TRANSCRIPT array", () => {
    it("includes a TRANSCRIPT array in the script block", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("const TRANSCRIPT =");
    });

    it("includes all word texts from the transcript", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain('"We"');
      expect(html).toContain('"asked"');
      expect(html).toContain('"what"');
      expect(html).toContain('"you"');
      expect(html).toContain('"needed."');
      expect(html).toContain('"Forty-seven"');
      expect(html).toContain('"percent"');
    });

    it("includes start and end timing for words", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain('"start": 0.1');
      expect(html).toContain('"end": 0.3');
      expect(html).toContain('"start": 1.9');
      expect(html).toContain('"end": 2.7');
    });

    it("includes stable word ids in the transcript and generated word spans", () => {
      const transcript: TranscriptWord[] = [
        { id: "word-a", text: "Hello", start: 0, end: 0.4 },
        { id: "word-b", text: "world", start: 0.5, end: 1 },
      ];
      const model = buildCaptionModel(transcript, {
        width: 1920,
        height: 1080,
        duration: 2,
      });

      const html = generateCaptionHtml(model);

      expect(html).toContain('"id": "word-a"');
      expect(html).toContain('"id": "word-b"');
      expect(html).toContain('w_segment_0.id = "word-a";');
      expect(html).toContain('w_segment_1.id = "word-b";');
    });

    it("TRANSCRIPT contains all 7 words from the sample", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      // Count occurrences of "start" property in the TRANSCRIPT JSON
      const transcriptSection = html.slice(
        html.indexOf("const TRANSCRIPT ="),
        html.indexOf("const TRANSCRIPT =") + 1000,
      );
      const startCount = (transcriptSection.match(/"start":/g) ?? []).length;
      expect(startCount).toBe(7);
    });
  });

  describe("GSAP timeline", () => {
    it("registers the timeline via window.__timelines", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain('window.__timelines["captions"]');
    });

    it("creates a gsap.timeline() call", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("gsap.timeline(");
    });

    it("includes entrance tween with opacity: 1 for each group", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("opacity: 1");
    });

    it("includes exit tween with opacity: 0 for each group", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("opacity: 0");
    });

    it("uses group start time as position for entrance tween", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      // First group starts at 0.1 (first word start)
      expect(html).toContain(", 0.1)");
    });

    it("creates caption-group div elements with class='clip'", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("caption-group clip");
    });

    it("creates word span elements with class='word clip'", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("word clip");
    });

    it("sets data-start and data-end on group elements", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("dataset.start");
      expect(html).toContain("dataset.end");
    });

    it("wraps everything in an IIFE", () => {
      const model = buildTestModel();
      const html = generateCaptionHtml(model);
      expect(html).toContain("(function ()");
      expect(html).toContain("})();");
    });
  });

  describe("positioning", () => {
    it("centers groups without explicit x/y using transform: translateX(-50%)", () => {
      const model = buildTestModel();
      // DEFAULT_STYLE has x: 0 and y: 0
      const html = generateCaptionHtml(model);
      expect(html).toContain("translateX(-50%)");
    });

    it("uses absolute left/top when group style has explicit x/y", () => {
      const model = buildTestModel();
      // Override the first group's style to have explicit position
      const firstGroupId = model.groupOrder[0];
      const firstGroup = model.groups.get(firstGroupId);
      if (firstGroup) {
        firstGroup.style = { ...firstGroup.style, x: 200, y: 300 };
      }
      const html = generateCaptionHtml(model);
      expect(html).toContain("200px");
      expect(html).toContain("300px");
    });
  });

  describe("edge cases", () => {
    it("handles an empty model (no segments or groups) without throwing", () => {
      const model = buildCaptionModel([], {
        width: 1280,
        height: 720,
        duration: 5,
      });
      expect(() => generateCaptionHtml(model)).not.toThrow();
    });

    it("empty model still produces valid template wrapper", () => {
      const model = buildCaptionModel([], {
        width: 1280,
        height: 720,
        duration: 5,
      });
      const html = generateCaptionHtml(model);
      expect(html).toContain('<template id="captions-template">');
      expect(html).toContain('data-composition-id="captions"');
    });

    it("handles custom dimensions correctly", () => {
      const model = buildCaptionModel(SAMPLE_TRANSCRIPT, {
        width: 1280,
        height: 720,
        duration: 30,
      });
      const html = generateCaptionHtml(model);
      expect(html).toContain('data-width="1280"');
      expect(html).toContain('data-height="720"');
      expect(html).toContain('data-duration="30"');
      expect(html).toContain("width: 1280px");
      expect(html).toContain("height: 720px");
    });

    it("words with special characters are escaped in JS output", () => {
      const transcript: TranscriptWord[] = [{ text: "it's", start: 0.0, end: 0.5 }];
      const model = buildCaptionModel(transcript, {
        width: 1920,
        height: 1080,
        duration: 5,
      });
      expect(() => generateCaptionHtml(model)).not.toThrow();
    });
  });
});
