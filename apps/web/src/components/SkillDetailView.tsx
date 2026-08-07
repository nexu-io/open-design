import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from 'react';
import { Button } from '@open-design/components';
import type { SkillDetail, SkillSummary } from '@open-design/contracts';
import { renderMarkdownToSafeHtml } from '../artifacts/markdown';
import { useI18n } from '../i18n';
import {
  localizeSkillDescription,
  localizeSkillName,
} from '../i18n/content';
import { fetchSkill } from '../providers/registry';
import { Icon } from './Icon';
import { useWorkspaceContext } from '../collab/useWorkspaceContext';

interface Props {
  skill: SkillSummary;
  author?: string;
  onBack: () => void;
  onUse?: () => void;
}

const SKILL_ACCENTS = [
  '#7c3aed',
  '#2563eb',
  '#16a34a',
  '#ea580c',
  '#db2777',
  '#0891b2',
  '#f59e0b',
  '#0f766e',
  '#dc2626',
  '#4f46e5',
] as const;

function skillAccent(seed: string): string {
  let hash = 0;
  for (let index = 0; index < seed.length; index += 1) {
    hash = (hash * 31 + seed.charCodeAt(index)) >>> 0;
  }
  return SKILL_ACCENTS[hash % SKILL_ACCENTS.length] ?? '#7c3aed';
}

function skillInitials(title: string): string {
  const words = title.trim().split(/\s+/).filter(Boolean);
  const first = words[0] ?? '';
  if (!first) return '··';
  const second = words[1];
  if (second) return `${first[0] ?? ''}${second[0] ?? ''}`.toUpperCase();
  return first.slice(0, 2).toUpperCase() || '··';
}

function skillAuthor(skill: SkillSummary, personalAuthor: string): string {
  return String(skill.source) === 'built-in' || String(skill.source) === 'builtin'
    ? 'Open Design'
    : personalAuthor;
}

/**
 * The demo displays SKILL.md's first two heading levels one step below the page
 * title. Change only headings emitted by the safe Markdown renderer: touching
 * Markdown source would also rewrite `# ...` lines inside fenced code blocks.
 */
function headingsBelowPageTitle(html: string): string {
  return html.replace(
    /<(\/?)h([12])(\b[^>]*)>/g,
    (_tag, closing: string, level: string, attributes: string) =>
      `<${closing}h${Number(level) + 1}${attributes}>`,
  );
}

export function SkillDetailView({
  skill: summary,
  author,
  onBack,
  onUse,
}: Props) {
  const { locale, t } = useI18n();
  const { context: workspaceContext } = useWorkspaceContext();
  const titleRef = useRef<HTMLHeadingElement | null>(null);
  const [detail, setDetail] = useState<SkillDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadFailed, setLoadFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setDetail(null);
    setLoading(true);
    setLoadFailed(false);
    void fetchSkill(summary.id, workspaceContext).then((next) => {
      if (cancelled) return;
      setDetail(next);
      setLoadFailed(!next);
      setLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [summary.id, reloadToken, workspaceContext]);

  useEffect(() => {
    titleRef.current?.focus();
  }, []);

  const skill = detail ?? summary;
  const title = localizeSkillName(locale, skill);
  const description = localizeSkillDescription(locale, skill) || skill.description;
  const markdownHtml = useMemo(
    () => detail?.body
      ? headingsBelowPageTitle(renderMarkdownToSafeHtml(detail.body))
      : '',
    [detail?.body],
  );
  const iconStyle = {
    '--plugin-accent': skillAccent(skill.id),
  } as CSSProperties;

  return (
    <section
      className="plugin-marketplace skill-detail"
      data-testid="skill-detail"
      aria-labelledby="skill-detail-title"
    >
      <header className="skill-detail__topbar">
        <Button
          variant="ghost"
          className="plugin-suite-detail__back"
          onClick={onBack}
          data-testid="skill-detail-back"
        >
          <Icon name="arrow-left" size={15} />
          {t('pluginDetail.backToList')}
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="skill-detail__close"
          aria-label={`${t('common.close')}: ${title}`}
          onClick={onBack}
          data-testid="skill-detail-close"
        >
          <Icon name="close" size={18} />
        </Button>
      </header>

      <div className="skill-detail__header">
        <span className="plugin-marketplace__icon" style={iconStyle} aria-hidden>
          {skillInitials(title)}
        </span>
        <div>
          <div className="skill-detail__title-row">
            <h1 id="skill-detail-title" ref={titleRef} tabIndex={-1}>
              {title}
            </h1>
            {onUse ? (
              <Button onClick={onUse} data-testid="skill-detail-use">
                {t('pluginCard.use')}
              </Button>
            ) : null}
          </div>
          <p>
            {t('skillDetail.providedBy', {
              author: author ?? skillAuthor(skill, t('chat.you')),
            })}
          </p>
        </div>
      </div>

      <p className="skill-detail__description">{description}</p>

      <section
        className="skill-detail__markdown"
        aria-label={t('skillDetail.previewAria', { title })}
      >
        <div className="skill-detail__notice">
          <Icon name="info" size={16} />
          {t('skillDetail.markdownNotice')}
        </div>
        {loading ? (
          <p role="status">{t('settings.libraryLoading')}</p>
        ) : null}
        {loadFailed ? (
          <>
            <p role="alert">{t('skillDetail.loadFailed')}</p>
            <Button
              onClick={() => setReloadToken((current) => current + 1)}
              data-testid="skill-detail-retry"
            >
              {t('preview.retry')}
            </Button>
          </>
        ) : null}
        {markdownHtml ? (
          <div
            className="skill-detail__markdown-body"
            // Safe by contract: renderMarkdownToSafeHtml escapes raw HTML and
            // rejects unsafe link protocols before the string reaches React.
            dangerouslySetInnerHTML={{ __html: markdownHtml }}
          />
        ) : null}
      </section>
    </section>
  );
}
