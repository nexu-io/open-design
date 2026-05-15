import { useEffect, useMemo, useRef, useState } from 'react';
import type {
  ApplyResult,
  InstalledPluginRecord,
} from '@open-design/contracts';
import {
  applyPlugin,
  listPlugins,
  renderPluginBriefTemplate,
  resolvePluginQueryFallback,
} from '../state/projects';
import { useI18n } from '../i18n';
import { Icon } from './Icon';
import { PluginDetailsModal } from './PluginDetailsModal';
import { authorInitials, derivePluginSourceLinks } from '../runtime/plugin-source';

export interface PluginLoopSubmit {
  prompt: string;
  pluginId: string | null;
  skillId?: string | null;
  appliedPluginSnapshotId: string | null;
  pluginTitle: string | null;
  taskKind: string | null;
  pluginInputs?: Record<string, unknown> | null;
  contextPlugins?: Array<{ id: string; title: string; description?: string }> | null;
  // Stage B of plugin-driven-flow-plan: when the user picked a Home
  // chip the rail tells the submit handler which `ProjectKind` to
  // stamp on the new project's metadata. The daemon-side default
  // binding then resolves to the matching scenario plugin (image /
  // video / audio → od-media-generation, others → od-new-generation).
  // Null means the caller did not stamp an explicit kind. HomeView's
  // free-form fallback uses `other` and binds the hidden od-default
  // router plugin so the agent asks for the exact task type in-chat.
  projectKind?: 'prototype' | 'deck' | 'template' | 'image' | 'video' | 'audio' | 'other' | null;
  // Files staged on Home before the project exists. App uploads them
  // into the created project's Design Files before the first auto-send.
  attachments?: File[];
}

interface Props {
  onSubmit: (payload: PluginLoopSubmit) => void;
}

interface ActivePlugin {
  record: InstalledPluginRecord;
  result: ApplyResult;
  inputs: Record<string, unknown>;
}

