import { parseCssColor } from "../../components/editor/colorValue";
import type { TimelineText } from "../store/timelineElement";

/** The layer's own background, or a strip the text reads on: light behind dark text, dark otherwise. */
export function textClipBackground(text: TimelineText): string {
  if (text.background) return text.background;
  const color = parseCssColor(text.color ?? "");
  const light = color ? 0.2126 * color.red + 0.7152 * color.green + 0.0722 * color.blue : 255;
  return light < 128 ? "var(--timeline-text-clip-light-bg)" : "var(--timeline-text-clip-dark-bg)";
}

/** A text layer's row: its own words in its own font and colour, live, on one clipped line. */
export function TextClipContent({ text }: { text: TimelineText }) {
  return (
    <div
      className="absolute inset-0 flex items-center overflow-hidden px-2"
      style={{ background: textClipBackground(text) }}
    >
      <span
        className="whitespace-nowrap text-[15px] leading-none"
        style={{ fontFamily: text.fontFamily, fontWeight: text.fontWeight, color: text.color }}
      >
        {text.value}
      </span>
    </div>
  );
}
