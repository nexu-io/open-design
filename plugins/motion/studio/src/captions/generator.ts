// Caption HTML Generator
// Serializes a CaptionModel into a complete captions.html HyperFrames composition.

import type {
  CaptionModel,
  CaptionSegment,
  CaptionStyle,
  CaptionContainerStyle,
  CaptionShadow,
  CaptionGlow,
} from "./types";

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Serializes a CaptionModel into a complete captions.html composition string.
 *
 * Output format:
 * ```html
 * <template id="captions-template">
 *   <div data-composition-id="captions" data-width="..." data-height="..." data-duration="...">
 *     <div id="captions-container"></div>
 *     <style>/* generated CSS *\/</style>
 *     <script>/* generated JS *\/</script>
 *   </div>
 * </template>
 * ```
 */
export function generateCaptionHtml(model: CaptionModel): string {
  const css = generateCss(model);
  const js = generateJs(model);

  const durationStr = model.duration.toString();

  return [
    `<template id="captions-template">`,
    `  <div data-composition-id="captions" data-width="${model.width}" data-height="${model.height}" data-duration="${durationStr}">`,
    `    <div id="captions-container"></div>`,
    `    <style>`,
    indent(css, 6),
    `    </style>`,
    `    <script>`,
    indent(js, 6),
    `    </script>`,
    `  </div>`,
    `</template>`,
  ].join("\n");
}

// ---------------------------------------------------------------------------
// CSS generation
// ---------------------------------------------------------------------------

function generateCss(model: CaptionModel): string {
  const lines: string[] = [];

  // Base composition styles
  lines.push(
    `[data-composition-id="captions"] {`,
    `  position: relative;`,
    `  width: ${model.width}px;`,
    `  height: ${model.height}px;`,
    `  background: transparent;`,
    `  overflow: hidden;`,
    `}`,
    ``,
  );

  // Container styles
  lines.push(`#captions-container {`, `  position: absolute;`, `  inset: 0;`, `}`, ``);

  // .caption-group base styles
  lines.push(
    `.caption-group {`,
    `  position: absolute;`,
    `  display: flex;`,
    `  flex-wrap: wrap;`,
    `  gap: 0.25em;`,
    `  opacity: 0;`,
    `}`,
    ``,
  );

  // .word base styles
  lines.push(`.word {`, `  display: inline-block;`, `}`, ``);

  // Per-group CSS classes
  for (const groupId of model.groupOrder) {
    const group = model.groups.get(groupId);
    if (!group) continue;

    const className = groupId.replace(/[^a-zA-Z0-9-_]/g, "-");
    const styleDecls = buildGroupStyleDecls(group.style, group.containerStyle);

    if (styleDecls.length > 0) {
      lines.push(`.caption-group.${className} {`);
      for (const decl of styleDecls) {
        lines.push(`  ${decl}`);
      }
      lines.push(`}`, ``);
    }
  }

  return lines.join("\n");
}

