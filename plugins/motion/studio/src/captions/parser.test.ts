// @vitest-environment node
import { describe, it, expect, vi } from "vitest";
import { extractTranscript, buildCaptionModel, TranscriptWord } from "./parser";
import { DEFAULT_STYLE, DEFAULT_CONTAINER, DEFAULT_ANIMATION_SET } from "./types";

// ---------------------------------------------------------------------------
// Fixtures
// ---------------------------------------------------------------------------

const STANDARD_CAPTION_SOURCE = `
(function () {
  const TRANSCRIPT = [
    { text: "We", start: 0.119, end: 0.259 },
    { text: "asked", start: 0.319, end: 0.479 },
    { text: "what", start: 0.519, end: 0.659 },
    { text: "you", start: 0.699, end: 0.819 },
    { text: "needed.", start: 0.859, end: 1.819 },
  ];
  // rest of composition code ...
})();
`;

const SCRIPT_VARIABLE_SOURCE = `
(function () {
  const script = [
    { text: "We", start: 0.119, end: 0.259 },
    { text: "asked", start: 0.319, end: 0.479 },
    { text: "what", start: 0.519, end: 0.659 },
  ];
  // rest of composition code ...
})();
`;

const LET_TRANSCRIPT_SOURCE = `
(function () {
  let TRANSCRIPT = [
    { text: "Hello", start: 0.0, end: 0.5 },
    { text: "world", start: 0.6, end: 1.0 },
  ];
})();
`;

const VAR_TRANSCRIPT_SOURCE = `
(function () {
  var TRANSCRIPT = [
    { text: "Hello", start: 0.0, end: 0.5 },
  ];
})();
`;

const SINGLE_QUOTED_SOURCE = `
(function () {
  const TRANSCRIPT = [
    { text: 'We', start: 0.119, end: 0.259 },
    { text: 'asked', start: 0.319, end: 0.479 },
  ];
})();
`;

const TRAILING_COMMA_SOURCE = `
(function () {
  const TRANSCRIPT = [
    { text: "We", start: 0.119, end: 0.259, },
    { text: "asked", start: 0.319, end: 0.479, },
  ];
})();
`;

const NON_CAPTION_SOURCE = `
(function () {
  const config = { fps: 30, duration: 10 };
  const elements = ["title", "subtitle"];
  gsap.to(".clip", { opacity: 1 });
})();
`;

