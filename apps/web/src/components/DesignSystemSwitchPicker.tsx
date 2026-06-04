import { useEffect, useMemo, useState } from 'react';
import { fetchDesignSystemsResult } from '../providers/registry';
import type { DesignSystemSummary } from '../types';
import type { Dict } from '../i18n/types';
import { Icon } from './Icon';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

interface Props {
  t: TranslateFn;
  currentDesignSystemId?: string | null;
  // Receives the picked design-system id (or `null` for the "freeform / no
  // DS" entry) plus its title (or `null` for the freeform entry, which the
  // composer translates into the localized "None" label). The picker
  // awaits the callback so it can render a per-row pending state while
  // the PATCH is in flight, and reads its `true`/`false` return so a
  // failed switch keeps the picker open for retry.
  onSelect: (
    designSystemId: string | null,
    title: string | null,
  ) => Promise<boolean>;
  onBack: () => void;
}

export function DesignSystemSwitchPicker({
  t,
  currentDesignSystemId,
  onSelect,
  onBack,
}: Props) {
  const [items, setItems] = useState<DesignSystemSummary[] | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null | 'none'>(null);

  useEffect(() => {
    let cancelled = false;
    void fetchDesignSystemsResult().then((result) => {
      if (cancelled) return;
      if (result.ok) {
        setItems(result.designSystems);
      } else {
        // Surface the failure explicitly instead of collapsing it into an
        // empty catalog — `fetchDesignSystems()` returns `[]` on both "no
        // systems registered" and "network/HTTP failed", and rendering
        // those identically hides broken integrations.
        setItems([]);
        setLoadError(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const groups = useMemo(() => {
    if (!items) return [];
    const needle = query.trim().toLowerCase();
    const matches = needle
      ? items.filter(
          (it) =>
            it.title.toLowerCase().includes(needle) ||
            (it.summary?.toLowerCase().includes(needle) ?? false) ||
            it.category.toLowerCase().includes(needle),
        )
      : items;
    const byCategory = new Map<string, DesignSystemSummary[]>();
    for (const it of matches) {
      const arr = byCategory.get(it.category) ?? [];
      arr.push(it);
      byCategory.set(it.category, arr);
    }
    return Array.from(byCategory.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [items, query]);

  // The freeform "None" row is an action — clearing the project's DS —
  // not a catalog entry, so it does not live inside `groups`. It stays
  // visible whenever the typed query matches its own label/summary, and
  // is *always* shown when the catalog failed to load: a broken
  // `/api/design-systems` must never strand the user without a reachable
  // fallback, even after they have typed into the search box.
  const noneRowMatchesQuery = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return true;
    return (
      t('chat.importDesignSystemNone').toLowerCase().includes(needle) ||
      t('chat.importDesignSystemNoneSub').toLowerCase().includes(needle)
    );
  }, [query, t]);
  const showNoneRow = loadError || noneRowMatchesQuery;
  const noneActive = currentDesignSystemId === null || currentDesignSystemId === undefined;

  async function handlePick(id: string | null, title: string | null) {
    const marker = id === null ? 'none' : id;
    if (pendingId) return;
    if (id === null && noneActive) return;
    if (id !== null && id === currentDesignSystemId) return;
    setPendingId(marker);
    try {
      await onSelect(id, title);
    } finally {
      setPendingId(null);
    }
  }

  return (
    <div className="composer-ds-picker" data-testid="composer-ds-picker">
      <div className="composer-ds-picker-head">
        <button
          type="button"
          className="composer-ds-picker-back"
          onClick={onBack}
          aria-label={t('chat.importDesignSystemBack')}
        >
          <Icon name="arrow-up" size={12} style={{ transform: 'rotate(-90deg)' }} />
          <span>{t('chat.importDesignSystemBack')}</span>
        </button>
        <div className="composer-ds-picker-title">{t('chat.importDesignSystemHeader')}</div>
      </div>
      <input
        type="search"
        className="composer-ds-picker-search"
        placeholder={t('chat.importDesignSystemSearch')}
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        autoFocus
        data-testid="composer-ds-picker-search"
      />
      <div className="composer-ds-picker-list" role="listbox">
        {showNoneRow ? (
          <button
            type="button"
            role="option"
            aria-selected={noneActive}
            className={`composer-ds-picker-item composer-ds-picker-item-none${noneActive ? ' current' : ''}`}
            disabled={pendingId === 'none'}
            onClick={() => void handlePick(null, null)}
            data-testid="composer-ds-picker-item-none"
          >
            <div className="composer-ds-picker-item-text">
              <span className="composer-ds-picker-item-title">
                {t('chat.importDesignSystemNone')}
              </span>
              <span className="composer-ds-picker-item-summary">
                {t('chat.importDesignSystemNoneSub')}
              </span>
            </div>
            {noneActive ? (
              <span className="composer-ds-picker-current-tag">
                {t('chat.importDesignSystemActive')}
              </span>
            ) : null}
          </button>
        ) : null}
        {items === null ? (
          <div className="composer-ds-picker-empty">{t('common.loading')}</div>
        ) : loadError ? (
          <div
            className="composer-ds-picker-empty composer-ds-picker-error"
            role="alert"
            data-testid="composer-ds-picker-load-error"
          >
            {t('chat.importDesignSystemLoadFailed')}
          </div>
        ) : groups.length === 0 && !showNoneRow ? (
          <div className="composer-ds-picker-empty">
            {t('chat.importDesignSystemEmpty', { query })}
          </div>
        ) : (
          groups.map(([category, entries]) => (
            <div key={category} className="composer-ds-picker-group">
              <div className="composer-ds-picker-group-title">{category}</div>
              {entries.map((it) => {
                const isCurrent = it.id === currentDesignSystemId;
                const isPending = pendingId === it.id;
                return (
                  <button
                    type="button"
                    role="option"
                    aria-selected={isCurrent}
                    key={it.id}
                    className={`composer-ds-picker-item${isCurrent ? ' current' : ''}`}
                    disabled={isPending || isCurrent}
                    onClick={() => void handlePick(it.id, it.title)}
                    data-testid={`composer-ds-picker-item-${it.id}`}
                  >
                    <div className="composer-ds-picker-item-text">
                      <span className="composer-ds-picker-item-title">{it.title}</span>
                      {it.summary ? (
                        <span className="composer-ds-picker-item-summary">{it.summary}</span>
                      ) : null}
                    </div>
                    {it.swatches && it.swatches.length > 0 ? (
                      <div className="composer-ds-picker-item-swatches" aria-hidden>
                        {it.swatches.slice(0, 4).map((c, i) => (
                          <span
                            key={`${it.id}-sw-${i}`}
                            className="composer-ds-picker-swatch"
                            style={{ background: c }}
                          />
                        ))}
                      </div>
                    ) : null}
                    {isCurrent ? (
                      <span className="composer-ds-picker-current-tag">
                        {t('chat.importDesignSystemActive')}
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
