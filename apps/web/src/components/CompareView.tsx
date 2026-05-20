import { useCallback, useEffect, useRef, useState } from 'react';
import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import {
  RUNS_CHANGED_EVENT,
  listFanoutGroups,
  reattachDaemonRun,
  setRunWinner,
  suggestFanoutWinner,
} from '../providers/daemon';
import type { FanoutGroupSummary, ChatRunStatusResponse } from '@open-design/contracts';
import { useT } from '../i18n';

/**
 * Side-by-side review of multi-CLI fan-out runs. Lists every group from
 * the daemon's /api/runs/fanout-groups bucket, newest first, and renders
 * the sibling outputs in a responsive grid. The user can mark a winner
 * which the daemon stores on the run record so the badge persists
 * across reloads.
 *
 * Lives at /compare in the URL and gets a left-rail nav button. There
 * is no chat composer here — fan-outs are initiated from a normal
 * project chat composer via FanOutButton; this view is the consumer.
 */
export function CompareView() {
  const t = useT();
  const [groups, setGroups] = useState<FanoutGroupSummary[]>([]);
  const [loading, setLoading] = useState(true);
  // Read ?group=<id> from the URL on first mount so chat-thread links
  // like "Open in Compare" can pre-expand a specific fan-out group
  // instead of dumping the user at the top of the list.
  const initialGroupId =
    typeof window !== 'undefined'
      ? new URLSearchParams(window.location.search).get('group')
      : null;
  const [expanded, setExpanded] = useState<string | null>(initialGroupId);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const next = await listFanoutGroups(50);
      setGroups(next);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onChange = () => {
      void refresh();
    };
    window.addEventListener(RUNS_CHANGED_EVENT, onChange);
    // Poll lightly while at least one group is still running — the
    // RUNS_CHANGED event only fires inside the same tab, so it misses
    // streams started in another window or from `od fanout`.
    const hasRunning = groups.some((g) =>
      g.runs.some((r) => r.status === 'running' || r.status === 'queued'),
    );
    let timer: ReturnType<typeof setInterval> | null = null;
    if (hasRunning) {
      timer = setInterval(() => {
        void refresh();
      }, 2500);
    }
    return () => {
      window.removeEventListener(RUNS_CHANGED_EVENT, onChange);
      if (timer) clearInterval(timer);
    };
  }, [groups, refresh]);

  const onPickWinner = useCallback(async (runId: string) => {
    const ok = await setRunWinner(runId);
    if (ok) void refresh();
  }, [refresh]);

  return (
    <div className="compare-view">
      <header className="compare-view__head">
        <h1 className="compare-view__title">{t('compare.title')}</h1>
        <button
          type="button"
          className="compare-view__refresh"
          onClick={() => void refresh()}
          aria-label="Refresh"
        >
          <Icon name="history" size={14} />
          <span>Refresh</span>
        </button>
      </header>

      {loading && groups.length === 0 ? (
        <div className="compare-view__empty">
          <Icon name="spinner" size={18} />
        </div>
      ) : groups.length === 0 ? (
        <div className="compare-view__empty">
          <div>{t('compare.empty')}</div>
          <div className="compare-view__attribution">
            {t('compare.researchLink')}: <code>skills/super-system/RESEARCH.md</code>
            <span className="compare-view__attribution-sep"> · </span>
            14 production videos · 15 cross-cutting rules
          </div>
        </div>
      ) : (
        <ul className="compare-view__groups">
          {groups.map((g) => (
            <CompareGroupCard
              key={g.fanoutGroupId}
              group={g}
              isExpanded={expanded === g.fanoutGroupId}
              onToggle={() =>
                setExpanded((curr) => (curr === g.fanoutGroupId ? null : g.fanoutGroupId))
              }
              onPickWinner={onPickWinner}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

interface CardProps {
  group: FanoutGroupSummary;
  isExpanded: boolean;
  onToggle: () => void;
  onPickWinner: (runId: string) => void;
}

function CompareGroupCard({ group, isExpanded, onToggle, onPickWinner }: CardProps) {
  const t = useT();
  const total = group.runs.length;
  const done = group.runs.filter((r) => r.status === 'succeeded').length;
  const failed = group.runs.filter((r) => r.status === 'failed').length;
  const briefPreview =
    group.brief.length > 96 ? `${group.brief.slice(0, 96)}…` : group.brief || '(no brief)';
  // Synthesizer state lives per-group so multiple groups don't collide.
  // `rationale` persists in-memory only — the daemon doesn't store it
  // yet (the winner flag does persist, which is the load-bearing bit).
  const [suggesting, setSuggesting] = useState(false);
  const [rationale, setRationale] = useState<string | null>(null);

  const runSuggest = useCallback(async () => {
    if (suggesting || done < 2) return;
    setSuggesting(true);
    try {
      const result = await suggestFanoutWinner(group.fanoutGroupId);
      if (result) {
        setRationale(result.rationale);
        // The daemon already flipped the winner flag; the next group
        // refresh will reflect it in the card UI.
        onPickWinner(result.winnerRunId);
      }
    } finally {
      setSuggesting(false);
    }
  }, [done, group.fanoutGroupId, onPickWinner, suggesting]);

  return (
    <li className={`compare-group${isExpanded ? ' is-expanded' : ''}`}>
      <div className="compare-group__head">
        <button
          type="button"
          className="compare-group__toggle"
          onClick={onToggle}
          aria-expanded={isExpanded}
        >
          <span className="compare-group__head-left">
          <span className="compare-group__label">{t('compare.groupHeader')}</span>
          <span className="compare-group__brief" title={group.brief}>
            {briefPreview}
          </span>
          </span>
        </button>
        <div className="compare-group__head-right">
          <span className="compare-group__counts">
            {done}/{total} {failed > 0 ? ` · ${failed} failed` : ''}
          </span>
          <button
            type="button"
            className="compare-group__suggest-btn"
            onClick={runSuggest}
            disabled={suggesting || done < 2}
            title={t('compare.suggestWinnerHint')}
          >
            {suggesting ? (
              <Icon name="spinner" size={12} />
            ) : (
              <Icon name="sparkles" size={12} />
            )}
            <span>{t('compare.suggestWinner')}</span>
          </button>
          <button
            type="button"
            className="compare-group__chevron"
            onClick={onToggle}
            aria-label={isExpanded ? 'Collapse group' : 'Expand group'}
          >
            <Icon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={14} />
          </button>
        </div>
      </div>
      {rationale ? (
        <div className="compare-group__rationale">{rationale}</div>
      ) : null}
      {isExpanded ? (
        <div className="compare-group__grid">
          {group.runs.map((r) => (
            <CompareRunCard
              key={r.id}
              run={r}
              isWinner={group.winnerRunId === r.id}
              onPickWinner={() => onPickWinner(r.id)}
            />
          ))}
        </div>
      ) : null}
    </li>
  );
}

interface RunCardProps {
  run: ChatRunStatusResponse;
  isWinner: boolean;
  onPickWinner: () => void;
}

function CompareRunCard({ run, isWinner, onPickWinner }: RunCardProps) {
  const t = useT();
  const agentId = run.agentId ?? 'unknown';
  // Live-tail the run's event stream so the Compare card is a real
  // side-by-side view, not just a status badge. We use the same
  // reattachDaemonRun() helper the chat thread uses; nothing new on
  // the daemon. Text deltas accumulate; tool events and usage events
  // are intentionally ignored — Compare is for the textual answer.
  const [liveText, setLiveText] = useState('');
  const [previewMode, setPreviewMode] = useState<'rendered' | 'source'>('rendered');
  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const hasPersistedOutput = typeof run.outputText === 'string' && run.outputText.length > 0;
    const shouldStream =
      run.status === 'running' || run.status === 'queued' || (!hasPersistedOutput && !run.error);
    if (!shouldStream) {
      abortRef.current?.abort();
      abortRef.current = null;
      return;
    }
    const controller = new AbortController();
    abortRef.current = controller;
    setLiveText('');
    void reattachDaemonRun({
      runId: run.id,
      signal: controller.signal,
      handlers: {
        onDelta: (delta) => setLiveText((prev) => prev + delta),
        onDone: () => {
          /* terminal status will arrive on the next group refresh */
        },
        onError: () => {
          /* errors render via run.error after refresh */
        },
        onAgentEvent: () => {},
      },
    });
    return () => {
      controller.abort();
    };
  }, [run.error, run.id, run.outputText, run.status]);

  const display = liveText || run.outputText || run.error || '';
  // Detect when the assistant emitted an HTML artifact (the agent's
  // standard output for a UI generation). The detection is intentionally
  // loose: a `<html` or `<!doctype html` anywhere in the text is enough.
  // Many agents wrap HTML in fenced code blocks; we strip those first.
  const detectHtmlArtifact = (raw: string): string | null => {
    if (!raw) return null;
    const trimmed = raw.trim();
    const fenceMatch = trimmed.match(/```(?:html|HTML)?\s*\n([\s\S]*?)\n```/);
    const candidate = (fenceMatch && fenceMatch[1]) ? fenceMatch[1] : trimmed;
    if (/<!doctype\s+html|<html[\s>]/i.test(candidate)) return candidate;
    return null;
  };
  const htmlSrc = detectHtmlArtifact(display);

  return (
    <article className={`compare-run${isWinner ? ' is-winner' : ''}`}>
      <header className="compare-run__head">
        <div className="compare-run__agent">
          <AgentIcon id={agentId} size={16} />
          <span>{agentId}</span>
        </div>
        <div className="compare-run__head-right">
          {htmlSrc ? (
            <div className="compare-run__mode-toggle" role="group">
              <button
                type="button"
                className={previewMode === 'rendered' ? 'is-active' : ''}
                onClick={() => setPreviewMode('rendered')}
              >
                Preview
              </button>
              <button
                type="button"
                className={previewMode === 'source' ? 'is-active' : ''}
                onClick={() => setPreviewMode('source')}
              >
                HTML
              </button>
            </div>
          ) : null}
          <span className={`compare-run__status compare-run__status--${run.status}`}>
            {run.status}
          </span>
        </div>
      </header>
      <div className="compare-run__body">
        {run.error ? (
          <pre className="compare-run__error">{run.error}</pre>
        ) : htmlSrc && previewMode === 'rendered' ? (
          <iframe
            className="compare-run__iframe"
            title={`${agentId} preview`}
            srcDoc={htmlSrc}
            sandbox=""
          />
        ) : display ? (
          <pre className="compare-run__text">{display}</pre>
        ) : (
          <p className="compare-run__hint">
            {run.status === 'running' || run.status === 'queued'
              ? 'Streaming…'
              : 'No textual output captured.'}
          </p>
        )}
      </div>
      <footer className="compare-run__foot">
        {isWinner ? (
          <span className="compare-run__winner-badge">
            <Icon name="star" size={12} /> {t('compare.winnerBadge')}
          </span>
        ) : (
          <button
            type="button"
            className="compare-run__winner-btn"
            onClick={onPickWinner}
            disabled={run.status !== 'succeeded'}
          >
            <Icon name="star" size={12} />
            <span>{t('compare.markWinner')}</span>
          </button>
        )}
        {display && run.status === 'succeeded' ? (
          <button
            type="button"
            className="compare-run__use-btn"
            onClick={() => {
              void navigator.clipboard?.writeText(display).catch(() => {});
            }}
            title="Copy this output as a starter prompt"
          >
            <Icon name="copy" size={12} />
            <span>Copy output</span>
          </button>
        ) : null}
        {htmlSrc && run.status === 'succeeded' ? (
          <div className="compare-run__convert">
            {(['React', 'Vue', 'Svelte'] as const).map((fw) => (
              <button
                key={fw}
                type="button"
                className="compare-run__convert-chip"
                onClick={() => {
                  const followUp =
                    `Convert this HTML to a ${fw} component using Tailwind. ` +
                    `Preserve the visual design exactly; only rewrite the markup.\n\n` +
                    '```html\n' + htmlSrc + '\n```';
                  void navigator.clipboard?.writeText(followUp).catch(() => {});
                }}
                title={`Copy a follow-up prompt that converts to ${fw}`}
              >
                → {fw}
              </button>
            ))}
          </div>
        ) : null}
      </footer>
    </article>
  );
}
