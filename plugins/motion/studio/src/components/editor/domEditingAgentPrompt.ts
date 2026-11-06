/**
 * Agent prompt builder for HyperFrames element edit requests.
 */
import type { HyperframePickerElementInfo } from "@hyperframes/core";
import { formatTime } from "../../player/lib/time";
import type { DomEditSelection, DomEditTextField } from "./domEditingTypes";

/**
 * The subset of an element selection shared by the Studio DOM editor (`DomEditSelection`) and the
 * runtime picker (`HyperframePickerElementInfo`); a field absent from a caller's type is simply omitted.
 */
export interface AgentPromptElementInfo {
  id: string | null;
  selector?: string | null;
  /** Disambiguates duplicate selectors in `DomEditSelection`. The picker
   *  payload has no such concept (one picked node, not a candidate list), so
   *  a picker-built prompt always prints index 0 — expected, not a gap. */
  selectorIndex?: number;
  tagName: string;
  label?: string;
  boundingBox: { x: number; y: number; width: number; height: number };
  textContent: string | null;
  src?: string | null;
  textFields?: DomEditTextField[];
  inlineStyles?: Record<string, string>;
  computedStyles?: Record<string, string>;
}

const GUARDRAIL_LINES = [
  "Guardrails:",
  "- Make a targeted change to this element only, unless the request is a timeline edit.",
  "- Preserve the rest of the composition and its timing, except what a timeline edit changes.",
  "- Do not modify other elements' data-* attributes or positioning, except where the requested timeline edit requires it (split, retime, reorder, copy a group, swap media).",
  "- For timeline edits (trim, split, speed, volume, copy, swap), use the `hyperframes timeline` edit commands (`hyperframes-cli` skill) or the exact attribute forms in the `hyperframes` skill's `references/format.md`.",
  "- Prefer existing inline styles or existing CSS rules for this element over adding unrelated selectors.",
];

function formatBoundingBox(bounds: AgentPromptElementInfo["boundingBox"]): string {
  return `x=${Math.round(bounds.x)}, y=${Math.round(bounds.y)}, width=${Math.round(bounds.width)}, height=${Math.round(bounds.height)}`;
}

function formatStyleBlock(styles: Record<string, string>): string {
  return Object.entries(styles)
    .filter(([, value]) => value && value !== "initial")
    .map(([key, value]) => `${key}: ${value}`)
    .join("\n");
}

function formatTextFields(fields: DomEditTextField[]): string {
  return fields
    .map(
      (field) =>
        `- key=${field.key}; tag=<${field.tagName}>; source=${field.source}; text=${JSON.stringify(field.value)}`,
    )
    .join("\n");
}

function formatSelectorTagLine(info: Pick<AgentPromptElementInfo, "selector" | "tagName">): string {
  return `Selector: ${info.selector ?? "(none)"}  Tag: <${info.tagName}>`;
}

function formatTextLine(textContent: string | null): string {
  return textContent ? `Text: ${textContent}` : "";
}

/** Core identity fields, plus the text line when the element has text content. */
function buildElementInfoLines(info: AgentPromptElementInfo): string[] {
  const lines = [
    `DOM id: ${info.id ?? "(none)"}`,
    `Selector: ${info.selector ?? "(none)"}`,
    `Selector index: ${info.selectorIndex ?? 0}`,
    `Tag: <${info.tagName}>`,
  ];
  if (info.label) lines.push(`Label: ${info.label}`);
  lines.push(`Bounds: ${formatBoundingBox(info.boundingBox)}`);
  if (info.src) lines.push(`Source (media): ${info.src}`);
  if (info.textContent) lines.push(`Text: ${info.textContent}`);
  return lines;
}

/** Text fields, inline styles, computed styles — present when the caller supplies them. */
function buildElementDetailLines(info: AgentPromptElementInfo): string[] {
  const lines: string[] = [];
  const textFieldsBlock = info.textFields ? formatTextFields(info.textFields) : "";
  if (textFieldsBlock) lines.push("", "Text fields:", textFieldsBlock);
  const inlineStyleBlock = info.inlineStyles ? formatStyleBlock(info.inlineStyles) : "";
  if (inlineStyleBlock) lines.push("", "Inline styles:", inlineStyleBlock);
  const computedStyleBlock = info.computedStyles ? formatStyleBlock(info.computedStyles) : "";
  if (computedStyleBlock) lines.push("", "Computed styles (browser-resolved):", computedStyleBlock);
  return lines;
}