const EMPTY_SOURCE = ``;

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("extractTranscript", () => {
  describe("TRANSCRIPT variable", () => {
    it("extracts words from a standard TRANSCRIPT array", () => {
      const words = extractTranscript(STANDARD_CAPTION_SOURCE);
      expect(words).toHaveLength(5);
      expect(words[0]).toEqual({ text: "We", start: 0.119, end: 0.259 });
      expect(words[1]).toEqual({ text: "asked", start: 0.319, end: 0.479 });
      expect(words[4]).toEqual({ text: "needed.", start: 0.859, end: 1.819 });
    });

    it("handles let TRANSCRIPT declaration", () => {
      const words = extractTranscript(LET_TRANSCRIPT_SOURCE);
      expect(words).toHaveLength(2);
      expect(words[0]).toEqual({ text: "Hello", start: 0.0, end: 0.5 });
      expect(words[1]).toEqual({ text: "world", start: 0.6, end: 1.0 });
    });

    it("handles var TRANSCRIPT declaration", () => {
      const words = extractTranscript(VAR_TRANSCRIPT_SOURCE);
      expect(words).toHaveLength(1);
      expect(words[0]).toEqual({ text: "Hello", start: 0.0, end: 0.5 });
    });

    it("preserves stable word ids when present", () => {
      const words = extractTranscript(`
        const TRANSCRIPT = [
          { id: "word-a", text: "Hello", start: 0, end: 0.4 },
          { id: "word-b", text: "world", start: 0.5, end: 1 },
        ];
      `);

      expect(words).toEqual([
        { id: "word-a", text: "Hello", start: 0, end: 0.4 },
        { id: "word-b", text: "world", start: 0.5, end: 1 },
      ]);
    });
  });

  describe("script variable name", () => {
    it("extracts words from a const script array (warm-grain template variant)", () => {
      const words = extractTranscript(SCRIPT_VARIABLE_SOURCE);
      expect(words).toHaveLength(3);
      expect(words[0]).toEqual({ text: "We", start: 0.119, end: 0.259 });
      expect(words[2]).toEqual({ text: "what", start: 0.519, end: 0.659 });
    });
  });

  describe("non-caption source", () => {
    it("returns empty array when no TRANSCRIPT or script variable is found", () => {
      const words = extractTranscript(NON_CAPTION_SOURCE);
      expect(words).toEqual([]);
    });

    it("returns empty array for an empty string", () => {
      const words = extractTranscript(EMPTY_SOURCE);
      expect(words).toEqual([]);
    });
  });

  describe("single-quoted values", () => {
    it("parses arrays with single-quoted text values", () => {
      const words = extractTranscript(SINGLE_QUOTED_SOURCE);
      expect(words).toHaveLength(2);
      expect(words[0]).toEqual({ text: "We", start: 0.119, end: 0.259 });
      expect(words[1]).toEqual({ text: "asked", start: 0.319, end: 0.479 });
    });
  });

  describe("trailing commas", () => {
    it("handles trailing commas inside objects", () => {
      const words = extractTranscript(TRAILING_COMMA_SOURCE);
      expect(words).toHaveLength(2);
      expect(words[0]).toEqual({ text: "We", start: 0.119, end: 0.259 });
    });
  });

  it.each([
    ["array delimiter", "'x ]; y'", "x ]; y"],
    ["trailing-comma text", "'literal ,] and ,}'", "literal ,] and ,}"],
    ["object-key text", "'{ text: example }'", "{ text: example }"],
    ["escaped quotes", String.raw`'It\'s "quoted"'`, `It's "quoted"`],
    ["escaped double quotes", String.raw`'Say \"hello\"'`, 'Say "hello"'],
    ["escaped backslash", String.raw`'C:\\captions\\'`, "C:\\captions\\"],
    ["hex and Unicode escapes", String.raw`'\x41\u0042\u{1D11E}'`, "AB\u{1D11E}"],
    ["control escapes", String.raw`'one\ntwo\tthree'`, "one\ntwo\tthree"],
  ])("preserves %s in JavaScript strings", (_name, literal, text) => {
    const source = `<script>const TRANSCRIPT = [{ id: 'word-a', text: ${literal}, start: 0.25, end: 1.5 }];</script>`;
    expect(extractTranscript(source)).toEqual([{ id: "word-a", text, start: 0.25, end: 1.5 }]);
  });

  it("preserves JSON values and filters malformed word entries", () => {
    const source = `const TRANSCRIPT = [
      null, 42, {"text":"missing timing"}, {"text":"bad timing","start":"0","end":1},
      {"id":7,"text":"valid","start":-0.25,"end":1e1,"extra":{"items":[true,false,null]}}
    ];`;
    expect(extractTranscript(source)).toEqual([{ text: "valid", start: -0.25, end: 10 }]);
  });

  it("accepts comments around static values", () => {
    expect(
      extractTranscript(`const TRANSCRIPT = [
        // Delimiter in a comment: ];
        { text: 'hello', start: 0, end: 1, },
      ] /* trailing comment */;`),
    ).toEqual([{ text: "hello", start: 0, end: 1 }]);
  });

  it.each([
    "[{ text: 'unterminated, start: 0, end: 1 }];",
    "[{ text: 'hello', start: 0, end: 1 };",
    String.raw`[{ text: '\xZZ', start: 0, end: 1 }];`,
    "[{ text: 'hello', start: 0, end: 1 }] garbage;",
    "[{ text: 'hello', start: 0, end: 1 },,];",
    "[{ text: getText(), start: 0, end: 1 }];",
    "[{ text: 'hello', start: offset, end: 1 }];",
    "[{ text: 'hello', start: 1 + 2, end: 4 }];",
    "[{ text: 'hello', start: -getTime(), end: 1 }];",
    "[{ text: 'hello', start: 0, end: 1, extra: /pattern/ }];",
    "[{ text: 'hello', start: 0, end: 1, extra: 1n }];",
    "[{ get text() { return 'hello'; }, start: 0, end: 1 }];",
    "[{ text: 'hello', start: 0, end: 1, extra() {} }];",
    "[{ ['text']: 'hello', start: 0, end: 1 }];",
    "[{ text, start: 0, end: 1 }];",
    "[{ ...word, text: 'hello', start: 0, end: 1 }];",
    "[...words];",
    "[{ text: `hello ${getText()}`, start: 0, end: 1 }];",
    "[{ text: 'hello', start: 0, end: 1, extra: { run: getText() } }];",
    "[{ text: 'hello', start: 0, end: 1 }].map(transform);",
    "[{ text: 'hello', start: 0, end: 1 }], run();",
  ])("rejects malformed or executable initializers: %s", (initializer) => {
    expect(extractTranscript(`const TRANSCRIPT = ${initializer}`)).toEqual([]);
  });

  it("never runs code while extracting a transcript", () => {
    const getCaptionText = vi.fn(() => "hello");
    vi.stubGlobal("getCaptionText", getCaptionText);
    try {
      expect(
        extractTranscript("const TRANSCRIPT = [{ text: getCaptionText(), start: 0, end: 1 }];"),
      ).toEqual([]);
      expect(getCaptionText).not.toHaveBeenCalled();
    } finally {
      vi.unstubAllGlobals();
    }
  });

  describe("real-world source samples", () => {
    it("handles a realistic production-style TRANSCRIPT block with many words", () => {
      const source = `
        (function() {
          const TRANSCRIPT = [
            { text: "We", start: 0.119, end: 0.259 },
            { text: "asked", start: 0.319, end: 0.479 },
            { text: "what", start: 0.519, end: 0.659 },
            { text: "you", start: 0.699, end: 0.819 },
            { text: "needed.", start: 0.859, end: 1.819 },
            { text: "Forty-seven", start: 1.86, end: 2.299 },
            { text: "percent", start: 2.399, end: 2.679 },
            { text: "of", start: 2.7, end: 2.799 },
          ];
        })();
      `;
      const words = extractTranscript(source);
      expect(words).toHaveLength(8);
      expect(words[5]).toEqual({ text: "Forty-seven", start: 1.86, end: 2.299 });
    });

    it("handles words with punctuation in text values", () => {
      const source = `
        const TRANSCRIPT = [
          { text: "graphics,", start: 3.579, end: 4.599 },
          { text: "you", start: 4.679, end: 5.179 },
          { text: "attention.", start: 5.299, end: 5.759 },
        ];
      `;
      const words = extractTranscript(source);
      expect(words).toHaveLength(3);
      expect(words[0].text).toBe("graphics,");
      expect(words[2].text).toBe("attention.");
    });
  });
});