function buildGroupStyleDecls(
  style: CaptionStyle,
  containerStyle: CaptionContainerStyle,
): string[] {
  const decls: string[] = [];

  // Typography
  if (style.fontFamily) {
    decls.push(`font-family: ${style.fontFamily};`);
  }
  if (style.fontSize) {
    decls.push(`font-size: ${style.fontSize}px;`);
  }
  if (style.fontWeight) {
    decls.push(`font-weight: ${style.fontWeight};`);
  }
  if (style.fontStyle && style.fontStyle !== "normal") {
    decls.push(`font-style: ${style.fontStyle};`);
  }
  if (style.textDecoration && style.textDecoration !== "none") {
    decls.push(`text-decoration: ${style.textDecoration};`);
  }
  if (style.textTransform && style.textTransform !== "none") {
    decls.push(`text-transform: ${style.textTransform};`);
  }
  if (style.letterSpacing !== 0) {
    decls.push(`letter-spacing: ${style.letterSpacing}em;`);
  }
  if (style.lineHeight) {
    decls.push(`line-height: ${style.lineHeight};`);
  }

  // Color / fill
  if (style.color) {
    decls.push(`color: ${style.color};`);
  }
  if (style.opacity !== undefined && style.opacity !== 1) {
    // opacity is managed by GSAP animations, but non-default base opacity can be declared
    decls.push(`--caption-base-opacity: ${style.opacity};`);
  }

  // Stroke (via text-stroke / webkit-text-stroke)
  if (style.strokeWidth > 0) {
    decls.push(`-webkit-text-stroke: ${style.strokeWidth}px ${style.strokeColor};`);
  }

  // Shadows
  if (style.shadows && style.shadows.length > 0) {
    const shadowStr = style.shadows.map(shadowToCss).join(", ");
    decls.push(`text-shadow: ${shadowStr};`);
  }

  // Glow (implemented as additional text-shadow)
  if (style.glow) {
    const glowStr = glowToCss(style.glow);
    const existingShadow =
      style.shadows && style.shadows.length > 0
        ? style.shadows.map(shadowToCss).join(", ") + ", "
        : "";
    // Only emit if not already emitted shadows (override the text-shadow if both present)
    if (!(style.shadows && style.shadows.length > 0)) {
      decls.push(`text-shadow: ${glowStr};`);
    } else {
      // Replace the last text-shadow declaration with combined
      const idx = decls.findLastIndex((d) => d.startsWith("text-shadow:"));
      if (idx >= 0) {
        decls[idx] = `text-shadow: ${existingShadow}${glowStr};`;
      }
    }
  }

  // Blend mode
  if (style.blendMode && style.blendMode !== "normal") {
    decls.push(`mix-blend-mode: ${style.blendMode};`);
  }

  // Container: background
  if (
    containerStyle.backgroundColor &&
    containerStyle.backgroundColor !== "transparent" &&
    containerStyle.backgroundOpacity > 0
  ) {
    const bg = hexToRgba(containerStyle.backgroundColor, containerStyle.backgroundOpacity);
    decls.push(`background-color: ${bg};`);
  }

  // Container: padding
  const { paddingTop, paddingRight, paddingBottom, paddingLeft } = containerStyle;
  if (paddingTop > 0 || paddingRight > 0 || paddingBottom > 0 || paddingLeft > 0) {
    decls.push(`padding: ${paddingTop}px ${paddingRight}px ${paddingBottom}px ${paddingLeft}px;`);
  }

  // Container: border radius
  if (containerStyle.borderRadius > 0) {
    decls.push(`border-radius: ${containerStyle.borderRadius}px;`);
  }

  // Container: border
  if (containerStyle.borderWidth > 0) {
    decls.push(
      `border: ${containerStyle.borderWidth}px ${containerStyle.borderStyle} ${containerStyle.borderColor};`,
    );
  }

  // Container: box shadow
  if (containerStyle.boxShadow && containerStyle.boxShadow !== "none") {
    decls.push(`box-shadow: ${containerStyle.boxShadow};`);
  }

  return decls;
}

function shadowToCss(shadow: CaptionShadow): string {
  return `${shadow.offsetX}px ${shadow.offsetY}px ${shadow.blur}px ${shadow.color}`;
}

function glowToCss(glow: CaptionGlow): string {
  // Glow is represented as a spread text-shadow with opacity applied to color
  return `0 0 ${glow.blur}px ${hexToRgba(glow.color, glow.opacity)}`;
}

