import type { CSSProperties } from 'react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useT } from '../i18n';
import {
  applyStudioSnapshotLocalLibraries,
  buildStudioSnapshot,
  buildStudioSnapshotImportPlan,
  normalizeStudioSnapshot,
  type StudioSnapshot,
  type StudioSnapshotImportMode,
} from '../state/studioSnapshot';
import type {
  AgentInfo,
  AppConfig,
  DesignSystemSummary,
  Project,
  ProjectKind,
  ProjectMetadata,
  ProjectTemplate,
  SkillSummary,
} from '../types';
import { DesignsTab } from './DesignsTab';
import { DesignSystemPreviewModal } from './DesignSystemPreviewModal';
import { DesignSystemsTab } from './DesignSystemsTab';
import { ExamplesTab } from './ExamplesTab';
import { InspirationTab } from './InspirationTab';
import { Icon } from './Icon';
import { CenteredLoader } from './Loading';
import { NewProjectPanel, type CreateInput } from './NewProjectPanel';
import { OneShotLibrarySearch } from './OneShotLibrarySearch';
import { OneShotWorkflows } from './OneShotWorkflows';

type TopTab =
  | 'workflows'
  | 'inspiration'
  | 'designs'
  | 'examples'
  | 'design-systems'
  | 'library-search';

interface Props {
  skills: SkillSummary[];
  designSystems: DesignSystemSummary[];
  projects: Project[];
  templates: ProjectTemplate[];
  defaultDesignSystemId: string | null;
  config: AppConfig;
  agents: AgentInfo[];
  loading?: boolean;
  onCreateProject: (input: CreateInput & { pendingPrompt?: string }) => void;
  onImportClaudeDesign: (file: File) => Promise<void> | void;
  onOpenProject: (id: string) => void;
  onDeleteProject: (id: string) => void;
  onChangeDefaultDesignSystem: (id: string) => void;
  onOpenSettings: () => void;
}

const SIDEBAR_MIN = 320;
const SIDEBAR_MAX = 560;
const SIDEBAR_DEFAULT = 380;
const SIDEBAR_STORAGE_KEY = 'od-entry-sidebar-width';

function loadSidebarWidth(): number {
  try {
    const raw = window.localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (!raw) return SIDEBAR_DEFAULT;
    const n = parseInt(raw, 10);
    if (Number.isNaN(n)) return SIDEBAR_DEFAULT;
    return Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, n));
  } catch {
    return SIDEBAR_DEFAULT;
  }
}