export function buildElementAgentPrompt({
  selection,
  currentTime,
  tagSnippet,
  selectionContext,
  userInstruction,
  sourceFilePath,
  timeline,
}: {
  selection: DomEditSelection;
  currentTime: number;
  tagSnippet?: string;
  selectionContext?: string;
  userInstruction?: string;
  sourceFilePath?: string;
  /** The `formatTimelineBlock` text; omitted or empty when the timeline has no clips. */
  timeline?: string;
}): string {
  const displayedSourceFile = sourceFilePath?.trim() || selection.sourceFile;
  const info: AgentPromptElementInfo = {
    id: selection.id ?? null,
    selector: selection.selector,
    selectorIndex: selection.selectorIndex,
    tagName: selection.tagName,
    boundingBox: selection.boundingBox,
    textContent: selection.textContent,
    textFields: selection.textFields,
    inlineStyles: selection.inlineStyles,
    computedStyles: selection.computedStyles,
  };

  const lines = [
    "## HyperFrames element edit request v1",
    "Schema version: 1",
    "",
    userInstruction?.trim() || "Edit this selected HyperFrames element.",
    "",
    `Composition: ${selection.compositionPath}`,
    `Playback time: ${formatTime(currentTime)}`,
    `Source file: ${displayedSourceFile}`,
    ...buildElementInfoLines(info),
  ];

  const trimmedSelectionContext = selectionContext?.trim();
  if (trimmedSelectionContext) {
    lines.push("", "Selection context:", trimmedSelectionContext);
  }

  lines.push(...buildElementDetailLines(info));

  if (timeline) lines.push("", timeline);

  if (tagSnippet) {
    lines.push("", "Target HTML:", tagSnippet);
  }

  lines.push("", ...GUARDRAIL_LINES);

  return lines.join("\n");
}

function buildSelectorAndTextLines(
  info: Pick<AgentPromptElementInfo, "selector" | "tagName" | "textContent">,
): string[] {
  return [formatSelectorTagLine(info), formatTextLine(info.textContent)];
}

export function buildAgentContextPreview(
  selection: DomEditSelection,
  activeCompPath: string | null,
): string {
  return [
    `Composition: ${selection.compositionPath}`,
    `Source: ${selection.sourceFile || activeCompPath || "index.html"}`,
    ...buildSelectorAndTextLines(selection),
  ]
    .filter(Boolean)
    .join("\n");
}

/**
 * Same convention as `buildElementAgentPrompt`, for a host app embedding only the player: built from
 * the runtime picker's own payload, not `DomEditSelection`. Null selection yields a bare prompt, no guardrails.
 */
export function buildPickerAgentPrompt({
  selection,
  userInstruction,
}: {
  selection: HyperframePickerElementInfo | null;
  userInstruction?: string;
}): string {
  const lines = [
    "## HyperFrames element edit request v1",
    "Schema version: 1",
    "",
    userInstruction?.trim() || "Edit this selected HyperFrames element.",
  ];

  if (!selection) return lines.join("\n");

  const info: AgentPromptElementInfo = {
    id: selection.id,
    selector: selection.selector,
    tagName: selection.tagName,
    label: selection.label,
    boundingBox: selection.boundingBox,
    textContent: selection.textContent,
    src: selection.src,
  };

  lines.push(
    "",
    ...buildElementInfoLines(info),
    ...buildElementDetailLines(info),
    "",
    ...GUARDRAIL_LINES,
  );

  return lines.join("\n");
}

export function buildPickerAgentContextPreview(
  selection: HyperframePickerElementInfo | null,
): string {
  if (!selection) return "";
  return buildSelectorAndTextLines(selection).filter(Boolean).join("\n");
}
