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
  const renderSize = size ? Math.max(1, Math.round(size)) : undefined;
  if (frames === 1) {
    return (
      <span
        className={`${className ?? ''} pet-image static`.trim()}
        aria-hidden
        style={{
          backgroundImage: `url(${active.imageUrl})`,
          width: renderSize,
          height: renderSize,
        }}
      />
    );
  }
  // Strip mode — N frames laid out horizontally. When the parent passes
  // a concrete pixel `size`, we also pin the background sheet to exact
  // pixel dimensions so Retina browsers step whole cells instead of
  // percentage-derived subpixels.
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
        backgroundPosition: '0px 0px',
        backgroundSize: renderSize
          ? `${frames * renderSize}px ${renderSize}px`
          : `${frames * 100}% 100%`,
        ['--pet-frames-end-x' as string]: renderSize
          ? `-${(frames - 1) * renderSize}px`
          : '100%',
        animation: `pet-frames ${durationMs}ms steps(${frames}, jump-none) infinite`,
        width: renderSize,
        height: renderSize,
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
  const renderSize = size ? Math.max(1, Math.round(size)) : undefined;

  const [animationCycle, setAnimationCycle] = useState(0);

  // Reset atlas playback on row change so a freshly-triggered
  // interaction starts from frame 0, but keep the per-frame stepping in
  // CSS. That removes a React state update on every frame tick.
  useEffect(() => {
    setAnimationCycle((value) => value + 1);
  }, [def.id, def.index, rowFrames, fps]);

  // Background math:
  //   - when `size` is known, background-size/background-position use
  //     exact pixels so each atlas cell stays on integer boundaries.
  //   - fallback percentage math is kept for callers that only inherit
  //     container dimensions.
  const endXPct = cols > 1 ? ((rowFrames - 1) / (cols - 1)) * 100 : 0;
  const yPct = rows > 1 ? (def.index / (rows - 1)) * 100 : 0;
  const endXPx = renderSize ? (rowFrames - 1) * renderSize : null;
  const rowYPx = renderSize ? def.index * renderSize : null;
  const durationMs = Math.max(1, Math.round((rowFrames / fps) * 1000));

  return (
    <span
      key={`${def.id}:${def.index}:${animationCycle}`}
      className={`${className ?? ''} pet-image atlas`.trim()}
      aria-hidden
      style={{
        backgroundImage: `url(${imageUrl})`,
        backgroundSize: renderSize
          ? `${cols * renderSize}px ${rows * renderSize}px`
          : `${cols * 100}% ${rows * 100}%`,
        backgroundPosition: renderSize ? `0px -${rowYPx}px` : `0% ${yPct}%`,
        ['--pet-atlas-end-x' as string]: endXPx != null ? `-${endXPx}px` : `${endXPct}%`,
        animation:
          rowFrames > 1
            ? `pet-atlas-frames ${durationMs}ms steps(${rowFrames}, jump-none) infinite`
            : 'none',
        width: renderSize,
        height: renderSize,
      }}
    />
  );
}
