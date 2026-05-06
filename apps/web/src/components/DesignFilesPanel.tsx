import { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { useT } from '../i18n';
import type { Dict } from '../i18n/types';
import { projectFileUrl } from '../providers/registry';
import type { LiveArtifactWorkspaceEntry, ProjectFile, ProjectFileKind } from '../types';
import { Icon } from './Icon';
import { LiveArtifactBadges } from './LiveArtifactBadges';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface Props {
  projectId: string;
  files: ProjectFile[];
  liveArtifacts: LiveArtifactWorkspaceEntry[];
  onRefreshFiles: () => Promise<void> | void;
  onOpenFile: (name: string) => void;
  onOpenLiveArtifact: (tabId: LiveArtifactWorkspaceEntry['tabId']) => void;
  onDeleteFile: (name: string) => void;
  onUpload: () => void;
  onUploadFiles: (files: File[]) => void;
  onPaste: () => void;
  onNewSketch: () => void;
}

type Section = 'pages' | 'scripts' | 'images' | 'sketches' | 'other';

const SECTION_LABEL_KEY: Record<Section, keyof Dict> = {
  pages: 'designFiles.sectionPages',
  scripts: 'designFiles.sectionScripts',
  images: 'designFiles.sectionImages',
  sketches: 'designFiles.sectionSketches',
  other: 'designFiles.sectionOther',
};

const SECTION_ORDER: Section[] = ['pages', 'sketches', 'scripts', 'images', 'other'];
const INITIAL_SECTION_FILE_LIMIT = 30;
const SECTION_FILE_LIMIT_INCREMENT = 200;

/**
 * Full-panel browser for a project's `.od/projects/<id>/` folder. Mirrors
 * Claude Design's "Design Files" surface: grouped sections, hover-revealed
 * row menu, drop-files footer, and (when a row is selected) a right-side
 * preview pane. Triggered as a sticky first tab in FileWorkspace.
 */
export function DesignFilesPanel({
  projectId,
  files,
  liveArtifacts,
  onRefreshFiles,
  onOpenFile,
  onOpenLiveArtifact,
  onDeleteFile,
  onUpload,
  onUploadFiles,
  onPaste,
  onNewSketch,
}: Props) {
  const t = useT();
  const [refreshing, setRefreshing] = useState(false);
  const [draggingFiles, setDraggingFiles] = useState(false);
  const dragDepthRef = useRef(0);
  const [hover, setHover] = useState<string | null>(null);
  const [menuPos, setMenuPos] = useState<{ name: string; top: number; left: number } | null>(null);
  const MENU_ESTIMATED_HEIGHT = 115;
  const MENU_SAFE_PADDING = 8;
  const [preview, setPreview] = useState<string | null>(null);
  const [sectionLimits, setSectionLimits] = useState<Partial<Record<Section, number>>>({});
  const [isSectionExpansionPending, startSectionExpansion] = useTransition();
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const grouped = useMemo(() => {
    const groups: Record<Section, ProjectFile[]> = {
      pages: [],
      sketches: [],
      scripts: [],
      images: [],
      other: [],
    };
    const sorted = [...files].sort((a, b) => b.mtime - a.mtime);
    for (const f of sorted) {
      groups[sectionFor(f)].push(f);
    }
    return groups;
  }, [files]);

  // Prune selections that no longer exist in the current file list
  // (e.g. after a refresh or delete within the same project).
  // Cross-project leaks are handled by the parent remounting this
  // component via key={projectId}.
  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const names = new Set(files.map((f) => f.name));
      const next = new Set(prev);
      let changed = false;
      for (const n of next) {
        if (!names.has(n)) {
          next.delete(n);
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [files]);

  const previewFile = useMemo(
    () => files.find((f) => f.name === preview) ?? null,
    [preview, files],
  );

  // Close the row menu on outside click / escape.
  useEffect(() => {
    if (!menuPos) return;
    const close = () => setMenuPos(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close();
    };
    window.addEventListener('mousedown', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('mousedown', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [menuPos]);

  async function handleRefresh() {
    setRefreshing(true);
    try {
      await onRefreshFiles();
    } finally {
      setRefreshing(false);
    }
  }

  function toggleSelect(name: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(name)) {
        next.delete(name);
      } else {
        next.add(name);
      }
      return next;
    });
  }

  function selectAllInSection(sectionFiles: ProjectFile[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of sectionFiles) next.add(f.name);
      return next;
    });
  }

  function clearSection(sectionFiles: ProjectFile[]) {
    setSelected((prev) => {
      const next = new Set(prev);
      for (const f of sectionFiles) next.delete(f.name);
      return next;
    });
  }

  async function handleBatchDownload() {
    const fileList = [...selected];
    if (fileList.length === 0) return;
    try {
      const resp = await fetch(`/api/projects/${encodeURIComponent(projectId)}/archive/batch`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ files: fileList }),
      });
      if (!resp.ok) {
        const err = await resp.json().catch(() => null);
        throw new Error(err?.message || `request failed (${resp.status})`);
      }
      const blob = await resp.blob();
      const header = resp.headers.get('content-disposition') || '';
      const star = /filename\*=UTF-8''([^;]+)/i.exec(header);
      let filename = 'project.zip';
      if (star && star[1]) {
        try {
          filename = decodeURIComponent(star[1]);
        } catch {
          filename = star[1];
        }
      }
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (err) {
      console.warn('[batchDownload] failed:', err);
    }
  }

  function handleDrop(ev: React.DragEvent<HTMLDivElement>) {
    ev.preventDefault();
    dragDepthRef.current = 0;
    setDraggingFiles(false);
    const dropped = Array.from(ev.dataTransfer.files ?? []);
    if (dropped.length > 0) onUploadFiles(dropped);
  }

  return (
    <div className={`df-panel ${preview ? '' : 'no-preview'}`}>
      <div className="df-main">
        <div className="df-head">
          <button
            type="button"
            className="icon-only"
            onClick={() => setPreview(null)}
            title={t('designFiles.up')}
            aria-label={t('designFiles.back')}
          >
            ↑
          </button>
          <button
            type="button"
            className="icon-only"
            onClick={() => void handleRefresh()}
            disabled={refreshing}
            title={t('designFiles.refresh')}
            aria-label={t('designFiles.refresh')}
          >
            <Icon name={refreshing ? 'spinner' : 'reload'} size={14} />
          </button>
          <span className="crumbs">{t('designFiles.crumbs')}</span>
          {selected.size > 0 ? (
            <div className="df-actions">
              <button type="button" onClick={() => void handleBatchDownload()}>
                <Icon name="download" size={13} />
                <span>{t('designFiles.downloadSelected', { n: selected.size })}</span>
              </button>
            </div>
          ) : (
            <div className="df-actions">
            <button type="button" onClick={onNewSketch} title={t('designFiles.newSketch')}>
              <Icon name="pencil" size={13} />
              <span>{t('designFiles.newSketch')}</span>
            </button>
            <button type="button" onClick={onPaste} title={t('designFiles.paste.title')}>
              <Icon name="copy" size={13} />
              <span>{t('designFiles.paste.label')}</span>
            </button>
            <button
              type="button"
              data-testid="design-files-upload-trigger"
              onClick={onUpload}
              title={t('designFiles.upload.title')}
            >
              <Icon name="upload" size={13} />
              <span>{t('designFiles.upload.label')}</span>
            </button>
          </div>
          )}
        </div>
        <div className="df-body">
          {files.length === 0 && liveArtifacts.length === 0 ? (
            <div className="df-empty">{t('designFiles.empty')}</div>
          ) : (
            <>
              {liveArtifacts.length > 0 ? (
                <div className="df-section" key="live-artifacts">
                  <div className="df-section-label">{t('designFiles.sectionLiveArtifacts')}</div>
                  {liveArtifacts.map((artifact) => (
                    <button
                      key={artifact.artifactId}
                      type="button"
                      data-testid={`design-file-row-${artifact.tabId}`}
                      className="df-row"
                      onDoubleClick={() => onOpenLiveArtifact(artifact.tabId)}
                      onClick={() => onOpenLiveArtifact(artifact.tabId)}
                    >
                      <span className="df-row-icon" data-kind="live-artifact" aria-hidden>
                        ◉
                      </span>
                      <span className="df-row-name-wrap">
                        <span className="df-row-name">{artifact.title}</span>
                        <span className="df-row-sub">
                          <span>{t('designFiles.kindLiveArtifact')}</span>
                          <LiveArtifactBadges
                            compact
                            status={artifact.status}
                            refreshStatus={artifact.refreshStatus}
                          />
                        </span>
                      </span>
                      <span className="df-row-time">
                        {relativeTime(Date.parse(artifact.updatedAt) || Date.now(), t)}
                      </span>
                    </button>
                  ))}
                </div>
              ) : null}
              {SECTION_ORDER.filter((s) => grouped[s].length > 0).map((section) => {
                const sectionFiles = grouped[section];
                const visibleLimit = sectionLimits[section] ?? INITIAL_SECTION_FILE_LIMIT;
                const visibleFiles = sectionFiles.slice(0, visibleLimit);
                const hiddenCount = sectionFiles.length - visibleFiles.length;
                return (
                <div className="df-section" key={section}>
                  <div className="df-section-label">
                    {t(SECTION_LABEL_KEY[section])}
                    <span className="df-section-count">{sectionFiles.length}</span>
                    <button
                      type="button"
                      className="df-select-all"
                      onClick={(e) => {
                        e.stopPropagation();
                        selectAllInSection(sectionFiles);
                      }}
                    >
                      {t('designFiles.selectAll')}
                    </button>
                    {sectionFiles.some((f) => selected.has(f.name)) ? (
                      <button
                        type="button"
                        className="df-select-all"
                        onClick={(e) => {
                          e.stopPropagation();
                          clearSection(sectionFiles);
                        }}
                      >
                        {t('designFiles.clearSelection')}
                      </button>
                    ) : null}
                  </div>
                  {visibleFiles.map((f) => {
                    const active = preview === f.name;
                    const isHovered = hover === f.name;
                    return (
                      <button
                        key={f.name}
                        type="button"
                        data-testid={`design-file-row-${f.name}`}
                        className={`df-row ${active ? 'active' : ''} ${selected.has(f.name) ? 'selected' : ''}`}
                        onMouseEnter={() => setHover(f.name)}
                        onMouseLeave={() => setHover((c) => (c === f.name ? null : c))}
                        onClick={() => setPreview(f.name)}
                        onDoubleClick={() => onOpenFile(f.name)}
                      >
                        <span
                          className="df-row-check"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleSelect(f.name);
                          }}
                          role="checkbox"
                          aria-checked={selected.has(f.name)}
                          tabIndex={0}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              e.stopPropagation();
                              toggleSelect(f.name);
                            }
                          }}
                        >
                          {selected.has(f.name) ? '☑' : '☐'}
                        </span>
                        <span className="df-row-icon" data-kind={f.kind} aria-hidden>
                          {kindGlyph(f.kind)}
                        </span>
                        <span className="df-row-name-wrap">
                          <span className="df-row-name">{f.name}</span>
                          <span className="df-row-sub">{kindLabel(f.kind, t)}</span>
                        </span>
                        <span className="df-row-time">{relativeTime(f.mtime, t)}</span>
                        <span
                          data-testid={`design-file-menu-${f.name}`}
                          className="df-row-menu"
                          style={isHovered || active ? { opacity: 1 } : undefined}
                          role="button"
                          aria-label={t('designFiles.rowMenu')}
                          onClick={(e) => {
                            e.stopPropagation();
                            const rect = (e.target as HTMLElement)
                              .closest('.df-row-menu')
                              ?.getBoundingClientRect();
                            if (!rect) return;
                            
                            const viewportHeight = window.innerHeight;
                            const spaceBelow = viewportHeight - rect.bottom;
                            const spaceAbove = rect.top;
                            
                            let top: number;
                            if (spaceBelow >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
                              top = rect.bottom + 4;
                            } else if (spaceAbove >= MENU_ESTIMATED_HEIGHT + MENU_SAFE_PADDING) {
                              top = rect.top - MENU_ESTIMATED_HEIGHT - 4;
                            } else {
                              top = Math.max(
                                MENU_SAFE_PADDING,
                                viewportHeight - MENU_ESTIMATED_HEIGHT - MENU_SAFE_PADDING,
                              );
                            }
                            
                            const left = Math.max(MENU_SAFE_PADDING, rect.right - 160);
                            
                            setMenuPos({
                              name: f.name,
                              top,
                              left,
                            });
                          }}
                        >
                          ⋯
                        </span>
                      </button>
                    );
                  })}
                  {hiddenCount > 0 ? (
                    <button
                      type="button"
                      className="df-section-more"
                      disabled={isSectionExpansionPending}
                      aria-busy={isSectionExpansionPending}
                      onClick={() =>
                        startSectionExpansion(() => {
                          setSectionLimits((curr) => ({
                            ...curr,
                            [section]: Math.min(
                              sectionFiles.length,
                              visibleLimit + SECTION_FILE_LIMIT_INCREMENT,
                            ),
                          }));
                        })
                      }
                    >
                      <Icon name={isSectionExpansionPending ? 'spinner' : 'plus'} size={12} />
                      <span>
                        {t('designFiles.showMore', {
                          n: Math.min(hiddenCount, SECTION_FILE_LIMIT_INCREMENT),
                        })}
                      </span>
                    </button>
                  ) : null}
                </div>
                );
              })}
            </>
          )}
          <div
            className={`df-drop ${draggingFiles ? 'dragging' : ''}`}
            onDragEnter={(ev) => {
              ev.preventDefault();
              dragDepthRef.current += 1;
              setDraggingFiles(true);
            }}
            onDragOver={(ev) => {
              ev.preventDefault();
              ev.dataTransfer.dropEffect = 'copy';
            }}
            onDragLeave={(ev) => {
              if (!ev.currentTarget.contains(ev.relatedTarget as Node | null)) {
                dragDepthRef.current = 0;
                setDraggingFiles(false);
                return;
              }
              dragDepthRef.current = Math.max(0, dragDepthRef.current - 1);
              if (dragDepthRef.current === 0) setDraggingFiles(false);
            }}
            onDrop={handleDrop}
          >
            <span className="label">{t('designFiles.dropTitle')}</span>
            <span className="desc">{t('designFiles.dropDesc')}</span>
          </div>
        </div>
      </div>
      {preview && previewFile ? (
        <DfPreview
          projectId={projectId}
          file={previewFile}
          onOpen={() => onOpenFile(previewFile.name)}
          onClose={() => setPreview(null)}
        />
      ) : null}
      {menuPos ? (
        <div
          data-testid="design-file-menu-popover"
          className="df-row-popover"
          style={{ top: menuPos.top, left: menuPos.left }}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              const name = menuPos.name;
              setMenuPos(null);
              onOpenFile(name);
            }}
          >
            {t('designFiles.openInTab')}
          </button>
          <a
            href={projectFileUrl(projectId, menuPos.name)}
            download={menuPos.name}
            style={{ textDecoration: 'none' }}
          >
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setMenuPos(null);
              }}
            >
              {t('designFiles.download')}
            </button>
          </a>
          <button
            type="button"
            className="danger"
            data-testid={`design-file-delete-${menuPos.name}`}
            onClick={(e) => {
              e.stopPropagation();
              e.preventDefault();
              const name = menuPos.name;
              setMenuPos(null);
              onDeleteFile(name);
            }}
          >
            {t('designFiles.delete')}
          </button>
        </div>
      ) : null}
    </div>
  );
}