export function PluginLoopHome({ onSubmit }: Props) {
  const { locale } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingApplyId, setPendingApplyId] = useState<string | null>(null);
  const [active, setActive] = useState<ActivePlugin | null>(null);
  const [prompt, setPrompt] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [detailsRecord, setDetailsRecord] =
    useState<InstalledPluginRecord | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    let cancelled = false;
    void listPlugins().then((rows) => {
      if (cancelled) return;
      setPlugins(rows);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const sortedPlugins = useMemo(() => {
    return [...plugins].sort((a, b) => {
      const aHasQuery = Boolean(a.manifest?.od?.useCase?.query);
      const bHasQuery = Boolean(b.manifest?.od?.useCase?.query);
      if (aHasQuery !== bHasQuery) return aHasQuery ? -1 : 1;
      const aScenario = a.manifest?.od?.kind === 'scenario';
      const bScenario = b.manifest?.od?.kind === 'scenario';
      if (aScenario !== bScenario) return aScenario ? -1 : 1;
      return a.title.localeCompare(b.title);
    });
  }, [plugins]);

  async function usePlugin(record: InstalledPluginRecord) {
    setPendingApplyId(record.id);
    setError(null);
    const result = await applyPlugin(record.id, { locale });
    setPendingApplyId(null);
    if (!result) {
      setError(`Failed to apply ${record.title}. Make sure the daemon is reachable.`);
      return;
    }
    const inputs: Record<string, unknown> = {};
    for (const field of result.inputs ?? []) {
      if (field.default !== undefined) inputs[field.name] = field.default;
    }
    setActive({ record, result, inputs });
    const query = result.query || resolvePluginQueryFallback(record.manifest?.od?.useCase?.query, locale);
    if (query) {
      setPrompt(renderPluginBriefTemplate(query, inputs));
    }
    setDetailsRecord(null);
    requestAnimationFrame(() => textareaRef.current?.focus());
  }

  function openDetails(record: InstalledPluginRecord) {
    setDetailsRecord(record);
  }

  function closeDetails() {
    setDetailsRecord(null);
  }

  function clearActive() {
    setActive(null);
    setPrompt('');
  }

  function submit() {
    const trimmed = prompt.trim();
    if (!trimmed) return;
    onSubmit({
      prompt: trimmed,
      pluginId: active?.record.id ?? null,
      appliedPluginSnapshotId: active?.result.appliedPlugin?.snapshotId ?? null,
      pluginTitle: active?.record.title ?? null,
      taskKind: active?.result.appliedPlugin?.taskKind ?? null,
    });
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (
      e.key === 'Enter' &&
      !e.shiftKey &&
      !e.metaKey &&
      !e.ctrlKey &&
      !e.altKey
    ) {
      e.preventDefault();
      submit();
    }
  }

  const canSubmit = prompt.trim().length > 0;

  return (
    <div className="plugin-loop-home" data-testid="plugin-loop-home">
      <div className="plugin-loop-home__hero">
        <h2 className="plugin-loop-home__title">What do you want to design?</h2>
        <p className="plugin-loop-home__subtitle">
          Pick a plugin below, click <strong>Use example query</strong> to load
          a starter prompt, then press <kbd>Enter</kbd>.
        </p>
        {active ? (
          <div className="plugin-loop-home__active" data-active-plugin-id={active.record.id}>
            <span className="plugin-loop-home__active-chip">
              <span className="plugin-loop-home__active-dot" aria-hidden />
              <span>Plugin: {active.record.title}</span>
              <button
                type="button"
                className="plugin-loop-home__active-clear"
                onClick={clearActive}
                aria-label="Clear active plugin"
                title="Clear active plugin"
              >
                ×
              </button>
            </span>
            {active.result.contextItems && active.result.contextItems.length > 0 ? (
              <span className="plugin-loop-home__context-summary">
                {active.result.contextItems.length} context items resolved
              </span>
            ) : null}
          </div>
        ) : null}
        <div className="plugin-loop-home__input-wrap">
          <textarea
            ref={textareaRef}
            className="plugin-loop-home__input"
            data-testid="plugin-loop-input"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={onKeyDown}
            placeholder={
              active
                ? 'Edit the example query or write your own…'
                : 'Type a prompt, or pick a plugin below to load an example…'
            }
            rows={3}
          />
          <button
            type="button"
            className="plugin-loop-home__submit"
            data-testid="plugin-loop-submit"
            onClick={submit}
            disabled={!canSubmit}
            title={canSubmit ? 'Press Enter to run' : 'Type something to run'}
          >
            Run ↵
          </button>
        </div>
        {error ? (
          <div role="alert" className="plugin-loop-home__error">
            {error}
          </div>
        ) : null}
      </div>

      <div className="plugin-loop-home__rail-header">
        <span>Plugins</span>
        <span className="plugin-loop-home__rail-count">
          {loading ? '…' : `${sortedPlugins.length} installed`}
        </span>
      </div>
      <div className="plugin-loop-home__grid" role="list">
        {loading ? (
          <div className="plugin-loop-home__empty">Loading plugins…</div>
        ) : sortedPlugins.length === 0 ? (
          <div className="plugin-loop-home__empty">
            No plugins installed. Install one with{' '}
            <code>od plugin install &lt;source&gt;</code>.
          </div>
        ) : (
          sortedPlugins.map((p) => {
            const hasQuery = Boolean(p.manifest?.od?.useCase?.query);
            const isActive = active?.record.id === p.id;
            const isPending = pendingApplyId === p.id;
            const links = derivePluginSourceLinks(p);
            return (
              <div
                key={p.id}
                role="listitem"
                className={`plugin-loop-home__card${isActive ? ' is-active' : ''}`}
                data-plugin-id={p.id}
              >
                <div className="plugin-loop-home__card-head">
                  <span className="plugin-loop-home__card-title">{p.title}</span>
                  <span
                    className={`plugin-loop-home__card-trust trust-${p.trust}`}
                  >
                    {p.trust}
                  </span>
                </div>
                {p.manifest?.description ? (
                  <div className="plugin-loop-home__card-desc">
                    {p.manifest.description}
                  </div>
                ) : null}
                <div className="plugin-loop-home__card-meta">
                  {p.manifest?.od?.taskKind ? (
                    <span>{p.manifest.od.taskKind}</span>
                  ) : null}
                  {p.manifest?.od?.kind ? <span>· {p.manifest.od.kind}</span> : null}
                </div>
                {links.authorName || links.sourceUrl ? (
                  <div
                    className="plugin-loop-home__card-byline"
                    data-testid={`plugin-card-byline-${p.id}`}
                  >
                    {links.authorName ? (
                      <span className="plugin-loop-home__card-byline-author">
                        <CardAvatar
                          name={links.authorName}
                          avatarUrl={links.authorAvatarUrl}
                        />
                        <span>by {links.authorName}</span>
                      </span>
                    ) : null}
                    {links.sourceUrl ? (
                      <a
                        href={links.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="plugin-loop-home__card-byline-source"
                        title={`View source: ${links.sourceLabel}`}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <Icon
                          name={p.sourceKind === 'github' ? 'github' : 'external-link'}
                          size={11}
                        />
                        <span>{links.sourceLabel}</span>
                      </a>
                    ) : null}
                  </div>
                ) : null}
                <div className="plugin-loop-home__card-actions">
                  <button
                    type="button"
                    className="plugin-loop-home__card-details"
                    onClick={() => openDetails(p)}
                    aria-label={`View details for ${p.title}`}
                    data-testid={`view-details-${p.id}`}
                    title="View plugin details"
                  >
                    <Icon name="eye" size={12} />
                    <span>Details</span>
                  </button>
                  <button
                    type="button"
                    className="plugin-loop-home__card-action"
                    onClick={() => void usePlugin(p)}
                    disabled={isPending || pendingApplyId !== null}
                    aria-busy={isPending ? 'true' : undefined}
                    data-testid={`use-example-${p.id}`}
                  >
                    {isPending
                      ? 'Applying…'
                      : hasQuery
                        ? isActive
                          ? 'Reload example query'
                          : 'Use example query'
                        : isActive
                          ? 'Plugin active'
                          : 'Use plugin'}
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
      {detailsRecord ? (
        <PluginDetailsModal
          record={detailsRecord}
          onClose={closeDetails}
          onUse={(record) => void usePlugin(record)}
          isApplying={pendingApplyId === detailsRecord.id}
        />
      ) : null}
    </div>
  );
}

interface CardAvatarProps {
  name: string;
  avatarUrl: string | null;
}

function CardAvatar({ name, avatarUrl }: CardAvatarProps) {
  // Same hide-on-error pattern as the modal avatar — keep failures
  // silent so a renamed/missing github profile doesn't show a
  // broken-image icon in the grid.
  const [broken, setBroken] = useState(false);
  if (avatarUrl && !broken) {
    return (
      <img
        className="plugin-loop-home__card-avatar"
        src={avatarUrl}
        alt=""
        loading="lazy"
        referrerPolicy="no-referrer"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <span
      className="plugin-loop-home__card-avatar plugin-loop-home__card-avatar--fallback"
      aria-hidden
    >
      {authorInitials(name)}
    </span>
  );
}
