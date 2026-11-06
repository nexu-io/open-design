// Caption Parser — Extract Transcript & Build Caption Model
// Parses a caption composition's JavaScript source to extract the transcript word array,
// and builds a CaptionModel from a TranscriptWord array.

import {
  parseExpressionAt,
  tokenizer,
  type Expression,
  type Property,
  type SpreadElement,
  type UnaryExpression,
} from "acorn";
import {
  CaptionModel,
  CaptionSegment,
  CaptionGroup,
  CaptionStyle,
  CaptionContainerStyle,
  DEFAULT_STYLE,
  DEFAULT_CONTAINER,
  DEFAULT_ANIMATION_SET,
} from "./types";

export interface TranscriptWord {
  id?: string;
  text: string;
  start: number;
  end: number;
}

export interface BuildOptions {
  width: number;
  height: number;
  duration: number;
  wordsPerGroup?: number; // default 5
}

/**
 * Builds a CaptionModel from a transcript word array and composition dimensions.
 *
 * Words are grouped into chunks of `wordsPerGroup` (default 5). Each word becomes a
 * CaptionSegment with its original timing. Each chunk becomes a CaptionGroup with
 * DEFAULT_STYLE, DEFAULT_ANIMATION_SET, and DEFAULT_CONTAINER.
 */
export function buildCaptionModel(
  transcript: TranscriptWord[],
  options: BuildOptions,
): CaptionModel {
  const { wordsPerGroup = 5 } = options;
  const wordGroups: TranscriptWord[][] = [];
  for (let offset = 0; offset < transcript.length; offset += wordsPerGroup) {
    wordGroups.push(transcript.slice(offset, offset + wordsPerGroup));
  }
  return buildGroupedCaptionModel(wordGroups, options);
}

function buildGroupedCaptionModel(
  wordGroups: TranscriptWord[][],
  { width, height, duration }: BuildOptions,
): CaptionModel {
  const segments = new Map<string, CaptionSegment>();
  const groups = new Map<string, CaptionGroup>();
  const groupOrder: string[] = [];

  for (const chunk of wordGroups) {
    const groupId = `group-${groups.size}`;
    const segmentIds: string[] = [];

    chunk.forEach((word, wordIdx) => {
      const segmentIndex = segments.size;
      const segmentId = `segment-${segmentIndex}`;
      const segment: CaptionSegment = {
        id: segmentId,
        wordId: word.id ?? `w${segmentIndex}`,
        text: word.text,
        start: word.start,
        end: word.end,
        groupIndex: wordIdx,
        style: {},
        animation: {},
      };
      segments.set(segmentId, segment);
      segmentIds.push(segmentId);
    });

    const group: CaptionGroup = {
      id: groupId,
      segmentIds,
      style: { ...DEFAULT_STYLE },
      animation: {
        entrance: { ...DEFAULT_ANIMATION_SET.entrance },
        highlight: DEFAULT_ANIMATION_SET.highlight,
        exit: { ...DEFAULT_ANIMATION_SET.exit },
      },
      containerStyle: { ...DEFAULT_CONTAINER },
    };
    groups.set(groupId, group);
    groupOrder.push(groupId);
  }

  return {
    width,
    height,
    duration,
    segments,
    groups,
    groupOrder,
    defaultAnimation: {
      entrance: { ...DEFAULT_ANIMATION_SET.entrance },
      highlight: DEFAULT_ANIMATION_SET.highlight,
      exit: { ...DEFAULT_ANIMATION_SET.exit },
    },
  };
}

const GROUP_SELECTOR = ".caption-group, .caption-line, .caption-block";
const WORD_SELECTOR = ".word, .caption-word";

/** Read outer groups in transcript order; return null if their word counts do not match. */
function readTranscriptGroups(transcript: TranscriptWord[], groupEls: NodeListOf<Element>) {
  const wordGroups: TranscriptWord[][] = [];
  let offset = 0;
  for (const group of groupEls) {
    // Caption templates can nest layout lines inside a single timed group.
    if (group.parentElement?.closest(GROUP_SELECTOR)) continue;
    const size = group.querySelectorAll(WORD_SELECTOR).length;
    if (size === 0) continue;
    wordGroups.push(transcript.slice(offset, offset + size));
    offset += size;
  }
  return offset === transcript.length ? wordGroups : null;
}