function DfPreview({
  projectId,
  file,
  onOpen,
  onClose,
}: {
  projectId: string;
  file: ProjectFile;
  onOpen: () => void;
  onClose: () => void;
}) {
  const t = useT();
  const url = projectFileUrl(projectId, file.name);
  return (
    <aside className="df-preview">
      <div className="df-preview-thumb">
        {file.kind === 'image' || file.kind === 'sketch' ? (
          <img src={`${url}?v=${Math.round(file.mtime)}`} alt={file.name} />
        ) : file.kind === 'html' ? (
          <iframe title={file.name} src={url} sandbox="allow-scripts" />
        ) : file.kind === 'video' ? (
          <video
            src={`${url}?v=${Math.round(file.mtime)}`}
            controls
            playsInline
            preload="metadata"
          />
        ) : file.kind === 'audio' ? (
          <audio src={`${url}?v=${Math.round(file.mtime)}`} controls preload="metadata" />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--text-faint)',
              fontSize: 38,
            }}
          >
            {kindGlyph(file.kind)}
          </div>
        )}
      </div>
      <div className="df-preview-meta" data-testid="design-file-preview">
        <button
          type="button"
          className="ghost"
          onClick={onOpen}
          style={{ alignSelf: 'flex-start' }}
        >
          <Icon name="eye" size={13} />
          <span>{t('designFiles.previewOpen')}</span>
        </button>
        <div className="df-preview-name">{file.name}</div>
        <div className="df-preview-kind">{kindLabel(file.kind, t)}</div>
        <div className="df-preview-stats">
          {t('designFiles.modified', {
            time: relativeTime(file.mtime, t),
            size: humanBytes(file.size),
          })}
        </div>
        <div className="df-preview-actions">
          <a
            className="ghost-link"
            href={url}
            download={file.name}
            style={{ textDecoration: 'none' }}
          >
            {t('designFiles.download')}
          </a>
          <button type="button" onClick={onClose}>
            {t('designFiles.previewClose')}
          </button>
        </div>
      </div>
    </aside>
  );
}

