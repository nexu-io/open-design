import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
} from 'react';
import { Icon } from './Icon';
import { useT } from '../i18n';

type Translate = ReturnType<typeof useT>;
import { renderMarkdown } from '../runtime/markdown';
import type {
  MemoryChangeEvent,
  MemoryEntry,
  MemoryEntrySummary,
  MemoryExtractionEvent,
  MemoryExtractionRecord,
  MemoryExtractionSkipReason,
  MemoryExtractionsResponse,
  MemoryListResponse,
  MemoryType,
} from '@open-design/contracts';

const TYPES: MemoryType[] = ['user', 'feedback', 'project', 'reference'];

interface DraftEntry {
  id?: string;
  name: string;
  description: string;
  type: MemoryType;
  body: string;
}

const EMPTY_DRAFT: DraftEntry = {
  name: '',
  description: '',
  type: 'user',
  body: '',
};

// Small uppercase caption used above each form field. Centralised so
// every field renders with the same color/letter-spacing/baseline; this
// is what gives the editor a Settings-form rhythm rather than a stack
// of unlabelled inputs.
const FIELD_LABEL_STYLE: CSSProperties = {
  display: 'block',
  fontSize: 10,
  fontWeight: 600,
  letterSpacing: 0.5,
  textTransform: 'uppercase',
  color: 'var(--text-muted, #888)',
  marginBottom: 4,
};

// Click-to-prefill examples shown above the editor when creating a new
// memory. Three starters cover the most common reasons a person writes
// a memory by hand: tell the assistant about themselves, lock in a
// repeated UI/output preference, or pin the current project. The
// strings live behind i18n keys so each chip stays localized.
const STARTERS: ReadonlyArray<{
  type: MemoryType;
  nameKey: 'settings.memoryStarterUserName' | 'settings.memoryStarterFeedbackName' | 'settings.memoryStarterProjectName';
  descKey: 'settings.memoryStarterUserDesc' | 'settings.memoryStarterFeedbackDesc' | 'settings.memoryStarterProjectDesc';
  bodyKey: 'settings.memoryStarterUserBody' | 'settings.memoryStarterFeedbackBody' | 'settings.memoryStarterProjectBody';
}> = [
  {
    type: 'user',
    nameKey: 'settings.memoryStarterUserName',
    descKey: 'settings.memoryStarterUserDesc',
    bodyKey: 'settings.memoryStarterUserBody',
  },
  {
    type: 'feedback',
    nameKey: 'settings.memoryStarterFeedbackName',
    descKey: 'settings.memoryStarterFeedbackDesc',
    bodyKey: 'settings.memoryStarterFeedbackBody',
  },
  {
    type: 'project',
    nameKey: 'settings.memoryStarterProjectName',
    descKey: 'settings.memoryStarterProjectDesc',
    bodyKey: 'settings.memoryStarterProjectBody',
  },
];

async function fetchMemoryList(): Promise<MemoryListResponse> {
  const resp = await fetch('/api/memory');
  if (!resp.ok) {
    return { enabled: true, rootDir: '', index: '', entries: [], extraction: null };
  }
  return (await resp.json()) as MemoryListResponse;
}

async function fetchMemoryEntry(id: string): Promise<MemoryEntry | null> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`);
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

async function saveMemoryEntry(draft: DraftEntry): Promise<MemoryEntry | null> {
  const url = draft.id
    ? `/api/memory/${encodeURIComponent(draft.id)}`
    : '/api/memory';
  const resp = await fetch(url, {
    method: draft.id ? 'PUT' : 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(draft),
  });
  if (!resp.ok) return null;
  const json = (await resp.json()) as { entry: MemoryEntry };
  return json.entry ?? null;
}

async function deleteMemoryEntry(id: string): Promise<boolean> {
  const resp = await fetch(`/api/memory/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
  return resp.ok;
}

async function saveMemoryIndex(index: string): Promise<boolean> {
  const resp = await fetch('/api/memory/index', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ index }),
  });
  return resp.ok;
}

