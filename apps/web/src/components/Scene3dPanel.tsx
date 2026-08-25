'use client';

// The scene compile surface.
//
// This panel is for ONE scene: it hydrates from that scene's manifest and
// its primary action recompiles it. Kit pages (live WebGL viewports) do NOT
// come here — their sidecars say `renderer: "html"`, so they draw through
// HtmlViewer with the scene3d-gated toolbar. Kind decides the chrome,
// renderer decides the surface.
//
// The chrome is host-native. The asset label, the counts, the verdict, and
// the export menu used to live inside the generated HTML page, which capped
// how well-integrated a compiled asset could be at "as good as an iframe".
// Rendering them as a real viewer gives the deliverable the same toolbar
// grammar as every other file in the app, and lets the generated page go
// back to being just the picture.

import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react';
import { Button, VisuallyHidden } from '@open-design/components';
import {
  buildPartTreeLayout,
  primPaths,
  scene3dIssueTitle,
  type Scene3dArtifactRef,
  type Scene3dAssetKind,
  type Scene3dIssue,
  type Scene3dManifest,
  type Scene3dSelectionPart,
  type Scene3dTreeNodeInput,
  type Scene3dTreeRow,
} from '@open-design/contracts';
import { useT } from '../i18n';
import {
  displayFrames,
  sortIssuesBySeverity,
  useScene3dCompile,
} from '../hooks/useScene3dCompile';
import {
  assetKindLabelKey,
  modelRowFromRefs,
  pickProofPart,
  proofRectToStage,
  proofViewport,
  resolveAssetKind,
  totalTriangles,
} from '../runtime/scene3d-assets';
import { decodeIdMap, idMapUrlFor, renderXrayComposite } from '../runtime/scene3d-xray';
import {
  getScene3dSelection,
  getScene3dSelectionServerSnapshot,
  setScene3dSelection,
  subscribeScene3dSelection,
} from '../runtime/scene3d-selection';
import type { ProjectFile } from '../types';
import { Icon } from './Icon';
import styles from './Scene3dPanel.module.css';

export interface Scene3dPanelProps {
  projectId: string;
  /** Project-relative scene directory; the project root by default. */
  scenePath?: string;
  /** The file that opened this panel, when one did. Used for the title. */
  file?: ProjectFile;
}

const SEVERITY_CLASS: Record<string, string> = {
  error: styles.severityError!,
  warning: styles.severityWarning!,
  info: styles.severityInfo!,
};

export function Scene3dPanel({ projectId, scenePath = '.', file }: Scene3dPanelProps) {
  return <Scene3dScenePanel projectId={projectId} scenePath={scenePath} file={file} />;
}

/* ------------------------------------------------------------------ */
/* Shared toolbar pieces                                               */
/* ------------------------------------------------------------------ */

/**
 * What the compile produced, as a drawn glyph rather than a word. The
 * toolbar is a single line and "ANIMATION" spent thirty percent of it
 * restating what the icon can say in 26px; the word survives as the
 * tooltip and the accessible name. Each glyph strokes itself in on mount
 * and carries a small idle so the chip reads as alive, not printed —
 * both retire under prefers-reduced-motion (see the module css).
 */