function sectionFor(file: ProjectFile): Section {
  if (file.kind === 'html' || file.kind === 'text') return 'pages';
  if (file.kind === 'sketch') return 'sketches';
  if (file.kind === 'code') return 'scripts';
  if (file.kind === 'image') return 'images';
  if (
    file.kind === 'pdf' ||
    file.kind === 'document' ||
    file.kind === 'presentation' ||
    file.kind === 'spreadsheet'
  ) return 'pages';
  return 'other';
}

function kindGlyph(kind: ProjectFileKind): string {
  if (kind === 'html') return '⟨⟩';
  if (kind === 'image') return '▣';
  if (kind === 'sketch') return '✎';
  if (kind === 'text') return '¶';
  if (kind === 'code') return '{}';
  if (kind === 'pdf') return 'PDF';
  if (kind === 'document') return 'DOC';
  if (kind === 'presentation') return 'PPT';
  if (kind === 'spreadsheet') return 'XLS';
  return '·';
}

function kindLabel(kind: ProjectFileKind, t: TranslateFn): string {
  if (kind === 'html') return t('designFiles.kindHtml');
  if (kind === 'image') return t('designFiles.kindImage');
  if (kind === 'sketch') return t('designFiles.kindSketch');
  if (kind === 'text') return t('designFiles.kindText');
  if (kind === 'code') return t('designFiles.kindCode');
  if (kind === 'pdf') return t('designFiles.kindPdf');
  if (kind === 'document') return t('designFiles.kindDocument');
  if (kind === 'presentation') return t('designFiles.kindPresentation');
  if (kind === 'spreadsheet') return t('designFiles.kindSpreadsheet');
  return t('designFiles.kindBinary');
}

function relativeTime(ts: number, t: TranslateFn): string {
  const diff = Date.now() - ts;
  const min = 60_000;
  const hr = 60 * min;
  const day = 24 * hr;
  if (diff < min) return t('common.justNow');
  if (diff < hr) return t('common.minutesAgo', { n: Math.floor(diff / min) });
  if (diff < day) return t('common.hoursAgo', { n: Math.floor(diff / hr) });
  if (diff < 7 * day) return t('common.daysAgo', { n: Math.floor(diff / day) });
  if (diff < 30 * day)
    return t('designFiles.weeksAgo', { n: Math.floor(diff / (7 * day)) });
  return new Date(ts).toLocaleDateString();
}

function humanBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