/**
 * Extracts a transcript word array from caption composition source code.
 *
 * Looks for `const TRANSCRIPT = [...]` or `const script = [...]` (also let/var)
 * and parses each `{ text, start, end }` object into TranscriptWord objects.
 *
 * Supports static literals only; expressions are never evaluated.
 * Returns an empty array if no transcript is found or if parsing fails.
 */
export function extractTranscript(source: string): TranscriptWord[] {
  // Locate the initializer in either JavaScript or a complete HTML composition.
  // Acorn owns its boundary so delimiters inside strings remain literal text.
  const varPattern = /\b(?:const|let|var)\s+(?:TRANSCRIPT|script)\s*=\s*(?=\[)/;
  const match = varPattern.exec(source);

  if (!match) {
    return [];
  }

  try {
    const options = { ecmaVersion: "latest" } as const;
    const expression = parseExpressionAt(source, match.index + match[0].length, options);
    if (expression.type !== "ArrayExpression") return [];
    const nextToken = tokenizer(source.slice(expression.end), options).getToken();
    if (nextToken.type.label !== ";") return [];
    return parseTranscriptArray(readStaticValue(expression));
  } catch {
    return [];
  }
}

/**
 * Parses a caption composition from a live iframe DOM, extracting the transcript
 * from the source and reading computed styles from rendered elements.
 *
 * Runs in the Studio (outside the iframe). Reads computed styles from iframe DOM
 * elements to build a fully-styled CaptionModel. Preserves DOM group boundaries
 * when they account for every transcript word; otherwise uses default grouping.
 *
 * Returns null if no transcript is found in the source.
 */
export function parseCaptionComposition(
  iframeDoc: Document,
  iframeWin: Window,
  source: string,
  compositionWidth: number,
  compositionHeight: number,
  compositionDuration: number,
): CaptionModel | null {
  // Step 1: Extract transcript words from source
  const transcript = extractTranscript(source);
  if (transcript.length === 0) {
    return null;
  }

  // Step 2: Look for grouping and word elements in the iframe DOM
  const groupEls = iframeDoc.querySelectorAll(GROUP_SELECTOR);
  const wordEls = iframeDoc.querySelectorAll(WORD_SELECTOR);

  // Preserve authored boundaries when the DOM accounts for the complete transcript.
  const wordGroups = readTranscriptGroups(transcript, groupEls);
  const options = {
    width: compositionWidth,
    height: compositionHeight,
    duration: compositionDuration,
  };
  const model = wordGroups
    ? buildGroupedCaptionModel(wordGroups, options)
    : buildCaptionModel(transcript, options);

  // Step 5: Read computed styles from the first word or group element
  const firstWordEl = wordEls.item(0) as Element | null;
  const firstGroupEl = groupEls.item(0) as Element | null;
  const styleSourceEl = firstWordEl ?? firstGroupEl;

  if (styleSourceEl) {
    const computed = iframeWin.getComputedStyle(styleSourceEl);

    // Build partial style overrides from computed values
    const styleOverrides: Partial<CaptionStyle> = {};

    const fontSize = parseFloat(computed.fontSize);
    if (!isNaN(fontSize) && fontSize > 0) {
      styleOverrides.fontSize = fontSize;
    }

    const fontWeight = computed.fontWeight;
    if (fontWeight) {
      const numericWeight = parseInt(fontWeight, 10);
      styleOverrides.fontWeight = isNaN(numericWeight) ? fontWeight : numericWeight;
    }

    const fontFamily = computed.fontFamily;
    if (fontFamily) {
      styleOverrides.fontFamily = fontFamily;
    }

    const color = computed.color;
    if (color) {
      styleOverrides.color = color;
    }

    const textTransform = computed.textTransform as CaptionStyle["textTransform"];
    if (
      textTransform === "none" ||
      textTransform === "uppercase" ||
      textTransform === "lowercase" ||
      textTransform === "capitalize"
    ) {
      styleOverrides.textTransform = textTransform;
    }

    const letterSpacing = computed.letterSpacing;
    if (letterSpacing && letterSpacing !== "normal") {
      const lsPx = parseFloat(letterSpacing);
      const fsPx = styleOverrides.fontSize ?? DEFAULT_STYLE.fontSize;
      if (!isNaN(lsPx) && fsPx > 0) {
        // Convert px to em
        styleOverrides.letterSpacing = lsPx / fsPx;
      }
    }

    // Step 6: Read container styles from group element (if visible background)
    const containerOverrides: Partial<CaptionContainerStyle> = {};

    if (firstGroupEl) {
      const groupComputed = iframeWin.getComputedStyle(firstGroupEl);
      const bgColor = groupComputed.backgroundColor;
      // Only apply if it's not transparent/none
      if (bgColor && bgColor !== "rgba(0, 0, 0, 0)" && bgColor !== "transparent") {
        containerOverrides.backgroundColor = bgColor;
        containerOverrides.backgroundOpacity = 1;
      }

      const borderRadius = parseFloat(groupComputed.borderRadius);
      if (!isNaN(borderRadius) && borderRadius > 0) {
        containerOverrides.borderRadius = borderRadius;
      }

      // Parse padding shorthand or individual values
      const paddingTop = parseFloat(groupComputed.paddingTop);
      const paddingRight = parseFloat(groupComputed.paddingRight);
      const paddingBottom = parseFloat(groupComputed.paddingBottom);
      const paddingLeft = parseFloat(groupComputed.paddingLeft);
      if (!isNaN(paddingTop)) containerOverrides.paddingTop = paddingTop;
      if (!isNaN(paddingRight)) containerOverrides.paddingRight = paddingRight;
      if (!isNaN(paddingBottom)) containerOverrides.paddingBottom = paddingBottom;
      if (!isNaN(paddingLeft)) containerOverrides.paddingLeft = paddingLeft;
    }

    // Step 7: Apply extracted styles to all groups in the model
    for (const groupId of model.groupOrder) {
      const group = model.groups.get(groupId);
      if (!group) continue;

      group.style = { ...group.style, ...styleOverrides };
      group.containerStyle = { ...group.containerStyle, ...containerOverrides };
    }
  }

  return model;
}

/** Decode data literals only, including metadata that is not used by captions. */
function readStaticValue(node: Expression | SpreadElement | null): unknown {
  switch (node?.type) {
    case "Literal":
      // Acorn's remaining literals are strings, numbers, booleans, or null.
      if ("regex" in node || "bigint" in node) break;
      return node.value;
    case "UnaryExpression":
      return readSignedNumber(node);
    case "ArrayExpression":
      return node.elements.map(readStaticValue);
    case "ObjectExpression":
      return Object.fromEntries(node.properties.map(readStaticProperty));
  }
  throw new SyntaxError("Transcript values must be static literals");
}

function readSignedNumber(node: UnaryExpression): number {
  if (
    (node.operator !== "-" && node.operator !== "+") ||
    node.argument.type !== "Literal" ||
    typeof node.argument.value !== "number"
  ) {
    throw new SyntaxError("Transcript unary expressions must be signed numeric literals");
  }
  return node.operator === "-" ? -node.argument.value : node.argument.value;
}

function readStaticProperty(property: Property | SpreadElement): [string | number, unknown] {
  if (
    property.type !== "Property" ||
    property.kind !== "init" ||
    property.method ||
    property.shorthand ||
    property.computed
  ) {
    throw new SyntaxError("Transcript properties must be static data");
  }
  const key =
    property.key.type === "Identifier" ? property.key.name : readStaticValue(property.key);
  if (typeof key !== "string" && typeof key !== "number") {
    throw new SyntaxError("Transcript property keys must be names or literals");
  }
  return [key, readStaticValue(property.value)];
}

function parseTranscriptArray(parsed: unknown): TranscriptWord[] {
  if (!Array.isArray(parsed)) {
    return [];
  }

  const words: TranscriptWord[] = [];
  const items: unknown[] = parsed;
  for (const item of items) {
    if (
      item !== null &&
      typeof item === "object" &&
      "text" in item &&
      typeof item.text === "string" &&
      "start" in item &&
      typeof item.start === "number" &&
      "end" in item &&
      typeof item.end === "number"
    ) {
      words.push({
        ...("id" in item && typeof item.id === "string" ? { id: item.id } : {}),
        text: item.text,
        start: item.start,
        end: item.end,
      });
    }
  }

  return words;
}
