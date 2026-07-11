import { useMemo, useState } from 'react';
import { useI18n } from '../../../i18n';
import { localizeSkillDescription, localizeSkillName } from '../../../i18n/content';
import { skillMatchesQuery } from '../../../runtime/design-toolbox';
import { Icon } from '../../../components/Icon';
import type { SkillSummary } from '../../../types';

export function ToolsSkillsPanel({
  skills,
  currentSkillId,
  onPick,
}: {
  skills: SkillSummary[];
  currentSkillId: string | null;
  onPick: (skill: SkillSummary) => void | Promise<void>;
}) {
  const { locale } = useI18n();
  const [query, setQuery] = useState('');
  const [pendingId, setPendingId] = useState<string | null>(null);
  const visibleSkills = useMemo(
    () => skills.filter((s) => skillMatchesQuery(s, query)).slice(0, 24),
    [skills, query],
  );
  return (
    <>
      <div className="composer-tools-filter">
        <input
          className="composer-tools-search"
          value={query}
          onChange={(e) => setQuery(e.currentTarget.value)}
          placeholder="Search skills…"
          aria-label="Search skills"
        />
      </div>
      {visibleSkills.length === 0 ? (
        <div className="composer-tools-empty">
          {skills.length === 0 ? 'No skills available yet.' : `No skills found for “${query}”.`}
        </div>
      ) : (
        <div className="composer-tools-list">
          {visibleSkills.map((skill) => {
            const active = skill.id === currentSkillId;
            return (
              <button
                key={skill.id}
                type="button"
                role="menuitem"
                className={`composer-tools-row${active ? ' active' : ''}`}
                onMouseDown={(e) => e.preventDefault()}
                onClick={async () => {
                  setPendingId(skill.id);
                  try {
                    await onPick(skill);
                  } finally {
                    setPendingId(null);
                  }
                }}
                disabled={pendingId !== null}
                title={localizeSkillDescription(locale, skill)}
              >
                <Icon name={active ? 'check' : 'file'} size={12} />
                <span className="composer-tools-row-body">
                  <strong>{localizeSkillName(locale, skill)}</strong>
                  <span className="composer-tools-row-meta">
                    {skill.mode}
                    {skill.surface ? ` · ${skill.surface}` : ''}
                  </span>
                </span>
                {pendingId === skill.id ? (
                  <span className="composer-tools-row-pending">Applying…</span>
                ) : null}
              </button>
            );
          })}
        </div>
      )}
    </>
  );
}
