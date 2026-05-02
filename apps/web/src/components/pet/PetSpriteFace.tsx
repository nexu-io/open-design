import { useEffect, useState, type CSSProperties } from 'react';
import type { PetAtlasRowDef } from '../../types';
import type { ResolvedPet } from './pets';

interface Props {
  active: ResolvedPet;
  className?: string;
  // Optional explicit pixel size; the overlay leaves it unset and
  // inherits container metrics, while the rail / settings preview
  // pin a concrete size to keep the cell shape consistent.
  size?: number;
  // Atlas-mode only — which row id (e.g. `idle`, `waving`, `running-right`)
  // to play right now. Defaults to `idle` (or the first row, when the
  // atlas does not declare an idle row). Ignored for emoji / strip pets.
  rowId?: string;
}

// Renders the pet's face. Four cases:
//
//   1. No imageUrl — just the emoji glyph (legacy / built-ins).
//   2. imageUrl + atlas — the full Codex 8x9 sprite atlas. We pick the
//      requested row by index and step through that row's frames at
//      the row's per-second fps. Mirrors the `codex-pets-react`
//      `SpriteAnimator` behaviour so different interactions (idle,
//      waving, running-*) play the right row of the atlas.
//   3. imageUrl + frames > 1 — legacy horizontal spritesheet (one row
//      cropped out). Walked through with a CSS `steps()` animation.
//   4. imageUrl + frames === 1 — single static image.
export function PetSpriteFace({ active, className, size, rowId }: Props) {
  if (!active.imageUrl) {
    const style: CSSProperties | undefined = size
      ? { fontSize: Math.round(size * 0.85), width: size, height: size, lineHeight: 1 }
      : undefined;
    return (
      <span className={className} aria-hidden style={style}>
        {active.glyph}
      </span>
    );
  }

  if (active.atlas && active.atlas.rowsDef.length > 0) {
    return (
      <AtlasSprite
        imageUrl={active.imageUrl}
        cols={Math.max(1, active.atlas.cols)}
        rows={Math.max(1, active.atlas.rows)}
        rowsDef={active.atlas.rowsDef}
        rowId={rowId}
        className={className}
        size={size}
      />
    );
  }

  const frames = Math.max(1, active.frames ?? 1);
  const fps = Math.max(1, active.fps ?? 6);
  if (frames === 1) {
    return (
      <span
        className={`${className ?? ''} pet-image static`.trim()}
        aria-hidden
        style={{
          backgroundImage: `url(${active.imageUrl})`,
          width: size,
          height: size,
        }}
      />
    );
  }
  // Strip mode — N frames laid out horizontally. The image is
  // (N × container_width) wide, so the visible frame is selected by
  // sliding background-position-x from 0% to 100% in (N-1) steps.
  // `steps(N, jump-none)` is required because the default jump-end
  // would land on 0/N, 1/N, …, (N-1)/N, which slices each frame mid-cell;
  // jump-none lands on the actual cell boundaries 0/(N-1) … 1.
  const durationMs = Math.round((frames / fps) * 1000);
  return (
    <span
      className={`${className ?? ''} pet-image frames`.trim()}
      aria-hidden
      style={{
        backgroundImage: `url(${active.imageUrl})`,
        backgroundSize: `${frames * 100}% 100%`,
        animation: `pet-frames ${durationMs}ms steps(${frames}, jump-none) infinite`,
        width: size,
        height: size,
      }}
    />
  );
}

interface AtlasSpriteProps {
  imageUrl: string;
  cols: number;
  rows: number;
  rowsDef: PetAtlasRowDef[];
  rowId?: string;
  className?: string;
  size?: number;
}

// Atlas renderer. Drives the frame index from JS instead of a CSS
// `steps()` animation — sidesteps the jump-end vs jump-none footgun
// and makes per-row fps trivial to swap when the parent flips the
// `rowId` prop (idle ↔ waving ↔ running-*).
function AtlasSprite({
  imageUrl,
  cols,
  rows,
  rowsDef,
  rowId,
  className,
  size,
}: AtlasSpriteProps) {
  const def =
    rowsDef.find((r) => r.id === rowId)
    ?? rowsDef.find((r) => r.id === 'idle')
    ?? rowsDef[0]!;
  const rowFrames = Math.max(1, def.frames);
  const fps = Math.max(1, def.fps);

  const [frame, setFrame] = useState(0);
  // Reset to frame 0 on row change so a freshly-triggered animation
  // (e.g. tap → waving) starts cleanly instead of mid-cycle.
  useEffect(() => {
    setFrame(0);
    if (rowFrames <= 1) return;
    const intervalMs = Math.max(16, Math.round(1000 / fps));
    const id = window.setInterval(() => {
      setFrame((f) => (f + 1) % rowFrames);
    }, intervalMs);
    return () => window.clearInterval(id);
  }, [def.id, def.index, rowFrames, fps]);

  // Background math:
  //   - background-size = (cols × 100%) × (rows × 100%)
  //     → each grid cell renders at exactly the container size.
  //   - background-position-x = frame / (cols - 1) × 100%
  //     → 0% slides to the leftmost cell, 100% to the rightmost,
  //       intermediate cells land at frame/(cols-1) of the offset range.
  //   - background-position-y = rowIndex / (rows - 1) × 100%
  const xPct = cols > 1 ? (frame / (cols - 1)) * 100 : 0;
  const yPct = rows > 1 ? (def.index / (rows - 1)) * 100 : 0;

  return (
    <span
      className={`${className ?? ''} pet-image atlas`.trim()}
      aria-hidden
      style={{
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: `${xPct}% ${yPct}%`,
        width: size,
        height: size,
      }}
    />
  );
}
