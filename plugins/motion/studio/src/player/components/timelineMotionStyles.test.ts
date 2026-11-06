import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const studioCss = readFileSync(new URL("../../styles/components.css", import.meta.url), "utf8");
const themeCss = readFileSync(new URL("../../styles/theme.css", import.meta.url), "utf8");
const timelineOverlaySources = [
  "TimelineShortcutHint.tsx",
  "LayerDisclosureRow.tsx",
  "ImageThumbnail.tsx",
  "AudioWaveform.tsx",
  "VideoThumbnail.tsx",
].map((fileName) => readFileSync(new URL(`./${fileName}`, import.meta.url), "utf8"));
const timelineClipSource = readFileSync(new URL("./TimelineClip.tsx", import.meta.url), "utf8");
const playheadSource = readFileSync(new URL("./PlayheadIndicator.tsx", import.meta.url), "utf8");

function expectRule(css: string, selector: string): string {
  const selectorStart = css.indexOf(`${selector} {`);
  expect(selectorStart).toBeGreaterThanOrEqual(0);

  const bodyStart = css.indexOf("{", selectorStart);
  const bodyEnd = css.indexOf("}", bodyStart);
  expect(bodyStart).toBeGreaterThanOrEqual(0);
  expect(bodyEnd).toBeGreaterThan(bodyStart);

  return css.slice(bodyStart + 1, bodyEnd).trim();
}

function expectDeclaration(ruleBody: string, property: string): string {
  const declarationMatch = new RegExp(`${property}:\\s*([^;]+);`).exec(ruleBody);
  expect(declarationMatch?.[1]).toBeDefined();
  return declarationMatch?.[1].trim() ?? "";
}

function themeTokenValue(token: string): string {
  const match = new RegExp(`${token}:\\s*([^;]+);`).exec(themeCss);
  expect(match?.[1]).toBeDefined();
  return match?.[1].trim() ?? "";
}