async function setMemoryEnabled(enabled: boolean): Promise<boolean> {
  const resp = await fetch('/api/memory/config', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ enabled }),
  });
  return resp.ok;
}

async function fetchExtractions(): Promise<MemoryExtractionRecord[]> {
  const resp = await fetch('/api/memory/extractions');
  if (!resp.ok) return [];
  const json = (await resp.json()) as MemoryExtractionsResponse;
  return json.extractions ?? [];
}

// Drop one extraction row server-side. Returns true on a 2xx — the
// listing always re-fetches from the SSE stream, so the UI doesn't need
// the new state back here.
async function deleteExtraction(id: string): Promise<boolean> {
  const resp = await fetch(
    `/api/memory/extractions/${encodeURIComponent(id)}`,
    { method: 'DELETE' },
  );
  return resp.ok;
}

async function clearExtractionHistory(): Promise<boolean> {
  const resp = await fetch('/api/memory/extractions', { method: 'DELETE' });
  return resp.ok;
}

// Map a record back to a single human label for the small badge that
// appears next to the row's preview text. Centralised so phase + skip
// reason render consistently across the empty banner and the list.
//
// `tone` only covers the four phases we actually render in the list —
// the `'deleted'` and `'cleared'` pseudo-phases ride the SSE channel
// and never show up in `extractions[]`, so they're filtered out before
// reaching describeRecord. We fall back to 'skipped' defensively in
// case a daemon-side regression sneaks one through.
function describeRecord(
  record: MemoryExtractionRecord,
  t: Translate,
): {
  phaseLabel: string;
  reasonLabel: string | null;
  kindLabel: string;
  tone: 'running' | 'success' | 'skipped' | 'failed';
} {
  const tone: 'running' | 'success' | 'skipped' | 'failed' =
    record.phase === 'running'
    || record.phase === 'success'
    || record.phase === 'failed'
      ? record.phase
      : 'skipped';
  const phaseLabel = (() => {
    switch (record.phase) {
      case 'running':
        return t('settings.memoryExtractionPhaseRunning');
      case 'success':
        return t('settings.memoryExtractionPhaseSuccess');
      case 'skipped':
        return t('settings.memoryExtractionPhaseSkipped');
      case 'failed':
        return t('settings.memoryExtractionPhaseFailed');
      default:
        return record.phase;
    }
  })();
  const reasonLabel = (() => {
    if (record.phase !== 'skipped') return null;
    const reason: MemoryExtractionSkipReason | undefined = record.reason;
    if (reason === 'no-provider') return t('settings.memoryExtractionSkipNoProvider');
    if (reason === 'memory-disabled') return t('settings.memoryExtractionSkipDisabled');
    if (reason === 'empty-message') return t('settings.memoryExtractionSkipEmpty');
    if (reason === 'no-match') return t('settings.memoryExtractionSkipNoMatch');
    return null;
  })();
  // Records written before the `kind` field existed default to 'llm' —
  // that was the only writer at the time, so labelling them as such
  // keeps the history list legible after upgrading.
  const kind = record.kind ?? 'llm';
  const kindLabel =
    kind === 'heuristic'
      ? t('settings.memoryExtractionKindHeuristic')
      : t('settings.memoryExtractionKindLlm');
  return { phaseLabel, reasonLabel, kindLabel, tone };
}

function formatRelativeTime(at: number, now: number): string {
  const delta = Math.max(0, now - at);
  if (delta < 60_000) return `${Math.round(delta / 1000)}s`;
  if (delta < 3_600_000) return `${Math.round(delta / 60_000)}m`;
  if (delta < 86_400_000) return `${Math.round(delta / 3_600_000)}h`;
  return `${Math.round(delta / 86_400_000)}d`;
}

// Wall-clock timestamp shown next to the relative age. The user asked
// to "see when each extraction started" — relative ages on their own
// drift after the panel sits open for a few minutes, and "5m" gives no
// hint about whether that 5m was during today's session or a stale row
// from yesterday. We omit the date for same-day rows so the line stays
// short, and tack on the date for older rows.
function formatAbsoluteTime(at: number, now: number): string {
  const date = new Date(at);
  const today = new Date(now);
  const sameDay =
    date.getFullYear() === today.getFullYear()
    && date.getMonth() === today.getMonth()
    && date.getDate() === today.getDate();
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
  if (sameDay) return time;
  const day = date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  });
  return `${day} ${time}`;
}