export function KindGlyphArt({ kind }: { kind: Scene3dAssetKind }) {
  const s = {
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  switch (kind) {
    case 'animation':
      return (
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <circle className={styles.glyphStroke} cx="8" cy="8" r="6.2" />
          <path className={styles.glyphBeat} d="M6.7 5.7l4 2.3-4 2.3z" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'prop':
      return (
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <path className={styles.glyphStroke} d="M8 1.9 13.5 5v6L8 14.1 2.5 11V5z" />
          <path className={styles.glyphStroke} d="M2.5 5 8 8.1 13.5 5M8 8.1v6" />
        </svg>
      );
    case 'kit':
      return (
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <rect className={styles.glyphStroke} x="2" y="9" width="5" height="5" rx="1" />
          <rect className={styles.glyphStroke} x="9" y="9" width="5" height="5" rx="1" />
          <rect className={styles.glyphStroke} x="5.5" y="2" width="5" height="5" rx="1" />
        </svg>
      );
    case 'texture':
      return (
        /* A checker, not a grid: two filled diagonal cells keep it apart
           from the sprite sheet's four-cell atlas at toolbar size. */
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <rect className={styles.glyphStroke} x="2" y="2" width="12" height="12" rx="2" />
          <rect className={styles.glyphShimmer} x="2.9" y="2.9" width="5.1" height="5.1" fill="currentColor" stroke="none" />
          <rect className={styles.glyphShimmer} x="8" y="8" width="5.1" height="5.1" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'skybox':
      return (
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <circle className={styles.glyphStroke} cx="8" cy="8" r="6.2" />
          <path className={styles.glyphStroke} d="M2 9.6c2-1.5 4-1.5 6 0s4 1.5 6 0" />
          <circle className={styles.glyphSun} cx="10.4" cy="5.4" r="1.4" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'sprite':
      return (
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <rect className={styles.glyphStroke} x="2" y="2" width="12" height="12" rx="2" />
          <path className={styles.glyphStroke} d="M8 2v12M2 8h12" />
          <rect className={styles.glyphHop} x="3.6" y="3.6" width="3" height="3" rx="0.8" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'flipbook':
      return (
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <rect className={styles.glyphStroke} x="2.5" y="3" width="11" height="10" rx="1.5" />
          <path className={styles.glyphStroke} d="M8 3v10" />
          <path className={styles.glyphFlip} d="M8 3c2.5 0.5 4 1.5 5 3V4.5c-1-1-2.8-1.5-5-1.5" fill="currentColor" stroke="none" />
        </svg>
      );
    case 'vfx':
      return (
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <path className={styles.glyphTwinkle} d="M8 1.8v3.4M8 10.8v3.4M1.8 8h3.4M10.8 8h3.4" />
          <path className={`${styles.glyphTwinkle} ${styles.glyphTwinkleLate}`} d="M4 4l1.8 1.8M10.2 10.2 12 12M12 4l-1.8 1.8M5.8 10.2 4 12" />
        </svg>
      );
    case 'scene':
    default:
      return (
        /* A cube over a turntable dish — the same visual sentence as the
           shared `scene3d` icon (Icon.tsx) the home hero uses, so "a 3D
           scene" is drawn one way everywhere in the app. */
        <svg viewBox="0 0 16 16" width="15" height="15" {...s}>
          <ellipse className={styles.glyphStroke} cx="8" cy="12.2" rx="5.9" ry="1.8" />
          <path className={styles.glyphStroke} d="M8 2.2 12.1 4.5v4L8 10.9 3.9 8.5v-4z" />
          <path className={styles.glyphStroke} d="M3.9 4.5 8 6.9l4.1-2.4M8 6.9v4" />
        </svg>
      );
  }
}

function KindBadge({ kind }: { kind: Scene3dAssetKind }) {
  const t = useT();
  const label = t(assetKindLabelKey(kind));
  return (
    <span className={styles.kindGlyph} title={label} role="img" aria-label={label}>
      <KindGlyphArt kind={kind} />
    </span>
  );
}

/**
 * The verdict as marks, not a sentence: a green check when clean, a
 * count-carrying error/warning mark otherwise. The full sentence the chip
 * used to spell out is the tooltip and the accessible name, so nothing is
 * lost — the toolbar just stops paying a sentence for what a mark says.
 */
function VerdictChip({ errors, warnings }: { errors: number; warnings: number }) {
  const t = useT();
  const ok = errors === 0;
  const label = ok
    ? t('scene3d.verdictClean', { warnings })
    : t('scene3d.verdictFailed', { errors, warnings });
  return (
    <span className={styles.verdictMarks} title={label} role="img" aria-label={label}>
      {ok ? (
        <span className={`${styles.verdictMark} ${styles.verdictPass}`}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.4" />
            <path className={styles.verdictTick} d="M5.2 8.3l1.9 1.9 3.7-4" />
          </svg>
        </span>
      ) : (
        <span className={`${styles.verdictMark} ${styles.verdictFail}`}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="8" cy="8" r="6.4" />
            <path d="M5.8 5.8l4.4 4.4M10.2 5.8l-4.4 4.4" />
          </svg>
          <span className={styles.verdictCount}>{errors}</span>
        </span>
      )}
      {warnings > 0 ? (
        <span className={`${styles.verdictMark} ${styles.verdictWarn}`}>
          <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
            <path d="M8 2.2 14.4 13H1.6z" />
            <path d="M8 6.6v3M8 11.6v.01" />
          </svg>
          <span className={styles.verdictCount}>{warnings}</span>
        </span>
      ) : null}
    </span>
  );
}

/** 4048 → "4.0k": the toolbar shows magnitude; the tooltip keeps the digits. */
function compactCount(value: number): string {
  if (value < 1000) return String(value);
  if (value < 10000) return `${(value / 1000).toFixed(1)}k`;
  if (value < 1000000) return `${Math.round(value / 1000)}k`;
  return `${(value / 1000000).toFixed(1)}M`;
}

/**
 * The claims ledger's payoff, mirroring the kit page's rule exactly: the
 * badge appears ONLY when the scene declared claims and none failed. A
 * partial/failed ledger shows nothing — the badge cannot be cheapened, and a
 * failed claim already surfaces as an E-701 in the issue list. This is the
 * differentiator that was computed into every manifest yet drawn nowhere in
 * the app's own compile panel.
 */
function ProvenBadge({ claims }: { claims?: { declared: number; failed: number } }) {
  const t = useT();
  if (!claims || claims.declared <= 0 || claims.failed !== 0) return null;
  const label = t('scene3d.claimsProven', { count: claims.declared });
  return (
    /* Same mark grammar as the verdict — a drawn shield with the count —
       so the toolbar speaks one visual language. The appearance rule is
       unchanged and non-negotiable: declared > 0 and zero failures, or
       nothing at all. */
    <span
      className={`${styles.verdictMark} ${styles.provenBadge}`}
      title={label}
      role="img"
      aria-label={label}
    >
      <svg viewBox="0 0 16 16" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
        <path d="M8 1.8l4.8 1.8v3.4c0 3-1.9 5.4-4.8 6.7-2.9-1.3-4.8-3.7-4.8-6.7V3.6z" />
        <path className={styles.verdictTick} d="M5.7 8l1.7 1.7 3-3.4" />
      </svg>
      <span className={styles.verdictCount}>{claims.declared}</span>
    </span>
  );
}

/** World extent as `W × H × D m`, at millimetre precision — pure numbers and
 *  a unit symbol, so no translated string. */
function formatWorldSize(size: [number, number, number] | null | undefined): string | null {
  if (!size) return null;
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  return `${n(size[0])} × ${n(size[1])} × ${n(size[2])} m`;
}

/** The same three numbers split out, so the toolbar can colour each axis
 *  with the kit gizmo's own palette (X red, Y green, Z blue) — the readout
 *  and the manipulator then speak one colour language. */
function dimStrings(size: [number, number, number]): [string, string, string] {
  const n = (v: number) => String(Math.round(v * 1000) / 1000);
  return [n(size[0]), n(size[1]), n(size[2])];
}

/** The domain a code belongs to, as its severity letter + two-digit decade
 *  (`S3D-E-324` → `E32`). Codes sort into these groups for free; this only
 *  detects the boundary between them. */
function issueDomain(code: string): string {
  return `${code.slice(4, 5)}${code.slice(6, 8)}`;
}

/**
 * The export menu: the scene's name once, its formats as direct links.
 * Same presentation as the host Export menu's model rows, because a
 * compiled file named `scene.glb` says nothing on its own — the label
 * carries the identity and the `download` name (`<scene>.<ext>`) keeps
 * saved files from colliding.
 */
function ExportMenu({ label, refs }: { label: string; refs: readonly Scene3dArtifactRef[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const row = useMemo(() => modelRowFromRefs(label, refs), [label, refs]);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  // Pointerdown rather than click so the menu closes on the same gesture that
  // starts an interaction elsewhere, matching the app's other toolbar menus.
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = (event: PointerEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown, true);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown, true);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  return (
    <div className={styles.exportWrap} ref={wrapRef}>
      <button
        type="button"
        className={styles.exportTrigger}
        aria-haspopup="menu"
        aria-expanded={open}
        disabled={row === null}
        {...(row === null ? { title: t('scene3d.exportEmpty') } : {})}
        onClick={() => setOpen((current) => !current)}
      >
        <Icon name="download" size={14} />
        <span>{t('scene3d.exportMenu')}</span>
      </button>
      {open && row !== null ? (
        <div className={styles.exportMenu} role="menu">
          <div className={styles.exportRow}>
            <span className={styles.exportRowName} title={row.label}>
              {row.label}
            </span>
            <span className={styles.exportRowFormats}>
              {row.items.map((item) => (
                <a
                  key={item.ref.path}
                  className={styles.exportFormat}
                  role="menuitem"
                  href={item.ref.url}
                  download={item.downloadName}
                  title={item.downloadName}
                  onClick={() => setOpen(false)}
                >
                  {item.ext.toUpperCase()}
                </a>
              ))}
            </span>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Scene                                                               */
/* ------------------------------------------------------------------ */

function Scene3dScenePanel({
  projectId,
  scenePath,
  file,
}: {
  projectId: string;
  scenePath: string;
  file?: ProjectFile;
}) {
  const t = useT();
  const { result, stored, compiling, loading, error, compile } = useScene3dCompile(
    projectId,
    scenePath,
  );

  const frames = useMemo(() => displayFrames(result, stored), [result, stored]);
  const manifest: Scene3dManifest | null = result?.manifest ?? stored?.manifest ?? null;
  const issues = useMemo(() => sortIssuesBySeverity(result?.issues ?? []), [result]);
  // Sorted by code so equal domains sit together (severity + decade order for
  // free); the render inserts a hairline where the domain changes.
  const groupedIssues = useMemo(
    () => [...issues].sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)),
    [issues],
  );
  const worldSize = useMemo(() => formatWorldSize(manifest?.metrics?.worldSize), [manifest]);
  const blenderVersion = manifest?.blender?.version ?? null;
  // Stored manifests carry the finding CODES but not the messages; showing
  // the codes keeps "1 warning(s)" in the toolbar from pointing at an empty
  // section, and the hint says where the full sentences come from.
  const storedIssueCodes = !result ? (stored?.manifest?.issueCodes ?? []) : [];
  const assets = result?.exportedAssets ?? stored?.exportedAssets ?? [];
  const assetKind = useMemo(() => resolveAssetKind(manifest), [manifest]);
  const triangles = totalTriangles(manifest);
  /* One sentence serves the meta row's tooltip AND its accessible name —
     a title alone never reaches touch users or most screen readers, and
     without it the row reads as three bare numbers. */
  const metaSentence = useMemo(() => {
    if (!manifest || manifest.partTree.length === 0) return '';
    return [
      t('scene3d.partsCount', { count: manifest.partTree.length }),
      triangles !== null ? t('scene3d.trisCount', { count: triangles }) : null,
      formatWorldSize(manifest.metrics?.worldSize),
      manifest.blender?.version
        ? t('scene3d.blenderVersion', { version: manifest.blender.version })
        : null,
    ]
      .filter(Boolean)
      .join(' · ');
  }, [manifest, triangles, t]);

  /**
   * A stored manifest is evidence the scene HAS compiled — it only exists
   * because a compile wrote it. Reading the verdict only off a live result
   * made a panel showing a full part tree and eight proof frames still
   * claim "never compiled", which contradicts everything beside it.
   */
  const verdict = result
    ? { ok: result.ok, ...result.summary }
    : stored?.manifest
      ? { ok: stored.manifest.issues.errors === 0, ...stored.manifest.issues }
      : null;

  const [frameIndex, setFrameIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  // Drag-to-rotate: the proof frames are a turntable, so a horizontal drag
  // over the picture scrubs the orbit — the same gesture the kit viewport
  // answers with. The slider stays as the precise/a11y control.
  const stageRef = useRef<HTMLDivElement | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startFrame: number; pxPerFrame: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hasRotated, setHasRotated] = useState(false);

  /* Screen-space plumbing for on-picture selection. The runner projected
     every part through the render camera and shipped per-frame rects
     (manifest.proofRects); what remains here is the viewport transform —
     the same split the kit runtime makes between worldToScreen and its
     canvas. stageSize feeds it; hoverPart is the pre-highlight; downRef
     tells a click apart from a drag. */
  const [stageSize, setStageSize] = useState<{ w: number; h: number } | null>(null);
  const [hoverPart, setHoverPart] = useState<string | null>(null);
  const downRef = useRef<{ x: number; y: number; shift: boolean } | null>(null);
  const frameRects = manifest?.proofRects?.[frameIndex];

  useEffect(() => {
    const el = stageRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(() =>
      setStageSize({ w: el.clientWidth, h: el.clientHeight }),
    );
    observer.observe(el);
    setStageSize({ w: el.clientWidth, h: el.clientHeight });
    return () => observer.disconnect();
  }, []);


  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const timer = window.setInterval(
      () => setFrameIndex((current) => (current + 1) % frames.length),
      110,
    );
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  // A fresh compile replaces the turntable, so playback restarts against the
  // new frame set — and an ANIMATION starts playing on its own. The proof
  // frames of an animated scene sample the clip, and a player that labels an
  // asset "animation" while showing a frozen pose is the label lying; every
  // other kind stays still until asked, because a spinning prop is noise.
  useEffect(() => {
    setPlaying(assetKind === 'animation' && frames.length > 1);
  }, [frames.length, scenePath, assetKind]);
  // A recompile can change the frame count; clamping here keeps the scrubber
  // from pointing past the end of a shorter turntable.
  useEffect(() => {
    setFrameIndex((current) => (current < frames.length ? current : 0));
  }, [frames.length]);

  const preloadedRef = useRef<Set<string>>(new Set());
  useEffect(() => {
    // Preload so dragging the scrubber never flashes an empty frame.
    if (typeof window === 'undefined') return;
    for (const src of frames) {
      if (preloadedRef.current.has(src)) continue;
      preloadedRef.current.add(src);
      const image = new window.Image();
      image.src = src;
    }
  }, [frames]);

  const currentFrame = frames[frameIndex];
  const compiled = Boolean(result || stored?.manifest);
  const rotatable = frames.length > 1;

  const wrapFrame = (index: number) =>
    ((index % frames.length) + frames.length) % frames.length;

  const onStagePointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    if (event.button !== 0) return;
    // Recorded before the rotatable gate: a single still cannot rotate but
    // its parts are still clickable.
    downRef.current = { x: event.clientX, y: event.clientY, shift: event.shiftKey };
    if (!rotatable) return;
    const width = stageRef.current?.clientWidth ?? 600;
    // One full revolution over ~65% of the stage width: direct enough to
    // feel attached to the cursor, coarse enough that a frame lands where
    // the drag stops instead of jittering between neighbours.
    const pxPerFrame = Math.max(10, (width * 0.65) / frames.length);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startFrame: frameIndex,
      pxPerFrame,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
    setPlaying(false);
    setDragging(true);
  };

  const onStagePointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || event.pointerId !== drag.pointerId) {
      // Not dragging: pre-highlight the part under the cursor, the same
      // "what am I about to click" answer the kit viewport gives. Skipped
      // while playing — a box chasing a moving picture reads as glitch.
      if (frameRects && !playing && stageRef.current) {
        const bounds = stageRef.current.getBoundingClientRect();
        const name = pickProofPart(
          frameRects,
          proofViewport(bounds.width, bounds.height),
          event.clientX - bounds.left,
          event.clientY - bounds.top,
        );
        setHoverPart(name);
      }
      return;
    }
    const steps = Math.round((event.clientX - drag.startX) / drag.pxPerFrame);
    if (steps !== 0) setHasRotated(true);
    setFrameIndex(wrapFrame(drag.startFrame + steps));
  };

  const onStagePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    const down = downRef.current;
    downRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
    /* A press that never travelled is a pick: resolve the click through
       the same transform the reticle draws with, and mirror the kit
       viewport's grammar — click selects, shift-click toggles into the
       set, empty space clears. A scene compiled before rects existed has
       no frameRects and the click stays a no-op rather than a surprise. */
    if (!down || event.button !== 0) return;
    if (Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) return;
    if (!frameRects || !stageRef.current) return;
    const bounds = stageRef.current.getBoundingClientRect();
    const name = pickProofPart(
      frameRects,
      proofViewport(bounds.width, bounds.height),
      event.clientX - bounds.left,
      event.clientY - bounds.top,
    );
    const current = new Set(selectionState.selected);
    let next: string[];
    if (name === null) {
      next = [];
    } else if (down.shift) {
      if (current.has(name)) current.delete(name);
      else current.add(name);
      next = [...current];
    } else {
      next = current.has(name) && selectionState.selected.length === 1 ? [] : [name];
    }
    setScene3dSelection(assetName, scenePath, allSelectionParts, next);
  };

  const onStagePointerCancel = (event: React.PointerEvent<HTMLDivElement>) => {
    downRef.current = null;
    if (dragRef.current?.pointerId === event.pointerId) {
      dragRef.current = null;
      setDragging(false);
    }
  };
  const assetName = useMemo(() => {
    const segments = scenePath.split('/').filter((segment) => segment && segment !== '.');
    return segments[segments.length - 1] ?? file?.name ?? '';
  }, [scenePath, file?.name]);

  const treeInput = useMemo((): Scene3dTreeNodeInput[] => {
    if (!manifest || !manifest.partTree) return [];
    const keyframed = new Set(manifest.animation?.keyframedObjects ?? []);
    const hasTextures =
      (manifest.textures?.length ?? 0) > 0 ||
      (manifest.materials?.some((m) => m.hasTexture) ?? false);

    return manifest.partTree.map((part) => {
      let glyphs = '';
      if (keyframed.has(part.name)) glyphs += 'a';
      if (part.mesh && part.mesh.faces > 0) glyphs += 'w';
      if (hasTextures && part.mesh) glyphs += 'x';

      return {
        name: part.name,
        parent: part.parent,
        type: part.type,
        mesh: part.mesh,
        glyphs: glyphs || undefined,
      };
    });
  }, [manifest]);

  const treeRows = useMemo(() => buildPartTreeLayout(treeInput), [treeInput]);

  const selectionState = useSyncExternalStore(
    subscribeScene3dSelection,
    getScene3dSelection,
    getScene3dSelectionServerSnapshot,
  );
  const selectedPartsSet = useMemo(
    () => new Set(selectionState.selected),
    [selectionState.selected],
  );

  /* A pick on the picture answers in the rail too: the selected part's row
     slides into view (nearest, so an already-visible row never jumps the
     scroll). Scoped to this panel's own rail, not the document. */
  const sideRef = useRef<HTMLElement | null>(null);
  useEffect(() => {
    const first = selectionState.selected[0];
    if (!first || !sideRef.current) return;
    sideRef.current
      .querySelector(`[data-s3d-part-row="${CSS.escape(first)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [selectionState.selected]);

  /* The x-ray energize — the kit's spectral pass applied to the clicked
     part's exact visible pixels. The runner rendered an object-index map
     beside every frame; decoding it gives per-pixel part codes, and
     scene3d-xray.ts (a constant-for-constant port of the kit shader's
     spectral pass) composes the full-energize image. The canvas then
     crossfades over the real frame with the kit's own 200ms-in/140ms-out
     ease-out-cubic — opacity IS the front pass's uXray. */
  const idParts = manifest?.proofIdParts;
  const xrayCapable = Boolean(idParts && idParts.length > 0);
  const xrayCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const xrayCacheRef = useRef<{
    key: string;
    frames: Map<number, { beauty: ImageData; codes: Uint16Array } | 'error'>;
  }>({ key: '', frames: new Map() });
  const [xrayOn, setXrayOn] = useState(false);

  const selectedCodes = useMemo(() => {
    if (!idParts) return null;
    const set = new Set<number>();
    for (const name of selectionState.selected) {
      const index = idParts.indexOf(name);
      if (index >= 0) set.add(index + 1);
    }
    return set;
  }, [idParts, selectionState.selected]);

  useEffect(() => {
    if (!xrayCapable || !selectedCodes || selectedCodes.size === 0) {
      setXrayOn(false);
      return undefined;
    }
    const url = frames[frameIndex];
    if (!url) return undefined;
    const cache = xrayCacheRef.current;
    const cacheKey = frames.join('|');
    if (cache.key !== cacheKey) {
      cache.key = cacheKey;
      cache.frames.clear();
    }
    let cancelled = false;
    const loadImage = (src: string) =>
      new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new window.Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
    void (async () => {
      let entry = cache.frames.get(frameIndex);
      if (!entry) {
        try {
          const [beautyImg, idxImg] = await Promise.all([
            loadImage(url),
            loadImage(idMapUrlFor(url)),
          ]);
          const w = idxImg.naturalWidth;
          const h = idxImg.naturalHeight;
          const scratch = document.createElement('canvas');
          scratch.width = w;
          scratch.height = h;
          const ctx = scratch.getContext('2d', { willReadFrequently: true });
          if (!ctx) throw new Error('2d context unavailable');
          ctx.drawImage(beautyImg, 0, 0, w, h);
          const beauty = ctx.getImageData(0, 0, w, h);
          ctx.clearRect(0, 0, w, h);
          ctx.drawImage(idxImg, 0, 0, w, h);
          entry = { beauty, codes: decodeIdMap(ctx.getImageData(0, 0, w, h)) };
        } catch {
          /* A frame without its map (older compile, missing file): the
             reticle fallback takes over rather than guessing pixels. */
          entry = 'error';
        }
        cache.frames.set(frameIndex, entry);
      }
      if (cancelled) return;
      if (entry === 'error') {
        setXrayOn(false);
        return;
      }
      const canvas = xrayCanvasRef.current;
      if (!canvas) return;
      canvas.width = entry.beauty.width;
      canvas.height = entry.beauty.height;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      const out = ctx.createImageData(canvas.width, canvas.height);
      renderXrayComposite(entry.beauty, entry.codes, selectedCodes, out);
      ctx.putImageData(out, 0, 0);
      if (!cancelled) setXrayOn(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [xrayCapable, selectedCodes, frames, frameIndex]);

  const allSelectionParts = useMemo((): Scene3dSelectionPart[] => {
    if (!manifest || !manifest.partTree) return [];
    const paths = primPaths(manifest.partTree);
    return manifest.partTree.map((p) => ({
      name: p.name,
      path: paths.get(p.name) ?? `/${p.name}`,
      type: p.type,
    }));
  }, [manifest]);

  const handleRowClick = (event: React.MouseEvent, row: Scene3dTreeRow) => {
    if (event.altKey) {
      event.preventDefault();
      const text =
        row.kind === 'prototype'
          ? row.memberNames
              .map((name) => {
                const nodePath = allSelectionParts.find((p) => p.name === name)?.path;
                return nodePath ?? `/${name}`;
              })
              .join('\n')
          : row.path;
      try {
        void navigator.clipboard.writeText(text);
      } catch {
        // ignore clipboard error
      }
      return;
    }

    const targetNames = row.targetNames;
    let nextSelected: string[];

    if (event.shiftKey) {
      const currentSet = new Set(selectionState.selected);
      const allIn = targetNames.length > 0 && targetNames.every((n) => currentSet.has(n));
      if (allIn) {
        for (const n of targetNames) currentSet.delete(n);
      } else {
        for (const n of targetNames) currentSet.add(n);
      }
      nextSelected = Array.from(currentSet);
    } else {
      const currentSet = new Set(selectionState.selected);
      const alreadyExact =
        targetNames.length === selectionState.selected.length &&
        targetNames.every((n) => currentSet.has(n));
      nextSelected = alreadyExact ? [] : targetNames;
    }

    setScene3dSelection(assetName, scenePath, allSelectionParts, nextSelected);
  };

  return (
    // `.viewer` is the app's flex-fill layout contract for anything mounted in
    // the workspace pane. Without it this panel grows past the pane and
    // scrolls the workspace instead of itself.
    <div className={`viewer ${styles.viewer}`}>
      <div className="viewer-toolbar">
        <div className="viewer-toolbar-left">
          <KindBadge kind={assetKind} />
          <span className={styles.assetName}>{assetName}</span>
          {manifest && manifest.partTree.length > 0 ? (
            /* Magnitudes as glyph + number; the tooltip keeps the full
               sentence (exact counts, world size, Blender version), so the
               line stops spending toolbar width on words and units. */
            <span
              className={styles.metaRow}
              title={metaSentence}
              role="img"
              aria-label={metaSentence}
            >
              <span className={styles.metaItem}>
                <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M8 2.2 13.2 5.2v5.6L8 13.8 2.8 10.8V5.2z" />
                  <path d="M2.8 5.2 8 8.2l5.2-3M8 8.2v5.6" />
                </svg>
                {manifest.partTree.length}
              </span>
              {triangles !== null ? (
                <span className={styles.metaItem}>
                  <svg viewBox="0 0 16 16" width="11" height="11" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M8 2.6 14 13H2z" />
                  </svg>
                  {compactCount(triangles)}
                </span>
              ) : null}
              {manifest.metrics?.worldSize ? (
                /* Axis-coloured, matching the kit gizmo (X red, Y green,
                   Z blue) so the numbers scaffold onto the manipulator the
                   user already knows. */
                (() => {
                  const [dx, dy, dz] = dimStrings(manifest.metrics.worldSize);
                  return (
                    <span className={`${styles.metaItem} ${styles.metaDims}`}>
                      <span className={styles.dimX}>{dx}</span>
                      <span className={styles.dimSep}>×</span>
                      <span className={styles.dimY}>{dy}</span>
                      <span className={styles.dimSep}>×</span>
                      <span className={styles.dimZ}>{dz}</span>
                      <span className={styles.dimUnit}>m</span>
                    </span>
                  );
                })()
              ) : null}
            </span>
          ) : null}
          {verdict ? <VerdictChip errors={verdict.errors} warnings={verdict.warnings} /> : null}
          <ProvenBadge claims={manifest?.claims} />
        </div>
        <div className="viewer-toolbar-actions">
          <ExportMenu label={assetName} refs={assets} />
          <Button variant="primary" onClick={() => void compile()} disabled={compiling || loading}>
            {compiling
              ? t('scene3d.compiling')
              : compiled
                ? t('scene3d.recompile')
                : t('scene3d.compile')}
          </Button>
        </div>
      </div>

      <div className={`viewer-body ${styles.body}`}>
        {error ? <p className={styles.error}>{error.message}</p> : null}

        <main className={styles.main}>
          <div
            ref={stageRef}
            className={[
              styles.stage,
              rotatable ? styles.rotatable : '',
              dragging ? styles.dragging : '',
            ]
              .filter(Boolean)
              .join(' ')}
            onPointerDown={onStagePointerDown}
            onPointerMove={onStagePointerMove}
            onPointerUp={onStagePointerEnd}
            onPointerCancel={onStagePointerCancel}
            onPointerLeave={() => setHoverPart(null)}
            style={hoverPart && !dragging ? { cursor: 'pointer' } : undefined}
          >
            {currentFrame ? (
              <img
                className={styles.frame}
                src={currentFrame}
                alt={t('scene3d.frameAlt')}
                draggable={false}
              />
            ) : (
              <p className={styles.stageEmpty}>{t('scene3d.noProof')}</p>
            )}
            {/* The x-ray canvas: the full-energize composite, crossfaded
                over the frame with the kit's own tween. Sits under the
                overlay so the name tags stay on top. */}
            {xrayCapable && stageSize
              ? (() => {
                  const vp = proofViewport(stageSize.w, stageSize.h);
                  return (
                    <canvas
                      ref={xrayCanvasRef}
                      className={`${styles.xrayCanvas} ${xrayOn ? styles.xrayCanvasOn : ''}`}
                      style={{ left: vp.left, top: vp.top, width: vp.size, height: vp.size }}
                      aria-hidden="true"
                    />
                  );
                })()
              : null}
            {/* On-picture selection: reticles drawn from the render-time
                projections, through the same viewport transform the click
                pick inverts. Hover pre-highlights; selection gets the full
                focus brackets — unless the x-ray is energized, where the
                part itself IS the highlight and only the name tag stays. */}
            {stageSize && frameRects
              ? (() => {
                  const vp = proofViewport(stageSize.w, stageSize.h);
                  const selectedHere = [...selectedPartsSet].filter((n) => frameRects[n]);
                  return (
                    <div className={styles.overlay} aria-hidden="true">
                      {hoverPart && !playing && !selectedPartsSet.has(hoverPart) && frameRects[hoverPart]
                        ? (() => {
                            const box = proofRectToStage(frameRects[hoverPart]!, vp);
                            return (
                              <div
                                className={styles.hoverBox}
                                style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                              />
                            );
                          })()
                        : null}
                      {selectedHere.map((name) => {
                        const box = proofRectToStage(frameRects[name]!, vp);
                        return (
                          <div
                            key={name}
                            className={`${styles.reticle} ${xrayOn ? styles.reticleQuiet : ''}`}
                            style={{ left: box.left, top: box.top, width: box.width, height: box.height }}
                          >
                            {xrayOn ? null : (
                              <>
                                <i className={`${styles.corner} ${styles.cornerTl}`} />
                                <i className={`${styles.corner} ${styles.cornerTr}`} />
                                <i className={`${styles.corner} ${styles.cornerBl}`} />
                                <i className={`${styles.corner} ${styles.cornerBr}`} />
                              </>
                            )}
                            {selectedHere.length <= 3 ? (
                              /* No headroom above the box → the tag flips
                                 below it instead of clipping out of the
                                 stage. */
                              <span
                                className={`${styles.reticleTag} ${
                                  box.top < 30 ? styles.reticleTagBelow : ''
                                }`}
                              >
                                {name}
                              </span>
                            ) : null}
                          </div>
                        );
                      })}
                    </div>
                  );
                })()
              : null}
            {rotatable ? (
              /* The affordance is a glyph, not a sentence: a quiet orbit mark
                 in the corner says "this turns" the way a grab cursor does,
                 and retires after the first rotation. The old text pill sat
                 across the subject and read as chrome. The wording survives
                 as the tooltip for anyone who hovers. */
              <span
                className={`${styles.orbitHint} ${hasRotated || playing ? styles.orbitHintHidden : ''}`}
                title={t('scene3d.dragHint')}
                aria-hidden="true"
              >
                <svg viewBox="0 0 16 16" width="15" height="15" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="8" cy="8" r="3.1" />
                  <path d="M14.6 8a6.6 6.6 0 1 1-2.1-4.85" />
                  <path d="M12.1 1.4l.4 1.75 1.75-.4" />
                </svg>
              </span>
            ) : null}
          </div>
          {rotatable ? (
            <div className={styles.scrub}>
              <button
                type="button"
                className={styles.playButton}
                aria-label={playing ? t('scene3d.stop') : t('scene3d.replay')}
                title={playing ? t('scene3d.stop') : t('scene3d.replay')}
                onClick={() => setPlaying((on) => !on)}
              >
                {playing ? (
                  /* Pause bars, not the shared stop square: toggling keeps the
                     current frame, and a lone filled square in a ghost button
                     reads as a checkbox rather than a media control. */
                  <svg viewBox="0 0 16 16" width="12" height="12" fill="currentColor" aria-hidden="true">
                    <rect x="3.6" y="2.8" width="3.1" height="10.4" rx="1.1" />
                    <rect x="9.3" y="2.8" width="3.1" height="10.4" rx="1.1" />
                  </svg>
                ) : (
                  <Icon name="play" size={13} />
                )}
              </button>
              <VisuallyHidden>
                <label htmlFor="scene3d-frame">{t('scene3d.frameSlider')}</label>
              </VisuallyHidden>
              <input
                id="scene3d-frame"
                className={styles.scrubInput}
                type="range"
                min={0}
                max={frames.length - 1}
                value={frameIndex}
                /* The played portion of the track fills via this variable —
                   the native track has no progress notion, and a slider with
                   no fill reads as a form control rather than a scrubber. */
                style={
                  {
                    '--progress': `${frames.length > 1 ? (frameIndex / (frames.length - 1)) * 100 : 0}%`,
                  } as React.CSSProperties
                }
                onChange={(event) => {
                  setPlaying(false);
                  setFrameIndex(Number(event.target.value));
                }}
              />
              <output className={styles.counter}>
                {frameIndex + 1}/{frames.length}
              </output>
            </div>
          ) : null}
        </main>

        <aside className={styles.side} ref={sideRef}>
          {/* Issues lead: the panel is a compile report, and a report reads
              verdict → findings → contents. */}
          <section>
            <h4 className={styles.sectionTitle}>
              {t('scene3d.issues')}
              {issues.length > 0 ? (
                <span className={styles.sectionCount}>{issues.length}</span>
              ) : null}
            </h4>
            {groupedIssues.length > 0 ? (
              <ul className={styles.list}>
                {groupedIssues.map((issue, index) => (
                  <li
                    key={issueKey(issue, index)}
                    className={`${styles.issue} ${SEVERITY_CLASS[issue.severity] ?? ''} ${
                      index > 0 && issueDomain(issue.code) !== issueDomain(groupedIssues[index - 1]!.code)
                        ? styles.issueGroupStart
                        : ''
                    }`}
                  >
                    <span
                      className={styles.issueCode}
                      {...(scene3dIssueTitle(issue.code)
                        ? { title: scene3dIssueTitle(issue.code)! }
                        : {})}
                    >
                      {issue.code}
                      {issue.target ? ` · ${issue.target}` : ''}
                    </span>
                    <span className={styles.issueMessage}>{issue.message}</span>
                    {issue.hint ? (
                      <span className={styles.issueHint}>
                        {t('scene3d.fixPrefix')} {issue.hint}
                      </span>
                    ) : null}
                  </li>
                ))}
              </ul>
            ) : storedIssueCodes.length > 0 ? (
              <>
                <ul className={styles.list}>
                  {storedIssueCodes.map((code, index) => (
                    <li
                      key={`${code}:${index}`}
                      className={`${styles.issue} ${SEVERITY_CLASS[codeSeverity(code)] ?? ''}`}
                    >
                      <span className={styles.issueCode}>{code}</span>
                      {/* The code is the handle; the title is what it MEANS.
                          Without it a stored finding reads as pure jargon. */}
                      {scene3dIssueTitle(code) ? (
                        <span className={styles.issueMessage}>{scene3dIssueTitle(code)}</span>
                      ) : null}
                    </li>
                  ))}
                </ul>
                <p className={styles.mutedSmall}>{t('scene3d.issuesStoredHint')}</p>
              </>
            ) : (
              /* A stored manifest with zero findings is a known-clean scene,
                 not an unknown one; only a never-compiled scene earns the
                 noncommittal dash. */
              <p className={styles.muted}>
                {result || (verdict && verdict.errors === 0 && verdict.warnings === 0)
                  ? t('scene3d.noIssues')
                  : '—'}
              </p>
            )}
          </section>

          <section>
            <h4 className={styles.sectionTitle}>
              {t('scene3d.parts')}
              {manifest && manifest.partTree.length > 0 ? (
                <span className={styles.sectionCount}>{manifest.partTree.length}</span>
              ) : null}
            </h4>
            {manifest && manifest.partTree.length > 0 ? (
              <ul className={styles.treeList}>
                {treeRows.map((row) => {
                  const isSelected =
                    row.targetNames.length > 0 &&
                    row.targetNames.every((n) => selectedPartsSet.has(n));

                  return (
                    <li key={row.key}>
                      <button
                        type="button"
                        className={`${styles.treeRow} ${isSelected ? styles.treeRowSelected : ''}`}
                        style={{ paddingLeft: `${8 + row.depth * 11}px` }}
                        title={partRowTooltip(row)}
                        data-s3d-part-row={row.targetNames[0] ?? ''}
                        onClick={(e) => handleRowClick(e, row)}
                      >
                        <span className={styles.treeRowName}>
                          {row.kind === 'prototype' ? row.stem : row.name}
                        </span>
                        {row.kind === 'prototype' ? (
                          <span className={styles.treeRowCount}>×{row.count}</span>
                        ) : null}
                        {row.glyphs ? (
                          <span className={styles.treeRowGlyphs}>
                            {row.glyphs.includes('a') ? (
                              <svg viewBox="0 0 8 8" aria-hidden="true" width="7" height="7" fill="currentColor">
                                <path d="M1.8 1.1l4.8 2.9-4.8 2.9z" />
                              </svg>
                            ) : null}
                            {row.glyphs.includes('w') ? (
                              <svg viewBox="0 0 8 8" aria-hidden="true" width="7" height="7" fill="currentColor">
                                <path d="M4 .7 7.1 2.5v3L4 7.3.9 5.5v-3z" />
                              </svg>
                            ) : null}
                            {row.glyphs.includes('x') ? (
                              <svg viewBox="0 0 8 8" aria-hidden="true" width="7" height="7" fill="currentColor">
                                <path d="M1 1h2.5v2.5H1zM4.5 1H7v2.5H4.5zM1 4.5h2.5V7H1zM4.5 4.5H7V7H4.5z" />
                              </svg>
                            ) : null}
                          </span>
                        ) : null}
                        {(() => {
                          const gap = row.kind === 'prototype' ? row.worstGroundGap : row.groundGap;
                          if (gap === undefined || gap <= 0) return null;
                          const gapMm = Math.round(gap * 1000);
                          return (
                            <span
                              className={styles.treeRowFloat}
                              title={`Floats ${gapMm}mm above the ground plane`}
                              aria-label={`Floats ${gapMm}mm above the ground plane`}
                            >
                              ↑{gapMm}mm
                            </span>
                          );
                        })()}
                        {row.type !== 'MESH' ? (
                          /* Camera, light and rig rows get the same tiny-glyph
                             treatment as the mesh rows' a/w/x chips; rarer
                             types keep their lowercase word. The row button's
                             tooltip already spells everything out. */
                          <span className={styles.treeRowType}>
                            {row.type === 'CAMERA' ? (
                              <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <rect x="1.8" y="4.6" width="8.2" height="6.8" rx="1.5" />
                                <path d="M10 7.6 14.2 5.4v5.2L10 8.4z" />
                              </svg>
                            ) : row.type === 'LIGHT' ? (
                              <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                <circle cx="8" cy="7.2" r="3" />
                                <path d="M8 1.6v1.5M8 12.9v1.5M2.4 7.2H1M15 7.2h-1.4M3.8 3l1.1 1.1M12.2 3l-1.1 1.1" />
                              </svg>
                            ) : row.type === 'ARMATURE' ? (
                              <>
                                <svg viewBox="0 0 16 16" width="10" height="10" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                                  <path d="M5 11 11 5" />
                                  <circle cx="3.9" cy="12.1" r="1.9" />
                                  <circle cx="12.1" cy="3.9" r="1.9" />
                                </svg>
                                {typeof row.bones === 'number' ? row.bones : null}
                              </>
                            ) : (
                              row.type.toLowerCase()
                            )}
                          </span>
                        ) : row.mesh ? (
                          <span className={styles.treeRowMeta}>
                            {t('scene3d.meshCounts', {
                              verts: row.mesh.verts,
                              faces: row.mesh.faces,
                            })}
                          </span>
                        ) : null}
                      </button>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className={styles.muted}>
                {compiled ? t('scene3d.noParts') : t('scene3d.neverCompiled')}
              </p>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}

/** Codes repeat across targets, so the index disambiguates the list key. */
function issueKey(issue: Scene3dIssue, index: number): string {
  return `${issue.code}:${issue.target ?? ''}:${index}`;
}

/** Severity is baked into the stable code shape: S3D-E-*, S3D-W-*, S3D-I-*. */
function codeSeverity(code: string): string {
  if (code.startsWith('S3D-E-')) return 'error';
  if (code.startsWith('S3D-W-')) return 'warning';
  return 'info';
}

/** Tooltip line with full USD prim path, type, dimensions, faces/tris, and shortcuts. */
function partRowTooltip(row: Scene3dTreeRow): string {
  if (row.kind === 'prototype') {
    return `${row.count} instances: ${row.memberNames.join(', ')} · click selects all · alt-click copies every path`;
  }
  const parts: string[] = [row.path];
  if (row.type) parts.push(row.type.toLowerCase());
  if (row.dimensions) parts.push(`${row.dimensions.join(' × ')} m`);
  if (typeof row.tris === 'number') {
    parts.push(`${row.tris.toLocaleString()} tris`);
  } else if (row.mesh && typeof row.mesh.faces === 'number') {
    parts.push(`${row.mesh.faces.toLocaleString()} faces`);
  }
  if (row.glyphs) {
    const glyphNames = [
      row.glyphs.includes('a') ? 'animated' : '',
      row.glyphs.includes('w') ? 'watertight' : '',
      row.glyphs.includes('x') ? 'textured' : '',
    ].filter(Boolean);
    if (glyphNames.length > 0) parts.push(glyphNames.join(', '));
  }
  parts.push('alt-click copies path');
  return parts.join(' · ');
}
