import { useEffect, useMemo, useRef, useState } from 'react';
import { AgentIcon } from './AgentIcon';
import { Icon } from './Icon';
import { useT } from '../i18n';
import type { AgentInfo } from '../types';

// Per-agent role hints, borrowed from LobeHub's Agent Groups pattern.
// Each role gets appended to that agent's per-run prompt as a soft
// instruction so the CLIs aim at different dimensions instead of
// producing five-of-the-same. Roles match the strengths documented in
// the 14-video research (claude=taste, codex=logic, cursor=iterate,
// gemini=long-context extract) — plus a local-only ollama lane for
// zero-cost iteration on the LAN.
const AGENT_ROLES: Record<string, { label: string; promptSuffix: string }> = {
  claude: {
    label: 'design taste',
    promptSuffix: 'Optimize for visual taste, microcopy, motion choreography. Make it feel premium.',
  },
  codex: {
    label: 'logic + tests',
    promptSuffix: 'Optimize for clean architecture, schema correctness, and at least one test covering the main path.',
  },
  'cursor-agent': {
    label: 'fast iterate',
    promptSuffix: 'Optimize for tight scope, minimal diff, and quick build verification.',
  },
  gemini: {
    label: 'long-context extract',
    promptSuffix: 'Optimize for faithful structural reproduction; lean on context to mirror the reference exactly.',
  },
  // Local Ollama — runs entirely on the LAN against the user's mini.
  // Free, slower, useful as a sanity-check 5th opinion or for tasks
  // where API spend doesn't make sense. The daemon's runtime def for
  // ollama already handles transport; if the user has an installed
  // local model the agents endpoint surfaces it automatically.
  ollama: {
    label: 'local · free',
    promptSuffix: 'Optimize for direct, no-frills output. Skip preamble. Lean on common sense — you have less context.',
  },
};

export function getFanoutRoleSuffix(agentId: string): string {
  return AGENT_ROLES[agentId]?.promptSuffix ?? '';
}

interface Props {
  agents: AgentInfo[];
  // The user's globally-selected agent — pre-checked so the common
  // "I want my normal agent plus one more" flow is one click.
  defaultAgentId?: string | null;
  disabled?: boolean;
  // Returns the ids selected this turn and optional extra skill ids
  // (e.g. the super-system playbook toggle). Empty agent array means
  // "use the single default agent, don't fan out."
  onSend: (agentIds: string[], extraSkillIds?: string[], options?: { delayMs?: number }) => void;
}

/**
 * Composer-local Fan Out picker. Single split-button next to the
 * regular send button. Clicking it opens a popover with checkboxes for
 * every available local CLI agent. Picking 2+ and confirming dispatches
 * one parallel run per agent — the Compare tab groups them by the
 * shared fanoutGroupId.
 *
 * Intentionally NOT wired into AppConfig — fan-out is per-message, not
 * a persistent mode. The user's normal agent picker (AvatarMenu) stays
 * unchanged.
 */
export function FanOutButton({ agents, defaultAgentId, disabled, onSend }: Props) {
  const t = useT();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  const available = useMemo(() => agents.filter((a) => a.available), [agents]);

  // Selection state — seeded with the user's normal agent so they only
  // have to toggle the extras. Resets to "just the default" each time
  // the popover closes; no persistence between turns.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(defaultAgentId ? [defaultAgentId] : []),
  );
  // Super-system playbook toggle — on by default. When on, the
  // PATTERNS.md + RESEARCH.md skill body lands in every sibling
  // agent's system prompt. Off lets the user compare raw CLI taste
  // without the 14-video bias.
  const [usePlaybook, setUsePlaybook] = useState(true);
  const [delayMs, setDelayMs] = useState(0);

  useEffect(() => {
    if (!open) return;
    const onClick = (e: MouseEvent) => {
      if (!wrapRef.current) return;
      if (!wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onClick);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onClick);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSelected(new Set(defaultAgentId ? [defaultAgentId] : []));
    }
  }, [open, defaultAgentId]);

  const toggle = (id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const selectAll = () => {
    setSelected(new Set(available.map((a) => a.id)));
  };

  const confirm = () => {
    const ids = Array.from(selected);
    if (ids.length === 0) {
      setOpen(false);
      return;
    }
    onSend(ids, usePlaybook ? ['super-system'] : [], delayMs > 0 ? { delayMs } : undefined);
    setOpen(false);
  };

  // Empty-state hint when only one CLI is installed. Without this the
  // user clicks Fan Out and gets nothing, with no signal why. The hint
  // is intentionally tiny and unobtrusive — most users with one CLI
  // never need to think about fan-out, but the breadcrumb matters when
  // they're investigating.
  if (available.length < 2) {
    return (
      <span
        className="fanout-empty-hint"
        title={t('fanout.installAnotherHint')}
      >
        <Icon name="grid" size={12} />
        <span>{t('fanout.installAnother')}</span>
      </span>
    );
  }

  const count = selected.size;
  return (
    <div className="fanout-wrap" ref={wrapRef}>
      <button
        type="button"
        className={`composer-iconbtn fanout-trigger${open ? ' is-open' : ''}`}
        onClick={() => setOpen((v) => !v)}
        disabled={disabled}
        aria-haspopup="menu"
        aria-expanded={open}
        title={t('fanout.title')}
        aria-label={t('fanout.title')}
        data-testid="fanout-button"
      >
        <Icon name="grid" size={14} />
      </button>
      {open ? (
        <div className="fanout-popover" role="menu">
          <div className="fanout-popover-head">
            <span className="fanout-popover-title">{t('fanout.popoverTitle')}</span>
            <button
              type="button"
              className="fanout-link-btn"
              onClick={selectAll}
              disabled={selected.size === available.length}
            >
              {t('fanout.selectAll')}
            </button>
          </div>
          <div className="fanout-popover-list">
            {available.map((a) => {
              const checked = selected.has(a.id);
              const role = AGENT_ROLES[a.id];
              return (
                <label key={a.id} className={`fanout-row${checked ? ' is-checked' : ''}`}>
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(a.id)}
                  />
                  <AgentIcon id={a.id} size={16} />
                  <span className="fanout-row-name">{a.name}</span>
                  {role ? (
                    <span className="fanout-row-role">{role.label}</span>
                  ) : null}
                  {a.version ? (
                    <span className="fanout-row-meta">{a.version}</span>
                  ) : null}
                </label>
              );
            })}
          </div>
          <label
            className={`fanout-popover-toggle${usePlaybook ? ' is-on' : ''}`}
            title={t('fanout.usePlaybookHint')}
          >
            <input
              type="checkbox"
              checked={usePlaybook}
              onChange={(e) => setUsePlaybook(e.target.checked)}
            />
            <span>{t('fanout.usePlaybook')}</span>
          </label>
          <label className="fanout-schedule">
            <span>Start</span>
            <select
              value={String(delayMs)}
              onChange={(e) => setDelayMs(Number(e.target.value))}
              aria-label="Fan-out start time"
            >
              <option value="0">Now</option>
              <option value="300000">In 5 min</option>
              <option value="1800000">In 30 min</option>
              <option value="3600000">In 1 hour</option>
            </select>
          </label>
          <button
            type="button"
            className="fanout-confirm-btn"
            onClick={confirm}
            disabled={count < 2}
            data-testid="fanout-confirm"
          >
            <Icon name="send" size={13} />
            <span>
              {count >= 2
                ? t('fanout.confirmN').replace('{n}', String(count))
                : t('fanout.confirmHint')}
            </span>
          </button>
        </div>
      ) : null}
    </div>
  );
}