/** Converts a hex color and opacity into rgba(...) for CSS */
function hexToRgba(color: string, opacity: number): string {
  // If it's already rgb/rgba, just return it (can't easily inject opacity)
  if (color.startsWith("rgb")) {
    return color;
  }
  // Named colors and other non-hex values — return as-is
  if (!color.startsWith("#")) {
    return color;
  }
  // Try to parse hex
  const hex = color.replace("#", "");
  if (hex.length === 3 || hex.length === 6) {
    const full =
      hex.length === 3
        ? hex
            .split("")
            .map((c) => c + c)
            .join("")
        : hex;
    const r = parseInt(full.slice(0, 2), 16);
    const g = parseInt(full.slice(2, 4), 16);
    const b = parseInt(full.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${opacity})`;
  }
  return color;
}

// ---------------------------------------------------------------------------
// JS generation
// ---------------------------------------------------------------------------

function generateJs(model: CaptionModel): string {
  // Collect all segments across all groups in order
  const allSegments: Array<{ id?: string; text: string; start: number; end: number }> = [];
  for (const groupId of model.groupOrder) {
    const group = model.groups.get(groupId);
    if (!group) continue;
    for (const segId of group.segmentIds) {
      const seg = model.segments.get(segId);
      if (!seg) continue;
      allSegments.push({
        ...(seg.wordId ? { id: seg.wordId } : {}),
        text: seg.text,
        start: seg.start,
        end: seg.end,
      });
    }
  }

  const transcriptJson = JSON.stringify(allSegments, null, 2).replace(/</g, "\\u003c");

  const groupBlocks: string[] = [];

  for (const groupId of model.groupOrder) {
    const group = model.groups.get(groupId);
    if (!group) continue;

    const className = groupId.replace(/[^a-zA-Z0-9-_]/g, "-");

    // Compute group start/end from its segments
    const groupSegments = group.segmentIds
      .map((id) => model.segments.get(id))
      .filter((s): s is CaptionSegment => s !== undefined);

    if (groupSegments.length === 0) continue;

    const firstSeg = groupSegments[0];
    const lastSeg = groupSegments[groupSegments.length - 1];
    const groupStart = firstSeg.start;
    const groupEnd = lastSeg.end;

    const groupVar = className.replace(/[^a-zA-Z0-9_]/g, "_");

    // Build word spans
    const wordLines: string[] = groupSegments.map((seg) => {
      const escaped = JSON.stringify(seg.text).replace(/</g, "\\u003c");
      const segVar = `w_${seg.id.replace(/[^a-zA-Z0-9_]/g, "_")}`;
      const idLine = seg.wordId
        ? `\n  ${segVar}.id = ${JSON.stringify(seg.wordId).replace(/</g, "\\u003c")};`
        : "";
      return (
        `  const ${segVar} = document.createElement('span');` +
        `\n  ${segVar}.className = 'word clip';` +
        idLine +
        `\n  ${segVar}.textContent = ${escaped};` +
        `\n  ${segVar}.dataset.start = '${seg.start}';` +
        `\n  ${segVar}.dataset.end = '${seg.end}';` +
        `\n  groupEl_${groupVar}.appendChild(${segVar});`
      );
    });

    // Position: if x/y non-zero, use absolute with left/top; otherwise center
    const groupVarName = `groupEl_${groupVar}`;
    const hasExplicitPosition = group.style.x !== 0 || group.style.y !== 0;

    let positionLines: string;
    if (hasExplicitPosition) {
      positionLines = [
        `  ${groupVarName}.style.left = '${group.style.x}px';`,
        `  ${groupVarName}.style.top = '${group.style.y}px';`,
      ].join("\n");
    } else {
      positionLines = [
        `  ${groupVarName}.style.left = '50%';`,
        `  ${groupVarName}.style.top = '80%';`,
        `  ${groupVarName}.style.transform = 'translateX(-50%) translateY(-50%)';`,
        `  ${groupVarName}.style.justifyContent = 'center';`,
        `  ${groupVarName}.style.maxWidth = '90%';`,
      ].join("\n");
    }

    const block = [
      `// Group: ${groupId}`,
      `const ${groupVarName} = document.createElement('div');`,
      `${groupVarName}.className = 'caption-group clip ${className}';`,
      `${groupVarName}.dataset.start = '${groupStart}';`,
      `${groupVarName}.dataset.end = '${groupEnd}';`,
      `container.appendChild(${groupVarName});`,
      wordLines.join("\n"),
      positionLines,
      `// Entrance: fade in at group start`,
      `tl.to(${groupVarName}, { opacity: 1, duration: 0.2, ease: 'power2.out' }, ${groupStart});`,
      `// Exit: fade out at group end`,
      `tl.to(${groupVarName}, { opacity: 0, duration: 0.2, ease: 'power2.in' }, ${groupEnd} - 0.2);`,
    ].join("\n");

    groupBlocks.push(block);
  }

  return `(function () {
  const TRANSCRIPT = ${transcriptJson};

  const container = document.getElementById('captions-container');
  if (!container) return;

  const tl = gsap.timeline({ paused: true });

  ${groupBlocks.join("\n\n  ")}

  if (!window.__timelines) window.__timelines = {};
  window.__timelines["captions"] = tl;
})();`;
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function indent(text: string, spaces: number): string {
  const pad = " ".repeat(spaces);
  return text
    .split("\n")
    .map((line) => (line.trim() === "" ? "" : pad + line))
    .join("\n");
}