export function EntryView({
  skills,
  designSystems,
  projects,
  templates,
  defaultDesignSystemId,
  config,
  agents,
  loading = false,
  onCreateProject,
  onImportClaudeDesign,
  onOpenProject,
  onDeleteProject,
  onChangeDefaultDesignSystem,
  onOpenSettings,
}: Props) {
  const t = useT();
  const [topTab, setTopTab] = useState<TopTab>('workflows');
  const [previewSystemId, setPreviewSystemId] = useState<string | null>(null);
  const [sidebarWidth, setSidebarWidth] = useState<number>(() => loadSidebarWidth());
  const [resizing, setResizing] = useState(false);
  const [snapshotImportMode, setSnapshotImportMode] = useState<StudioSnapshotImportMode>('merge');
  const [snapshotImport, setSnapshotImport] = useState<StudioSnapshot | null>(null);
  const [snapshotImportError, setSnapshotImportError] = useState('');
  const [snapshotImportStatus, setSnapshotImportStatus] = useState('');

  const currentAgent = useMemo(
    () => agents.find((a) => a.id === config.agentId) ?? null,
    [agents, config.agentId],
  );

  const envMetaLine = useMemo(() => {
    if (config.mode === 'api') {
      try {
        return `${config.model} - ${new URL(config.baseUrl).host}`;
      } catch {
        return config.model;
      }
    }
    return currentAgent
      ? `${currentAgent.name}${currentAgent.version ? ` - ${currentAgent.version}` : ''}`
      : t('settings.noAgentSelected');
  }, [config.mode, config.model, config.baseUrl, currentAgent, t]);

  // 'Use this prompt' on an example card is a fast path - skip the form and
  // create the project immediately with sane defaults derived from the skill,
  // seeding the chat composer with the example prompt via pendingPrompt.
  function usePromptFromSkill(skill: SkillSummary) {
    onCreateProject({
      name: skill.name,
      skillId: skill.id,
      designSystemId: null,
      metadata: metadataForSkill(skill),
      pendingPrompt: skill.examplePrompt || skill.description,
    });
  }

  function previewDesignSystem(id: string) {
    setPreviewSystemId(id);
  }

  const previewSystem = useMemo(
    () => (previewSystemId ? designSystems.find((d) => d.id === previewSystemId) ?? null : null),
    [designSystems, previewSystemId],
  );
  const snapshotImportPlan = useMemo(
    () => (snapshotImport ? buildStudioSnapshotImportPlan(snapshotImport, snapshotImportMode) : null),
    [snapshotImport, snapshotImportMode],
  );

  function handleCreate(input: CreateInput) {
    onCreateProject(input);
  }

  function exportStudioSnapshot() {
    const packet = buildStudioSnapshot({ projects, templates });
    const blob = new Blob([JSON.stringify(packet, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'oneshot-studio-snapshot.json';
    document.body.appendChild(link);
    link.click();
    link.remove();
    URL.revokeObjectURL(url);
  }

  async function previewStudioSnapshotImport(file: File | undefined) {
    if (!file) return;
    setSnapshotImportError('');
    setSnapshotImportStatus('');
    try {
      const parsed = JSON.parse(await file.text()) as unknown;
      const snapshot = normalizeStudioSnapshot(parsed);
      if (!snapshot) {
        setSnapshotImport(null);
        setSnapshotImportError('That file is not a OneShot studio snapshot.');
        return;
      }
      setSnapshotImport(snapshot);
    } catch {
      setSnapshotImport(null);
      setSnapshotImportError('The selected snapshot could not be read.');
    }
  }

  function restoreStudioSnapshotLocalLibraries() {
    if (!snapshotImportPlan) return;
    applyStudioSnapshotLocalLibraries(snapshotImportPlan.snapshot, snapshotImportPlan.mode);
    setSnapshotImport(null);
    setSnapshotImportStatus(`Restored ${snapshotImportPlan.totals.restored} local studio records from the snapshot.`);
  }

  const startWidthRef = useRef(0);
  const startXRef = useRef(0);

  useEffect(() => {
    if (!resizing) return;
    function onMove(e: MouseEvent) {
      const dx = e.clientX - startXRef.current;
      const next = Math.max(
        SIDEBAR_MIN,
        Math.min(SIDEBAR_MAX, startWidthRef.current + dx),
      );
      setSidebarWidth(next);
    }
    function onUp() {
      setResizing(false);
    }
    document.body.classList.add('entry-resizing');
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      document.body.classList.remove('entry-resizing');
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, [resizing]);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarWidth));
    } catch {
      /* ignore */
    }
  }, [sidebarWidth]);

  return (
    <div
      className="entry"
      style={{ '--entry-sidebar-width': `${sidebarWidth}px` } as CSSProperties}
    >
      <aside className="entry-side">
        <div className="entry-brand">
          <span className="entry-brand-mark" aria-hidden>
            <img src="/logo.svg" alt="" className="brand-mark-img" draggable={false} />
          </span>
          <div className="entry-brand-text">
            <div className="entry-brand-title-row">
              <span className="entry-brand-title">{t('app.brand')}</span>
              <span className="entry-brand-pill">{t('app.brandPill')}</span>
            </div>
            <div className="entry-brand-subtitle">{t('app.brandSubtitle')}</div>
          </div>
        </div>
        <NewProjectPanel
          skills={skills}
          designSystems={designSystems}
          defaultDesignSystemId={defaultDesignSystemId}
          templates={templates}
          onCreate={handleCreate}
          onImportClaudeDesign={onImportClaudeDesign}
          loading={loading}
        />
        <div className="entry-side-foot">
          <button
            type="button"
            className="foot-pill"
            onClick={onOpenSettings}
            title={t('settings.envConfigure')}
          >
            <Icon name="settings" size={12} />
            <span>
              {config.mode === 'daemon'
                ? t('settings.localCli')
                : t('settings.anthropicApi')}
            </span>
            <span style={{ color: 'var(--text-faint)' }}>-</span>
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 180 }}>
              {envMetaLine}
            </span>
          </button>
        </div>
        <button
          type="button"
          aria-label={t('entry.resizeAria')}
          className={`entry-side-resizer${resizing ? ' dragging' : ''}`}
          onMouseDown={(e) => {
            e.preventDefault();
            startWidthRef.current = sidebarWidth;
            startXRef.current = e.clientX;
            setResizing(true);
          }}
        />
      </aside>
      <main className="entry-main">
        <div className="entry-header">
          <div className="entry-tabs" role="tablist">
            <TopTabButton current={topTab} value="workflows" label={t('entry.tabWorkflows')} onClick={setTopTab} />
            <TopTabButton current={topTab} value="inspiration" label="Inspiration" onClick={setTopTab} />
            <TopTabButton current={topTab} value="designs" label={t('entry.tabDesigns')} onClick={setTopTab} />
            <TopTabButton current={topTab} value="examples" label={t('entry.tabExamples')} onClick={setTopTab} />
            <TopTabButton
              current={topTab}
              value="design-systems"
              label={t('entry.tabDesignSystems')}
              onClick={setTopTab}
            />
            <TopTabButton current={topTab} value="library-search" label="Library Search" onClick={setTopTab} />
          </div>
          <div className="entry-header-right">
            <label className="entry-snapshot-btn entry-snapshot-import" title="Import OneShot studio snapshot">
              <Icon name="import" size={13} />
              <span>Import snapshot</span>
              <input
                type="file"
                accept="application/json,.json"
                aria-label="Import snapshot"
                onChange={(event) => {
                  void previewStudioSnapshotImport(event.target.files?.[0]);
                  event.currentTarget.value = '';
                }}
              />
            </label>
            <button
              type="button"
              className="entry-snapshot-btn"
              onClick={exportStudioSnapshot}
              title="Export OneShot studio snapshot"
            >
              <Icon name="download" size={13} />
              <span>Export snapshot</span>
            </button>
            {/* Avatar settings live next to tabs to mirror the project view. */}
            <button
              type="button"
              className="avatar-btn"
              onClick={onOpenSettings}
              title={t('entry.openSettingsTitle')}
              aria-label={t('entry.openSettingsAria')}
            >
              <img
                src="/avatar.png"
                alt=""
                aria-hidden
                draggable={false}
                className="avatar-btn-photo"
              />
            </button>
          </div>
        </div>
        <div className="entry-tab-content">
          {loading ? (
            <CenteredLoader label={t('entry.loadingWorkspace')} />
          ) : (
            <>
              {snapshotImportError ? (
                <div className="entry-snapshot-message danger" role="alert">{snapshotImportError}</div>
              ) : null}
              {snapshotImportStatus ? (
                <div className="entry-snapshot-message" role="status">{snapshotImportStatus}</div>
              ) : null}
              {topTab === 'workflows' ? (
                <OneShotWorkflows
                  skills={skills}
                  designSystems={designSystems}
                  defaultDesignSystemId={defaultDesignSystemId}
                  onCreateProject={onCreateProject}
                />
              ) : null}
              {topTab === 'inspiration' ? (
                <InspirationTab onCreateProject={onCreateProject} />
              ) : null}
              {topTab === 'designs' ? (
                <DesignsTab
                  projects={projects}
                  skills={skills}
                  designSystems={designSystems}
                  onOpen={onOpenProject}
                  onDelete={onDeleteProject}
                />
              ) : null}
              {topTab === 'examples' ? (
                <ExamplesTab skills={skills} onUsePrompt={usePromptFromSkill} />
              ) : null}
              {topTab === 'design-systems' ? (
                <DesignSystemsTab
                  systems={designSystems}
                  selectedId={defaultDesignSystemId}
                  onSelect={onChangeDefaultDesignSystem}
                  onPreview={previewDesignSystem}
                />
              ) : null}
              {topTab === 'library-search' ? (
                <OneShotLibrarySearch
                  projects={projects}
                  onCreateProject={onCreateProject}
                  onOpenProject={onOpenProject}
                />
              ) : null}
            </>
          )}
        </div>
      </main>
      {previewSystem ? (
        <DesignSystemPreviewModal
          system={previewSystem}
          onClose={() => setPreviewSystemId(null)}
        />
      ) : null}
      {snapshotImportPlan ? (
        <div className="modal-backdrop" role="presentation">
          <div className="modal entry-snapshot-modal" role="dialog" aria-modal="true" aria-label="Studio snapshot restore preview">
            <h2>Studio snapshot restore preview</h2>
            <p className="hint">
              Review the packet before restoring local studio libraries. Projects and templates stay archived in the packet for audit.
            </p>
            <div className="entry-snapshot-audit" aria-label="Snapshot import audit">
              <div>
                <span>Incoming</span>
                <strong>{snapshotImportPlan.totals.incoming}</strong>
              </div>
              <div>
                <span>Local</span>
                <strong>{snapshotImportPlan.totals.local}</strong>
              </div>
              <div>
                <span>Conflicts</span>
                <strong>{snapshotImportPlan.totals.conflicts}</strong>
              </div>
              <div>
                <span>Restored</span>
                <strong>{snapshotImportPlan.totals.restored}</strong>
              </div>
            </div>
            <label className="entry-snapshot-mode">
              <span>Conflict handling</span>
              <select
                value={snapshotImportMode}
                onChange={(event) => setSnapshotImportMode(event.target.value as StudioSnapshotImportMode)}
              >
                <option value="merge">Merge without overwriting</option>
                <option value="replace">Replace local studio libraries</option>
              </select>
            </label>
            <div className="entry-snapshot-rows">
              {snapshotImportPlan.sections.map((section) => (
                <div className="entry-snapshot-row" key={section.key}>
                  <strong>{section.label}</strong>
                  <span>
                    {section.incoming} incoming - {section.local} local - {section.conflicts} conflicts - {section.restored} restored
                  </span>
                </div>
              ))}
              <div className="entry-snapshot-row archive">
                <strong>Project archive</strong>
                <span>
                  {snapshotImportPlan.archiveOnly.projects} projects and {snapshotImportPlan.archiveOnly.templates} templates remain audit-only in this restore.
                </span>
              </div>
            </div>
            <div className="row">
              <button type="button" className="secondary" onClick={() => setSnapshotImport(null)}>
                Cancel
              </button>
              <button type="button" className="primary" onClick={restoreStudioSnapshotLocalLibraries}>
                Restore local libraries
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function TopTabButton({
  current,
  value,
  label,
  onClick,
}: {
  current: TopTab;
  value: TopTab;
  label: string;
  onClick: (v: TopTab) => void;
}) {
  return (
    <button
      role="tab"
      data-testid={`entry-tab-${value}`}
      aria-selected={current === value}
      className={`entry-tab ${current === value ? 'active' : ''}`}
      onClick={() => onClick(value)}
    >
      {label}
    </button>
  );
}

// Map a skill's declared mode to project metadata. Falls back to the same
// defaults the new-project form would apply (high-fidelity prototype, no
// speaker notes on decks, no template animations) so 'Use this prompt'
// produces a project indistinguishable from one created via the form. Per-
// skill hints in SKILL.md frontmatter (od.fidelity, od.speaker_notes,
// od.animations) override the defaults so each example reproduces the
// shipped example.html - e.g. wireframe-sketch declares fidelity:wireframe.
function metadataForSkill(skill: SkillSummary): ProjectMetadata {
  const kind = kindForSkill(skill);
  if (kind === 'prototype') {
    return { kind, fidelity: skill.fidelity ?? 'high-fidelity' };
  }
  if (kind === 'deck') {
    return {
      kind,
      speakerNotes:
        typeof skill.speakerNotes === 'boolean' ? skill.speakerNotes : false,
    };
  }
  if (kind === 'template') {
    return {
      kind,
      animations:
        typeof skill.animations === 'boolean' ? skill.animations : false,
    };
  }
  return { kind: 'other' };
}

function kindForSkill(skill: SkillSummary): ProjectKind {
  if (skill.mode === 'deck') return 'deck';
  if (skill.mode === 'prototype') return 'prototype';
  if (skill.mode === 'template') return 'template';
  return 'other';
}
