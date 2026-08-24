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
  resolveAssetKind,
  totalTriangles,
} from '../runtime/scene3d-assets';
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

function KindBadge({ kind }: { kind: Scene3dAssetKind }) {
  const t = useT();
  return <span className={styles.kindBadge}>{t(assetKindLabelKey(kind))}</span>;
}

function VerdictChip({ errors, warnings }: { errors: number; warnings: number }) {
  const t = useT();
  const ok = errors === 0;
  return (
    <span className={`${styles.verdictChip} ${ok ? styles.verdictPass : styles.verdictFail}`}>
      {ok
        ? t('scene3d.verdictClean', { warnings })
        : t('scene3d.verdictFailed', { errors, warnings })}
    </span>
  );
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
  return (
    <span className={styles.provenBadge} title={t('scene3d.claimsProven', { count: claims.declared })}>
      {`✓${claims.declared}`}
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

  useEffect(() => {
    if (!playing || frames.length < 2) return undefined;
    const timer = window.setInterval(
      () => setFrameIndex((current) => (current + 1) % frames.length),
      110,
    );
    return () => window.clearInterval(timer);
  }, [playing, frames.length]);

  // A fresh compile replaces the turntable; keep playback from running on
  // a frame set that no longer exists.
  useEffect(() => {
    setPlaying(false);
  }, [frames.length, scenePath]);
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
    if (!rotatable || event.button !== 0) return;
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
    if (!drag || event.pointerId !== drag.pointerId) return;
    const steps = Math.round((event.clientX - drag.startX) / drag.pxPerFrame);
    if (steps !== 0) setHasRotated(true);
    setFrameIndex(wrapFrame(drag.startFrame + steps));
  };

  const onStagePointerEnd = (event: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current?.pointerId !== event.pointerId) return;
    dragRef.current = null;
    setDragging(false);
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
            <span className="viewer-meta">
              {t('scene3d.partsCount', { count: manifest.partTree.length })}
              {triangles !== null ? ` · ${t('scene3d.trisCount', { count: triangles })}` : ''}
              {worldSize ? ` · ${worldSize}` : ''}
              {blenderVersion ? ` · ${t('scene3d.blenderVersion', { version: blenderVersion })}` : ''}
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
            onPointerCancel={onStagePointerEnd}
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
            {rotatable ? (
              <span
                className={`${styles.dragHint} ${hasRotated || playing ? styles.dragHintHidden : ''}`}
                aria-hidden="true"
              >
                {t('scene3d.dragHint')}
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
                <Icon name={playing ? 'stop' : 'play'} size={13} />
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

        <aside className={styles.side}>
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
                            >
                              ↑{gapMm}mm
                            </span>
                          );
                        })()}
                        {row.type !== 'MESH' ? (
                          <span className={styles.treeRowType}>
                            {row.type === 'ARMATURE' && typeof row.bones === 'number'
                              ? `${row.bones} bones`
                              : row.type.toLowerCase()}
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
