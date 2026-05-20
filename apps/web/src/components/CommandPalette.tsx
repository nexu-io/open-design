import { useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from './Icon';
import { navigate } from '../router';

interface Item {
  id: string;
  label: string;
  kind: 'skill' | 'brand' | 'view' | 'run';
  hint?: string;
  onPick: () => void;
}

interface SkillRecord {
  id: string;
  name: string;
  description?: string;
}
interface BrandRecord {
  brand: string;
  selectorCount: number;
  vibe?: string;
}

/**
 * Global Cmd-K palette. Opens on ⌘K (Mac) / Ctrl-K (other). Searches
 * across skills, brands, top-level views. Picks navigate to the
 * target. Intentionally simple — no fuzzy ranking lib; substring
 * match + a small recency boost from the picker order.
 */
export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [skills, setSkills] = useState<SkillRecord[]>([]);
  const [brands, setBrands] = useState<BrandRecord[]>([]);
  const [activeIdx, setActiveIdx] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Keyboard binding — global ⌘K / ctrl-K. We deliberately don't
  // hook into a context provider for this; a single document listener
  // is enough and avoids prop-drilling through 15 layers.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const isModK = (e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K');
      if (isModK) {
        e.preventDefault();
        setOpen((v) => !v);
        return;
      }
      if (e.key === 'Escape' && open) {
        setOpen(false);
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  // Lazy-fetch the catalogs only when the palette first opens, and
  // again whenever it re-opens (the catalog is small; staleness here
  // is a worse user experience than a 50ms refetch).
  useEffect(() => {
    if (!open) return;
    setQuery('');
    setActiveIdx(0);
    inputRef.current?.focus();
    void fetch('/api/skills')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        const arr: SkillRecord[] = (d?.skills ?? d ?? []).map((s: SkillRecord) => ({
          id: s.id,
          name: s.name,
          description: s.description,
        }));
        setSkills(arr);
      })
      .catch(() => {});
    void fetch('/api/components')
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        setBrands((d?.brands ?? []) as BrandRecord[]);
      })
      .catch(() => {});
  }, [open]);

  const items = useMemo<Item[]>(() => {
    const q = query.trim().toLowerCase();
    const close = () => setOpen(false);
    const out: Item[] = [];
    const views: Array<{ id: string; label: string; route: () => void }> = [
      { id: 'view:home', label: 'Home', route: () => navigate({ kind: 'home', view: 'home' }) },
      { id: 'view:compare', label: 'Compare', route: () => navigate({ kind: 'home', view: 'compare' }) },
      { id: 'view:components', label: 'Components', route: () => navigate({ kind: 'home', view: 'components' }) },
      { id: 'view:design-systems', label: 'Design Systems', route: () => navigate({ kind: 'home', view: 'design-systems' }) },
      { id: 'view:welcome', label: 'Welcome / tour', route: () => navigate({ kind: 'home', view: 'welcome' }) },
      { id: 'view:projects', label: 'Projects', route: () => navigate({ kind: 'home', view: 'projects' }) },
      { id: 'view:tasks', label: 'Automations', route: () => navigate({ kind: 'home', view: 'tasks' }) },
    ];
    for (const v of views) {
      if (!q || v.label.toLowerCase().includes(q)) {
        out.push({
          id: v.id,
          label: v.label,
          kind: 'view',
          hint: 'view',
          onPick: () => { v.route(); close(); },
        });
      }
    }
    for (const s of skills) {
      const hay = `${s.id} ${s.name} ${s.description ?? ''}`.toLowerCase();
      if (!q || hay.includes(q)) {
        out.push({
          id: `skill:${s.id}`,
          label: s.name,
          kind: 'skill',
          hint: s.id,
          onPick: () => {
            navigate({ kind: 'skill-detail', skillId: s.id });
            close();
          },
        });
      }
    }
    for (const b of brands) {
      const hay = `${b.brand} ${b.vibe ?? ''}`.toLowerCase();
      if (!q || hay.includes(q)) {
        out.push({
          id: `brand:${b.brand}`,
          label: b.brand,
          kind: 'brand',
          hint: `${b.selectorCount} selectors${b.vibe ? ` · ${b.vibe}` : ''}`,
          onPick: () => {
            navigate({ kind: 'home', view: 'components' });
            close();
          },
        });
      }
    }
    return out.slice(0, 50);
  }, [query, skills, brands]);

  useEffect(() => {
    setActiveIdx(0);
  }, [query]);

  if (!open) return null;

  const onKey = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIdx((i) => Math.min(items.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIdx((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      items[activeIdx]?.onPick();
    }
  };

  return (
    <div className="cmd-palette" role="dialog" aria-modal="true" onClick={() => setOpen(false)}>
      <div className="cmd-palette__panel" onClick={(e) => e.stopPropagation()}>
        <div className="cmd-palette__input-row">
          <Icon name="search" size={14} />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={onKey}
            placeholder="Search skills, brands, views…"
            className="cmd-palette__input"
          />
          <kbd>ESC</kbd>
        </div>
        <ul className="cmd-palette__results">
          {items.length === 0 ? (
            <li className="cmd-palette__empty">No matches</li>
          ) : (
            items.map((it, i) => (
              <li
                key={it.id}
                className={`cmd-palette__item${i === activeIdx ? ' is-active' : ''}`}
                onMouseEnter={() => setActiveIdx(i)}
                onClick={it.onPick}
              >
                <span className={`cmd-palette__kind cmd-palette__kind--${it.kind}`}>{it.kind}</span>
                <span className="cmd-palette__label">{it.label}</span>
                {it.hint ? <span className="cmd-palette__hint">{it.hint}</span> : null}
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}
