import { useEffect, useState } from 'react';
import { fetchDesignSystems } from '../providers/registry';
import { Icon } from './Icon';
import { useT } from '../i18n';
import type { DesignSystemSummary } from '@open-design/contracts';

interface Props {
  // Current project's pinned design system id (or null when none). The
  // matching chip renders with an "active" badge so the user always
  // knows which system the agent will inherit on the next turn.
  activeId: string | null;
  // Called when the user picks a chip — ProjectView writes through to
  // /api/projects/:id and refetches. Passing null clears the binding.
  onPick: (id: string | null) => void;
}

/**
 * One-click design-system attach strip rendered above the chat composer.
 *
 * Pulls /api/design-systems once, surfaces up to 8 recently-updated
 * built-in systems as chips, and renders an extra "None" chip to clear
 * the binding. The full picker still lives in the project header — this
 * is the fast-path for "the agent should already know we're building
 * for Monarch Money."
 */
export function DesignSystemQuickChips({ activeId, onPick }: Props) {
  const t = useT();
  const [systems, setSystems] = useState<DesignSystemSummary[]>([]);
  const [collapsed, setCollapsed] = useState(true);

  useEffect(() => {
    let cancelled = false;
    void fetchDesignSystems().then((list) => {
      if (cancelled) return;
      const sorted = [...list].sort((a, b) => {
        const ua = a.updatedAt ? Date.parse(a.updatedAt) : 0;
        const ub = b.updatedAt ? Date.parse(b.updatedAt) : 0;
        return ub - ua;
      });
      setSystems(sorted);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  // Expand automatically when nothing is picked yet — first-run hint.
  // The user can collapse it after they've seen what's available.
  useEffect(() => {
    if (!activeId) setCollapsed(false);
  }, [activeId]);

  const active = activeId ? systems.find((s) => s.id === activeId) ?? null : null;
  // Show top 8 — keeps the chip strip a single row at typical widths.
  const top = systems.slice(0, 8);

  return (
    <div className={`ds-chips${collapsed ? ' is-collapsed' : ''}`}>
      <button
        type="button"
        className="ds-chips__toggle"
        onClick={() => setCollapsed((v) => !v)}
        aria-expanded={!collapsed}
      >
        <Icon name="palette" size={12} />
        <span>{t('designSystemChips.label')}</span>
        {active ? (
          <span className="ds-chips__active-name">· {active.title}</span>
        ) : (
          <span className="ds-chips__active-name ds-chips__active-name--muted">
            · {t('designSystemChips.none')}
          </span>
        )}
        <Icon name={collapsed ? 'chevron-right' : 'chevron-down'} size={11} />
      </button>
      {!collapsed ? (
        <div className="ds-chips__list">
          <button
            type="button"
            className={`ds-chip ds-chip--none${activeId ? '' : ' is-active'}`}
            onClick={() => onPick(null)}
          >
            <span>{t('designSystemChips.none')}</span>
          </button>
          {top.map((s) => (
            <button
              key={s.id}
              type="button"
              className={`ds-chip${activeId === s.id ? ' is-active' : ''}`}
              onClick={() => onPick(s.id)}
              title={s.summary}
            >
              {s.swatches && s.swatches.length > 0 ? (
                <span
                  className="ds-chip__swatch"
                  style={{ background: s.swatches[0] }}
                  aria-hidden
                />
              ) : null}
              <span>{s.title}</span>
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}