describe("timeline motion styles", () => {
  it.each([
    ["--timeline-track-label", "var(--color-text-muted)"],
    ["--timeline-tick-text", "var(--color-text-2)"],
    ["--timeline-border-strong", "color-mix(in oklab, var(--color-text-0) 20%, transparent)"],
    ["--timeline-group-member-tint", "color-mix(in oklab, var(--color-text-0) 3.5%, transparent)"],
    ["--timeline-overlay-text", "var(--color-text-2)"],
    ["--timeline-playhead-glow", "color-mix(in oklab, var(--color-accent) 14%, transparent)"],
  ])("keeps the migrated default for %s", (token, expected) => {
    expect(themeTokenValue(token)).toBe(expected);
  });
  it("keeps clip motion reduced-motion gated and layout safe", () => {
    const mediaStart = studioCss.indexOf("@media (prefers-reduced-motion: no-preference)");
    expect(mediaStart).toBeGreaterThanOrEqual(0);

    const beforeMotionMedia = studioCss.slice(0, mediaStart);
    const baseTimelineClipRule = expectRule(beforeMotionMedia, ".timeline-clip");
    expect(baseTimelineClipRule).not.toContain("transition");

    const motionMediaCss = studioCss.slice(mediaStart);
    const timelineClipMotionRule = expectRule(motionMediaCss, ".timeline-clip");

    expect(expectDeclaration(timelineClipMotionRule, "transition")).toBe(
      "background-color var(--timeline-clip-hover-duration) ease-out",
    );
  });

  it("layers the active mint bloom through opacity instead of a gradient background swap", () => {
    const baseTimelineClipRule = expectRule(studioCss, ".timeline-clip");
    const timelineClipLabelRule = expectRule(studioCss, ".timeline-clip__label");
    const timelineClipTimecodeRule = expectRule(studioCss, ".timeline-clip__timecode");
    const audioClipRule = expectRule(studioCss, ".timeline-clip.is-audio");
    const audioClipHoverRule = expectRule(studioCss, ".timeline-clip.is-audio.is-hovered");
    const audioClipDraggingRule = expectRule(studioCss, ".timeline-clip.is-audio.is-dragging");
    const activeTimelineClipRule = expectRule(studioCss, ".timeline-clip[data-active]");
    const selectedTimelineClipRule = expectRule(
      studioCss,
      ".timeline-clip.is-selected,\n.timeline-clip[data-active].is-selected",
    );
    const bloomOverlayRule = expectRule(studioCss, ".timeline-clip::before");
    const activeBloomOverlayRule = expectRule(studioCss, ".timeline-clip[data-active]::before");

    expect(baseTimelineClipRule).toContain("background-color: var(--clip-bg)");
    expect(baseTimelineClipRule).toContain("border: 1px solid var(--clip-border)");
    expect(baseTimelineClipRule).toContain("box-shadow:");
    expect(baseTimelineClipRule).toContain("inset 0 1px 0 var(--timeline-clip-highlight)");
    expect(baseTimelineClipRule).toContain("var(--timeline-clip-shadow)");
    expect(timelineClipLabelRule).toContain("background: var(--timeline-clip-chip-bg)");
    expect(timelineClipLabelRule).toContain("color: var(--timeline-clip-chip-text)");
    expect(timelineClipLabelRule).toContain("text-overflow: ellipsis");
    expect(timelineClipLabelRule).toContain("max-width: calc(100% - 22px)");
    expect(timelineClipTimecodeRule).toContain("color: var(--timeline-tick-text)");
    expect(themeCss).toContain("--timeline-clip-label-shadow: 0 1px 2px rgba(0, 0, 0, 0.85)");
    expect(themeCss).toContain("--timeline-clip-selection-highlight: rgb(255 255 255 / 0.55)");
    expect(themeCss).toContain("--timeline-clip-radius: 12px");
    expect(themeCss).toContain("--timeline-clip-audio-radius: var(--timeline-clip-radius)");
    expect(themeCss).toContain("--timeline-clip-highlight: rgb(255 255 255 / 0.08)");
    expect(themeCss).toContain("--timeline-clip-shadow: 0 2px 6px rgb(0 0 0 / 0.3)");
    expect(themeCss).toContain("--timeline-clip-chip-bg: rgba(15, 22, 18, 0.73)");
    expect(themeCss).toContain("--timeline-clip-chip-audio-bg: rgba(25, 16, 38, 0.7)");
    expect(themeCss).toContain("--timeline-clip-chip-text: #ffffff");
    expect(themeCss).toContain("--timeline-clip-shadow: 0 2px 6px rgb(0 0 0 / 0.12)");
    expect(audioClipRule).toContain("background-color: var(--timeline-clip-audio-bg)");
    expect(audioClipRule).toContain("border-color: var(--timeline-clip-audio-border)");
    expect(audioClipHoverRule).toContain("background-color: var(--timeline-clip-audio-bg-hover)");
    expect(audioClipDraggingRule).toContain("var(--timeline-clip-audio-bg-dragging)");
    expect(selectedTimelineClipRule).toContain("outline: 1px solid var(--timeline-clip-selection)");
    expect(selectedTimelineClipRule).toContain("outline-offset: 0");
    expect(activeTimelineClipRule).not.toContain("background: linear-gradient");
    expect(activeTimelineClipRule).toContain("border-color: var(--clip-border-active)");
    expect(activeTimelineClipRule).not.toContain("box-shadow");
    expect(bloomOverlayRule).toContain("background: var(--clip-bg-active)");
    expect(bloomOverlayRule).not.toContain("linear-gradient");
    expect(bloomOverlayRule).toContain("opacity: 0");
    expect(activeBloomOverlayRule).toContain("opacity: 1");
  });

  it("routes timeline overlay colours through theme tokens", () => {
    const overlaySource = timelineOverlaySources.join("\n");

    expect(overlaySource).toContain("var(--timeline-shortcut-bg)");
    expect(overlaySource).toContain("var(--timeline-thumbnail-shimmer)");
    expect(overlaySource).toContain("var(--timeline-thumbnail-label-gradient)");
    expect(overlaySource).toContain("var(--timeline-thumbnail-label-shadow)");
    expect(overlaySource).toContain('"--timeline-waveform-bar-rgb"');
    expect(overlaySource).toContain("var(--timeline-waveform-error)");
    expect(overlaySource).toContain("var(--timeline-waveform-label-shadow)");
    expect(overlaySource).toContain("var(--timeline-text-solid)");
    expect(overlaySource).toContain("var(--timeline-accent)");
  });

  it("targets trim handle bars without changing drag geometry", () => {
    const handleClassMatches = timelineClipSource.match(/className="timeline-clip__handle-bar"/g);

    expect(handleClassMatches).toHaveLength(2);
    expect(timelineClipSource).toContain('transform: isDragging ? "translateY(-1px)" : undefined');
    expect(timelineClipSource).not.toContain("scale(");
  });

  it("keeps the playhead polish static, without transition-driven positioning", () => {
    expect(playheadSource).toContain("boxShadow");
    expect(playheadSource).toContain("rotate(45deg)");
    expect(playheadSource).not.toContain("transition");
  });
});
