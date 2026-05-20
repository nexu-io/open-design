import { useEffect, useMemo, useState } from 'react';
import { Icon } from './Icon';
import type { SkillSummary } from '../types';

interface Props {
  draft: string;
  skills: SkillSummary[];
  stagedSkillIds: Set<string>;
  onAdd: (skill: SkillSummary) => void;
}

/**
 * Keyword-based skill recommendations rendered above the composer
 * textarea. The composer already has a full @-mention picker; this
 * surface is for the lighter-weight case where a user types a prompt
 * naturally and we want to suggest a skill they might not know exists.
 *
 * Heuristic is intentionally simple: per-skill `triggers` array (which
 * SKILL.md authors already maintain) gets substring-matched against
 * the current draft. The first 3 unmatched-staged skills surface as
 * one-click "+ <skill>" chips. The user can dismiss the strip for
 * this session, or just ignore it.
 */
export function SkillRecommendations({ draft, skills, stagedSkillIds, onAdd }: Props) {
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  // Debounce the draft so we don't recompute on every keystroke. 220ms
  // matches the system's motion-base timing and feels lively without
  // thrashing.
  const [debouncedDraft, setDebouncedDraft] = useState(draft);
  useEffect(() => {
    const t = setTimeout(() => setDebouncedDraft(draft), 220);
    return () => clearTimeout(t);
  }, [draft]);

  const matches = useMemo(() => {
    const hay = debouncedDraft.trim().toLowerCase();
    if (hay.length < 6) return [];
    const out: SkillSummary[] = [];
    for (const s of skills) {
      if (stagedSkillIds.has(s.id)) continue;
      if (dismissed.has(s.id)) continue;
      const triggers = Array.isArray(s.triggers) ? s.triggers : [];
      const hit = triggers.some((t) => {
        const trig = String(t).toLowerCase().trim();
        if (!trig || trig.length < 3) return false;
        return hay.includes(trig);
      });
      if (hit) out.push(s);
      if (out.length >= 3) break;
    }
    return out;
  }, [debouncedDraft, skills, stagedSkillIds, dismissed]);

  if (matches.length === 0) return null;

  return (
    <div className="skill-recs" role="listbox" aria-label="Suggested skills">
      <span className="skill-recs__label">Suggested</span>
      {matches.map((s) => (
        <div key={s.id} className="skill-recs__chip">
          <button
            type="button"
            className="skill-recs__add"
            onClick={() => onAdd(s)}
            title={s.description}
          >
            <Icon name="plus" size={10} />
            <span>{s.id}</span>
          </button>
          <button
            type="button"
            className="skill-recs__dismiss"
            onClick={() => setDismissed((curr) => new Set(curr).add(s.id))}
            aria-label="Dismiss suggestion"
            title="Don't suggest in this session"
          >
            <Icon name="close" size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}