// ---------------------------------------------------------------------------
// buildCaptionModel tests
// ---------------------------------------------------------------------------

const SEVEN_WORDS: TranscriptWord[] = [
  { text: "We", start: 0.1, end: 0.3 },
  { text: "asked", start: 0.4, end: 0.6 },
  { text: "what", start: 0.7, end: 0.9 },
  { text: "you", start: 1.0, end: 1.2 },
  { text: "needed.", start: 1.3, end: 1.8 },
  { text: "Forty-seven", start: 1.9, end: 2.3 },
  { text: "percent", start: 2.4, end: 2.7 },
];

describe("buildCaptionModel", () => {
  describe("grouping", () => {
    it("produces 2 groups for 7 words with wordsPerGroup=5 (5 + 2)", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      expect(model.groupOrder).toHaveLength(2);
      expect(model.groups.size).toBe(2);
    });

    it("first group has 5 segments and second group has 2 segments", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      const firstGroupId = model.groupOrder[0];
      const secondGroupId = model.groupOrder[1];
      expect(model.groups.get(firstGroupId)?.segmentIds).toHaveLength(5);
      expect(model.groups.get(secondGroupId)?.segmentIds).toHaveLength(2);
    });

    it("uses default wordsPerGroup of 5 when not specified", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1280,
        height: 720,
        duration: 5,
      });
      expect(model.groupOrder).toHaveLength(2);
    });
  });

  describe("segments", () => {
    it("segments have correct text matching the transcript words", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      expect(model.segments.size).toBe(7);

      const firstGroupId = model.groupOrder[0];
      const firstGroup = model.groups.get(firstGroupId);
      const firstSegmentId = firstGroup?.segmentIds[0];
      const firstSegment = firstSegmentId ? model.segments.get(firstSegmentId) : undefined;
      expect(firstSegment?.text).toBe("We");

      const secondGroupId = model.groupOrder[1];
      const secondGroup = model.groups.get(secondGroupId);
      const sixthSegmentId = secondGroup?.segmentIds[0];
      const sixthSegment = sixthSegmentId ? model.segments.get(sixthSegmentId) : undefined;
      expect(sixthSegment?.text).toBe("Forty-seven");
    });

    it("segments have correct start and end timing from the transcript", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      const firstGroupId = model.groupOrder[0];
      const firstGroup = model.groups.get(firstGroupId);
      const segId = firstGroup?.segmentIds[4];
      const fifthSegment = segId ? model.segments.get(segId) : undefined;
      expect(fifthSegment?.start).toBe(1.3);
      expect(fifthSegment?.end).toBe(1.8);
      expect(fifthSegment?.text).toBe("needed.");
    });

    it("segments have correct groupIndex reflecting position within their group", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      const secondGroupId = model.groupOrder[1];
      const secondGroup = model.groups.get(secondGroupId);
      const segId = secondGroup?.segmentIds[1];
      const segment = segId ? model.segments.get(segId) : undefined;
      expect(segment?.groupIndex).toBe(1);
    });
  });

  describe("model dimensions", () => {
    it("stores correct width, height, and duration on the model", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 30.5,
        wordsPerGroup: 5,
      });
      expect(model.width).toBe(1920);
      expect(model.height).toBe(1080);
      expect(model.duration).toBe(30.5);
    });
  });

  describe("default styles", () => {
    it("groups have DEFAULT_STYLE applied", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      const firstGroupId = model.groupOrder[0];
      const group = model.groups.get(firstGroupId);
      expect(group?.style).toEqual(DEFAULT_STYLE);
    });

    it("groups have DEFAULT_CONTAINER applied", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      const firstGroupId = model.groupOrder[0];
      const group = model.groups.get(firstGroupId);
      expect(group?.containerStyle).toEqual(DEFAULT_CONTAINER);
    });

    it("groups have DEFAULT_ANIMATION_SET applied", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      const firstGroupId = model.groupOrder[0];
      const group = model.groups.get(firstGroupId);
      expect(group?.animation.entrance).toEqual(DEFAULT_ANIMATION_SET.entrance);
      expect(group?.animation.highlight).toBe(DEFAULT_ANIMATION_SET.highlight);
      expect(group?.animation.exit).toEqual(DEFAULT_ANIMATION_SET.exit);
    });

    it("model defaultAnimation matches DEFAULT_ANIMATION_SET", () => {
      const model = buildCaptionModel(SEVEN_WORDS, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      expect(model.defaultAnimation.entrance).toEqual(DEFAULT_ANIMATION_SET.entrance);
      expect(model.defaultAnimation.highlight).toBe(DEFAULT_ANIMATION_SET.highlight);
      expect(model.defaultAnimation.exit).toEqual(DEFAULT_ANIMATION_SET.exit);
    });
  });

  describe("edge cases", () => {
    it("handles an empty transcript returning a model with no segments or groups", () => {
      const model = buildCaptionModel([], {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      expect(model.segments.size).toBe(0);
      expect(model.groups.size).toBe(0);
      expect(model.groupOrder).toHaveLength(0);
    });

    it("handles transcript with exactly wordsPerGroup words producing 1 group", () => {
      const fiveWords = SEVEN_WORDS.slice(0, 5);
      const model = buildCaptionModel(fiveWords, {
        width: 1920,
        height: 1080,
        duration: 10,
        wordsPerGroup: 5,
      });
      expect(model.groupOrder).toHaveLength(1);
      expect(model.segments.size).toBe(5);
    });
  });
});