function formatDuration(record: MemoryExtractionRecord): string | null {
  if (!record.finishedAt) return null;
  const ms = Math.max(0, record.finishedAt - record.startedAt);
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  return `${Math.round(ms / 1000)}s`;
}

type FlashKind = 'created' | 'saved' | 'deleted' | 'indexSaved';

export function MemorySection() {
  const t = useT();
  const [enabled, setEnabled] = useState(true);
  const [rootDir, setRootDir] = useState('');
  const [index, setIndex] = useState('');
  const [indexDraft, setIndexDraft] = useState<string | null>(null);
  const [entries, setEntries] = useState<MemoryEntrySummary[]>([]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const [previewBody, setPreviewBody] = useState<string | null>(null);
  const [editing, setEditing] = useState<DraftEntry | null>(null);
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState<'all' | MemoryType>('all');
  // Brief inline confirmation after a manual save/create/delete. The
  // form vanishes on success and the existing list re-renders, but
  // those signals are subtle — a 1.8s pill makes "your click did
  // something" obvious without the heavyweight global toast.
  const [flash, setFlash] = useState<{ kind: FlashKind; key: number } | null>(
    null,
  );
  // Recent LLM-extraction attempts, newest first. Driven by a one-shot
  // fetch on mount + live SSE updates merged by id so phase transitions
  // (running → success) replace the row in place.
  const [extractions, setExtractions] = useState<MemoryExtractionRecord[]>([]);

  const fireFlash = useCallback((kind: FlashKind) => {
    setFlash({ kind, key: Date.now() });
  }, []);

  useEffect(() => {
    if (!flash) return;
    const id = setTimeout(() => setFlash(null), 1800);
    return () => clearTimeout(id);
  }, [flash]);

  const flashLabel = useMemo<Record<FlashKind, string>>(
    () => ({
      created: t('settings.memoryFlashCreated'),
      saved: t('settings.memoryFlashSaved'),
      deleted: t('settings.memoryFlashDeleted'),
      indexSaved: t('settings.memoryFlashIndexSaved'),
    }),
    [t],
  );

  const TYPE_LABEL: Record<MemoryType, string> = useMemo(
    () => ({
      user: t('settings.memoryTypeUser'),
      feedback: t('settings.memoryTypeFeedback'),
      project: t('settings.memoryTypeProject'),
      reference: t('settings.memoryTypeReference'),
    }),
    [t],
  );

  const reload = useCallback(async () => {
    const list = await fetchMemoryList();
    setEnabled(list.enabled);
    setRootDir(list.rootDir);
    setIndex(list.index);
    setEntries(list.entries);
  }, []);

  const reloadExtractions = useCallback(async () => {
    setExtractions(await fetchExtractions());
  }, []);

  useEffect(() => {
    void reload();
    void reloadExtractions();
  }, [reload, reloadExtractions]);

  // Live updates: when the daemon emits a memory change event (chat
  // hook, LLM extractor, settings PATCH from a different tab, curl…),
  // re-fetch the list so what the user sees stays in sync. We
  // deliberately ignore events the user just triggered themselves
  // (manual upserts/deletes via this same panel) by listening only to
  // the broader signals — the local code already updated state
  // optimistically, but a re-fetch keeps mtime / index in sync anyway,
  // so we just always reload on any change. EventSource auto-reconnects
  // on temporary daemon hiccups.
  useEffect(() => {
    const es = new EventSource('/api/memory/events');
    es.addEventListener('change', (raw) => {
      try {
        const ev = JSON.parse((raw as MessageEvent).data) as MemoryChangeEvent;
        // Don't reload if the event payload is just a connection ping.
        if (!ev || !ev.kind) return;
        void reload();
      } catch {
        // Malformed — ignore.
      }
    });
    es.addEventListener('extraction', (raw) => {
      try {
        const ev = JSON.parse((raw as MessageEvent).data) as MemoryExtractionEvent;
        if (!ev || !ev.id) return;
        // Pseudo-phases: the daemon emits these synthetically when a
        // row is dropped from the buffer, either by the manual delete
        // button per row or by the "Clear" affordance at the top.
        if (ev.phase === 'cleared') {
          setExtractions([]);
          return;
        }
        if (ev.phase === 'deleted') {
          setExtractions((prev) => prev.filter((r) => r.id !== ev.id));
          return;
        }
        // Merge by id: phase transitions for an in-flight attempt
        // collapse onto a single row instead of stacking N entries
        // for the same attempt. New ids are unshifted so the latest
        // appears at the top.
        setExtractions((prev) => {
          const existing = prev.findIndex((r) => r.id === ev.id);
          if (existing >= 0) {
            const next = prev.slice();
            next[existing] = ev;
            return next;
          }
          return [ev, ...prev].slice(0, 30);
        });
      } catch {
        // Malformed — ignore.
      }
    });
    return () => {
      es.close();
    };
  }, [reload]);

  const filtered = useMemo(() => {
    if (filter === 'all') return entries;
    return entries.filter((e) => e.type === filter);
  }, [entries, filter]);

  // The "no API key" banner only shows when the most recent attempt
  // skipped for that specific reason. We don't show it for
  // memory-disabled (the user's own toggle) or empty-message (a
  // routine no-op on tool-only turns); those skips just appear in the
  // history list with a muted subtitle.
  const showNoProviderBanner = useMemo(() => {
    const latest = extractions[0];
    return Boolean(
      latest && latest.phase === 'skipped' && latest.reason === 'no-provider',
    );
  }, [extractions]);

  // Now-clock for relative timestamps in the extraction list. Refresh
  // every 30s so "12s ago" doesn't get stuck reading "12s ago" five
  // minutes after the user opened the panel. Using state (not a ref)
  // keeps the re-render in the React scheduler.
  const [nowClock, setNowClock] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowClock(Date.now()), 30_000);
    return () => clearInterval(id);
  }, []);

  const grouped = useMemo(() => {
    const map = new Map<MemoryType, MemoryEntrySummary[]>();
    for (const entry of filtered) {
      const list = map.get(entry.type) ?? [];
      list.push(entry);
      map.set(entry.type, list);
    }
    return map;
  }, [filtered]);

  const openPreview = useCallback(
    async (id: string) => {
      if (previewId === id) {
        setPreviewId(null);
        setPreviewBody(null);
        return;
      }
      setPreviewId(id);
      setPreviewBody(null);
      const entry = await fetchMemoryEntry(id);
      setPreviewBody(entry?.body ?? '');
    },
    [previewId],
  );

  const startEdit = useCallback(async (id: string) => {
    const entry = await fetchMemoryEntry(id);
    if (!entry) return;
    setEditing({
      id: entry.id,
      name: entry.name,
      description: entry.description,
      type: entry.type,
      body: entry.body,
    });
  }, []);

  const startNew = useCallback(() => {
    setEditing({ ...EMPTY_DRAFT });
  }, []);

  const cancelEdit = useCallback(() => {
    setEditing(null);
  }, []);

  const onSave = useCallback(async () => {
    if (!editing) return;
    if (!editing.name.trim()) return;
    const wasNew = !editing.id;
    setBusy(true);
    try {
      const entry = await saveMemoryEntry(editing);
      if (entry) {
        await reload();
        setEditing(null);
        fireFlash(wasNew ? 'created' : 'saved');
      }
    } finally {
      setBusy(false);
    }
  }, [editing, reload, fireFlash]);

  const onDelete = useCallback(
    async (id: string) => {
      const ok = await deleteMemoryEntry(id);
      if (ok) {
        await reload();
        fireFlash('deleted');
      }
    },
    [reload, fireFlash],
  );

  const onToggleEnabled = useCallback(async (next: boolean) => {
    setEnabled(next);
    await setMemoryEnabled(next);
  }, []);

  const onSaveIndex = useCallback(async () => {
    if (indexDraft === null) return;
    setBusy(true);
    try {
      const ok = await saveMemoryIndex(indexDraft);
      if (ok) {
        setIndex(indexDraft);
        setIndexDraft(null);
        fireFlash('indexSaved');
      }
    } finally {
      setBusy(false);
    }
  }, [indexDraft, fireFlash]);

  const onDeleteExtraction = useCallback(async (id: string) => {
    // Optimistic removal: drop the row immediately so the click feels
    // instant. The SSE 'deleted' event will arrive moments later and is
    // a no-op against an already-removed id; if the request fails we
    // re-fetch to put the row back instead of silently lying.
    setExtractions((prev) => prev.filter((r) => r.id !== id));
    const ok = await deleteExtraction(id);
    if (!ok) {
      void reloadExtractions();
    }
  }, [reloadExtractions]);

  const onClearExtractions = useCallback(async () => {
    setExtractions([]);
    const ok = await clearExtractionHistory();
    if (!ok) {
      void reloadExtractions();
    }
  }, [reloadExtractions]);

  return (
    <section className={`settings-section${enabled ? '' : ' is-disabled'}`}>
      <div className="section-head">
        <div>
          <h3>{t('settings.memory')}</h3>
          <p className="hint">{t('settings.memoryDescription')}</p>
        </div>
        <label
          className="toggle-switch"
          title={t('settings.memoryEnableLabel')}
          aria-label={t('settings.memoryEnableLabel')}
        >
          <input
            type="checkbox"
            checked={enabled}
            onChange={(e) => onToggleEnabled(e.target.checked)}
          />
          <span className="toggle-slider" />
        </label>
      </div>

      {!enabled ? (
        <div role="status" className="memory-disabled-banner">
          <strong>{t('settings.memoryDisabled')}</strong> —{' '}
          {t('settings.memoryDisabledBanner')}
        </div>
      ) : null}

      {enabled && showNoProviderBanner ? (
        <div role="status" className="memory-noprovider-banner">
          <strong>{t('settings.memoryNoProviderBannerTitle')}</strong> —{' '}
          {t('settings.memoryNoProviderBannerBody')}
        </div>
      ) : null}

      {rootDir ? (
        <p className="hint memory-root-dir">
          <code>{rootDir}</code>
        </p>
      ) : null}

      <div className="library-toolbar is-row">
        <div className="library-filters">
          <button
            type="button"
            className={`filter-pill${filter === 'all' ? ' active' : ''}`}
            onClick={() => setFilter('all')}
          >
            {t('settings.memoryAll')}
            <span className="filter-pill-count">{entries.length}</span>
          </button>
          {TYPES.map((type) => {
            const count = entries.filter((e) => e.type === type).length;
            if (count === 0 && filter !== type) return null;
            return (
              <button
                key={type}
                type="button"
                className={`filter-pill${filter === type ? ' active' : ''}`}
                onClick={() => setFilter(type)}
              >
                {TYPE_LABEL[type]}
                <span className="filter-pill-count">{count}</span>
              </button>
            );
          })}
        </div>
        <button
          type="button"
          className="primary library-toolbar-action"
          onClick={startNew}
          disabled={editing !== null}
        >
          <Icon name="plus" size={14} />
          <span>{t('settings.memoryNew')}</span>
        </button>
      </div>

      {flash ? (
        <div
          key={flash.key}
          role="status"
          aria-live="polite"
          className="memory-flash-pill"
        >
          {flashLabel[flash.kind]}
        </div>
      ) : null}

      {editing ? (
        <div
          className="library-card"
          style={{
            flexDirection: 'column',
            alignItems: 'stretch',
            gap: 14,
            padding: 14,
            background: 'var(--surface-subtle, rgba(0,0,0,0.02))',
            border: '1px solid var(--border-subtle, rgba(0,0,0,0.08))',
            borderRadius: 10,
          }}
        >
          {!editing.id ? (
            <div
              style={{
                display: 'flex',
                flexWrap: 'wrap',
                alignItems: 'center',
                gap: 6,
                paddingBottom: 10,
                borderBottom: '1px solid var(--border-subtle, rgba(0,0,0,0.06))',
              }}
            >
              <span
                style={{
                  ...FIELD_LABEL_STYLE,
                  display: 'inline-block',
                  marginRight: 4,
                  marginBottom: 0,
                }}
              >
                {t('settings.memoryStartersLabel')}
              </span>
              {STARTERS.map((starter) => (
                <button
                  key={starter.nameKey}
                  type="button"
                  className="filter-pill"
                  onClick={() =>
                    setEditing({
                      id: editing.id,
                      type: starter.type,
                      name: t(starter.nameKey),
                      description: t(starter.descKey),
                      body: t(starter.bodyKey),
                    })
                  }
                  title={t(starter.descKey)}
                  style={{ display: 'inline-flex', alignItems: 'center' }}
                >
                  {t(starter.nameKey)}
                </button>
              ))}
            </div>
          ) : null}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 12,
              width: '100%',
            }}
          >
            <div style={{ display: 'flex', gap: 10, alignItems: 'flex-end' }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <label style={FIELD_LABEL_STYLE}>
                  {t('settings.memoryNameLabel')}
                </label>
                <input
                  type="text"
                  placeholder={t('settings.memoryName')}
                  value={editing.name}
                  onChange={(e) =>
                    setEditing({ ...editing, name: e.target.value })
                  }
                  style={{ width: '100%' }}
                />
              </div>
              <div style={{ flex: '0 0 auto', minWidth: 120 }}>
                <label style={FIELD_LABEL_STYLE}>
                  {t('settings.memoryTypeLabel')}
                </label>
                <select
                  value={editing.type}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      type: e.target.value as MemoryType,
                    })
                  }
                  style={{ width: '100%' }}
                >
                  {TYPES.map((tt) => (
                    <option key={tt} value={tt}>
                      {TYPE_LABEL[tt]}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label style={FIELD_LABEL_STYLE}>
                {t('settings.memoryDescLabel')}
              </label>
              <input
                type="text"
                placeholder={t('settings.memoryDesc')}
                value={editing.description}
                onChange={(e) =>
                  setEditing({ ...editing, description: e.target.value })
                }
                style={{ width: '100%' }}
              />
            </div>
            <div>
              <label style={FIELD_LABEL_STYLE}>
                {t('settings.memoryBodyLabel')}
              </label>
              <textarea
                placeholder={t('settings.memoryBody')}
                value={editing.body}
                onChange={(e) =>
                  setEditing({ ...editing, body: e.target.value })
                }
                rows={7}
                style={{
                  width: '100%',
                  fontFamily: 'monospace',
                  fontSize: 12,
                  lineHeight: 1.5,
                }}
              />
              <p className="hint" style={{ fontSize: 11, marginTop: 4 }}>
                {t('settings.memoryBodyHint')}
              </p>
            </div>
          </div>
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
            }}
          >
            <span
              className="hint"
              style={{
                fontSize: 11,
                margin: 0,
                color: 'var(--text-muted, #888)',
              }}
            >
              {t('settings.memorySaveHint')}
            </span>
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="ghost" onClick={cancelEdit}>
                {t('common.cancel')}
              </button>
              <button
                type="button"
                className="primary"
                onClick={onSave}
                disabled={busy || !editing.name.trim()}
              >
                {editing.id ? t('common.save') : t('common.create')}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="library-content">
        {filtered.length === 0 ? (
          <p className="library-empty">
            {t('settings.memoryEmpty')}{' '}
            <code>{t('settings.memoryEmptyHintZh')}</code> /{' '}
            <code>{t('settings.memoryEmptyHintEn')}</code>
          </p>
        ) : (
          TYPES.filter((tt) => grouped.has(tt)).map((type) => (
            <div key={type} className="library-group">
              <h4 className="library-group-title">
                {TYPE_LABEL[type]}{' '}
                <span className="library-group-count">
                  {grouped.get(type)!.length}
                </span>
              </h4>
              {grouped.get(type)!.map((entry) => (
                <div key={entry.id} className="library-card">
                  <div className="library-card-info">
                    <div className="library-card-title-row">
                      <span className="library-card-name">{entry.name}</span>
                      <span className="library-card-badge">{entry.id}</span>
                    </div>
                    <div className="library-card-desc">
                      {entry.description || '—'}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="library-card-expand"
                    onClick={() => openPreview(entry.id)}
                    title={t('settings.memoryPreview')}
                  >
                    <Icon
                      name={previewId === entry.id ? 'close' : 'chevron-right'}
                      size={14}
                    />
                  </button>
                  <button
                    type="button"
                    className="ghost library-card-action"
                    onClick={() => startEdit(entry.id)}
                    title={t('settings.memoryEdit')}
                  >
                    <Icon name="edit" size={14} />
                  </button>
                  <button
                    type="button"
                    className="ghost library-card-action"
                    onClick={() => onDelete(entry.id)}
                    title={t('settings.memoryDelete')}
                  >
                    <Icon name="close" size={14} />
                  </button>
                  {previewId === entry.id && (
                    <div className="library-preview" style={{ width: '100%' }}>
                      {previewBody === null ? (
                        <p>{t('common.loading')}</p>
                      ) : previewBody ? (
                        <div className="library-preview-body">
                          {renderMarkdown(previewBody)}
                        </div>
                      ) : (
                        <p className="hint">—</p>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ))
        )}
      </div>

      <details className="library-group memory-extractions" style={{ marginTop: 16 }}>
        <summary className="memory-details-summary">
          <span className="memory-details-title">
            {t('settings.memoryExtractions')}
          </span>
          {extractions.length > 0 ? (
            <span className="filter-pill-count">{extractions.length}</span>
          ) : null}
          {extractions.some((r) => r.phase === 'running') ? (
            <span
              className="memory-extraction-pill is-running"
              aria-label={t('settings.memoryExtractionPhaseRunning')}
              title={t('settings.memoryExtractionPhaseRunning')}
            >
              {t('settings.memoryExtractionPhaseRunning')}
            </span>
          ) : null}
        </summary>
        <p className="hint" style={{ marginTop: 4, marginBottom: 8 }}>
          {t('settings.memoryExtractionsHint')}
        </p>
        <div
          style={{
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 6,
            marginBottom: 8,
          }}
        >
          {extractions.length > 0 ? (
            <button
              type="button"
              className="ghost"
              onClick={() => void onClearExtractions()}
              title={t('settings.memoryExtractionsClearTitle')}
            >
              <Icon name="close" size={12} />{' '}
              <span style={{ marginLeft: 4 }}>
                {t('settings.memoryExtractionsClear')}
              </span>
            </button>
          ) : null}
          <button
            type="button"
            className="ghost"
            onClick={() => void reloadExtractions()}
            title={t('settings.memoryExtractionsRefresh')}
          >
            <Icon name="refresh" size={12} />{' '}
            <span style={{ marginLeft: 4 }}>
              {t('settings.memoryExtractionsRefresh')}
            </span>
          </button>
        </div>
        {extractions.length === 0 ? (
          <p className="library-empty">{t('settings.memoryExtractionsEmpty')}</p>
        ) : (
          <ul className="memory-extraction-list">
            {extractions.map((record) => {
              const desc = describeRecord(record, t);
              const duration = formatDuration(record);
              return (
                <li
                  key={record.id}
                  className={`memory-extraction-item is-${desc.tone}`}
                >
                  <div className="memory-extraction-row">
                    <span
                      className={`memory-extraction-pill is-${desc.tone}`}
                    >
                      {desc.phaseLabel}
                    </span>
                    <span className="memory-extraction-meta memory-extraction-kind">
                      {desc.kindLabel}
                    </span>
                    {record.provider ? (
                      <span className="memory-extraction-meta">
                        {record.provider.kind} · {record.provider.model} ·{' '}
                        {record.provider.credentialSource === 'env'
                          ? t('settings.memoryExtractionProviderEnv')
                          : record.provider.credentialSource === 'memory-config'
                            ? t('settings.memoryExtractionProviderOverride')
                            : t('settings.memoryExtractionProviderMediaConfig')}
                      </span>
                    ) : null}
                    <span
                      className="memory-extraction-meta"
                      title={new Date(record.startedAt).toLocaleString()}
                    >
                      {formatAbsoluteTime(record.startedAt, nowClock)} ·{' '}
                      {formatRelativeTime(record.startedAt, nowClock)}
                    </span>
                    {duration ? (
                      <span className="memory-extraction-meta">
                        {t('settings.memoryExtractionDuration')} {duration}
                      </span>
                    ) : null}
                    <button
                      type="button"
                      className="ghost memory-extraction-delete"
                      onClick={() => void onDeleteExtraction(record.id)}
                      title={t('settings.memoryExtractionDelete')}
                      aria-label={t('settings.memoryExtractionDelete')}
                      style={{ marginLeft: 'auto', padding: '2px 6px' }}
                    >
                      <Icon name="close" size={12} />
                    </button>
                  </div>
                  <div className="memory-extraction-preview">
                    {record.userMessagePreview || '—'}
                  </div>
                  {desc.reasonLabel ? (
                    <div className="memory-extraction-reason">
                      {desc.reasonLabel}
                    </div>
                  ) : null}
                  {record.phase === 'failed' && record.error ? (
                    <div className="memory-extraction-reason">
                      {record.error}
                    </div>
                  ) : null}
                  {record.phase === 'success' &&
                  typeof record.writtenCount === 'number' ? (
                    <div className="memory-extraction-counts">
                      {typeof record.proposedCount === 'number' ? (
                        <span>
                          {record.proposedCount}{' '}
                          {t('settings.memoryExtractionProposed')}
                        </span>
                      ) : null}
                      <span>
                        {record.writtenCount}{' '}
                        {t('settings.memoryExtractionWritten')}
                      </span>
                      {Array.isArray(record.writtenIds) &&
                      record.writtenIds.length > 0 ? (
                        <span className="memory-extraction-ids">
                          {record.writtenIds.map((id: string) => (
                            <button
                              key={id}
                              type="button"
                              className="filter-pill"
                              onClick={() => openPreview(id)}
                              title={id}
                            >
                              {id}
                            </button>
                          ))}
                        </span>
                      ) : null}
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </details>

      <details className="library-group" style={{ marginTop: 16 }}>
        <summary className="memory-details-summary">
          <span className="memory-details-title">
            {t('settings.memoryIndex')}
          </span>
        </summary>
        <textarea
          value={indexDraft ?? index}
          onChange={(e) => setIndexDraft(e.target.value)}
          rows={8}
          style={{ width: '100%', marginTop: 8, fontFamily: 'monospace' }}
        />
        <div
          style={{
            display: 'flex',
            gap: 8,
            alignItems: 'center',
            justifyContent: 'space-between',
            marginTop: 6,
            flexWrap: 'wrap',
          }}
        >
          <span
            className="hint"
            style={{
              fontSize: 11,
              margin: 0,
              color:
                indexDraft !== null
                  ? 'var(--text-warning, #b06a00)'
                  : 'var(--text-muted, #888)',
              fontWeight: indexDraft !== null ? 600 : 400,
            }}
          >
            {indexDraft !== null
              ? `● ${t('settings.memoryIndexUnsaved')} — ${t('settings.memoryIndexSaveHint')}`
              : t('settings.memoryIndexSaveHint')}
          </span>
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              type="button"
              className="ghost"
              onClick={() => setIndexDraft(null)}
              disabled={indexDraft === null}
            >
              {t('settings.memoryIndexReset')}
            </button>
            <button
              type="button"
              className="primary"
              onClick={onSaveIndex}
              disabled={busy || indexDraft === null}
            >
              {t('settings.memoryIndexSave')}
            </button>
          </div>
        </div>
      </details>
    </section>
  );
}
