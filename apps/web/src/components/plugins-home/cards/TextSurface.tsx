// Fallback preview surface — used by scenario plugins without any
// declared preview material (no `od.preview`, no example outputs).
//
// We render a typographic patch with the plugin's first-letter
// glyph centered over a soft gradient. Visually quiet so it
// recedes next to media-rich tiles in the same grid.

interface Props {
  pluginTitle: string;
}

export function TextSurface({ pluginTitle }: Props) {
  const trimmed = pluginTitle.trim();
  const glyph = (trimmed.codePointAt(0) ?? 0x2022) === 0x2022
    ? '·'
    : String.fromCodePoint(trimmed.codePointAt(0) ?? 0x2022).toUpperCase();

  return (
    <div className="plugins-home__text-surface" aria-hidden>
      <span className="plugins-home__text-glyph">{glyph}</span>
    </div>
  );
}
