import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Button, Input, Textarea } from '@open-design/components';
import type { InstalledPluginRecord, SkillSummary } from '@open-design/contracts';
import { useI18n, type Locale } from '../i18n';
import {
  localizeSkillDescription,
  localizeSkillName,
  localizeSkillPrompt,
} from '../i18n/content';
import { listPlugins } from '../state/projects';
import {
  formatVisualInspirationContext,
  rankVisualInspirations,
  visualInspirationSearchSeed,
  type RankedVisualInspirationCandidate,
  type VisualInspirationCandidate,
  type VisualInspirationSourceFilter,
  type VisualInspirationSurface,
  type VisualInspirationSurfaceFilter,
} from '../runtime/visual-inspiration';
import { Icon } from './Icon';
import { inferPluginPreview, type PluginPreviewSpec } from './plugins-home/preview';
import {
  localizePluginDescription,
  localizePluginTitle,
} from './plugins-home/localization';
import styles from './VisualInspirationPanel.module.css';

const MAX_RENDERED_CANDIDATES = 24;
const SKIP_COUNTDOWN_SECONDS = 120;

interface Props {
  projectId?: string;
  briefText: string;
  designTemplates: SkillSummary[];
  currentSkillId?: string | null;
  submitDisabled?: boolean;
  onSubmit: (text: string) => void;
}

type CandidatePreview =
  | { kind: 'html'; url: string }
  | { kind: 'image'; url: string }
  | { kind: 'video'; url: string; poster?: string | null }
  | { kind: 'audio'; url: string; poster?: string | null }
  | { kind: 'none' };

interface CandidateViewModel extends RankedVisualInspirationCandidate {
  preview: CandidatePreview;
}

export function VisualInspirationPanel({
  projectId,
  briefText,
  designTemplates,
  currentSkillId = null,
  submitDisabled = false,
  onSubmit,
}: Props) {
  const { locale, t } = useI18n();
  const [plugins, setPlugins] = useState<InstalledPluginRecord[]>([]);
  const [loadingPlugins, setLoadingPlugins] = useState(true);
  const [pluginError, setPluginError] = useState(false);
  const [search, setSearch] = useState(() => visualInspirationSearchSeed(briefText));
  const [sourceFilter, setSourceFilter] = useState<VisualInspirationSourceFilter>('all');
  const [surfaceFilter, setSurfaceFilter] = useState<VisualInspirationSurfaceFilter>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notes, setNotes] = useState('');
  const [previewCandidate, setPreviewCandidate] = useState<CandidateViewModel | null>(null);
  const autoFiredRef = useRef(false);
  const [remaining, setRemaining] = useState(SKIP_COUNTDOWN_SECONDS);

  useEffect(() => {
    let cancelled = false;
    setLoadingPlugins(true);
    setPluginError(false);
    void listPlugins({ throwOnError: true })
      .then((rows) => {
        if (cancelled) return;
        setPlugins(rows);
      })
      .catch(() => {
        if (cancelled) return;
        setPluginError(true);
      })
      .finally(() => {
        if (!cancelled) setLoadingPlugins(false);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  useEffect(() => {
    setSearch(visualInspirationSearchSeed(briefText));
    setSelectedId(null);
    setNotes('');
    autoFiredRef.current = false;
    setRemaining(SKIP_COUNTDOWN_SECONDS);
  }, [briefText]);

  const candidates = useMemo(
    () => [
      ...designTemplates
        .filter((template) => !template.aggregatesExamples)
        .map((template) => templateCandidate(locale, template)),
      ...plugins.map((plugin) => pluginCandidate(locale, plugin)),
    ],
    [designTemplates, locale, plugins],
  );

  const ranked = useMemo(
    () =>
      rankVisualInspirations(candidates, search || briefText, {
        currentSkillId,
        sourceFilter,
        surfaceFilter,
        limit: MAX_RENDERED_CANDIDATES,
      }).map(withPreview),
    [briefText, candidates, currentSkillId, search, sourceFilter, surfaceFilter],
  );

  const selected = useMemo(
    () => ranked.find((candidate) => candidate.id === selectedId) ?? null,
    [ranked, selectedId],
  );

  const canSubmit = !submitDisabled && selected !== null;
  const canSkip = !submitDisabled;

  const submitSelection = useCallback((candidate: VisualInspirationCandidate | null) => {
    if (submitDisabled) return;
    onSubmit(
      formatVisualInspirationContext(candidate, {
        selectedHeader: t('visualInspiration.contextSelectedHeader'),
        skippedHeader: t('visualInspiration.contextSkippedHeader'),
        selectedLabel: t('visualInspiration.contextSelectedLabel'),
        sourceLabel: t('visualInspiration.contextSourceLabel'),
        tagsLabel: t('visualInspiration.contextTagsLabel'),
        promptLabel: t('visualInspiration.contextPromptLabel'),
        previewLabel: t('visualInspiration.contextPreviewLabel'),
        notesLabel: t('visualInspiration.contextNotesLabel'),
        instruction: t('visualInspiration.contextInstruction'),
        skippedBody: t('visualInspiration.contextSkippedBody'),
        templateSource: t('visualInspiration.sourceTemplates'),
        communitySource: t('visualInspiration.sourceCommunity'),
      }, notes),
    );
  }, [notes, onSubmit, submitDisabled, t]);

  useEffect(() => {
    if (!canSkip) {
      setRemaining(SKIP_COUNTDOWN_SECONDS);
      autoFiredRef.current = false;
      return;
    }
    const id = window.setInterval(() => {
      setRemaining((value) => Math.max(0, value - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [canSkip]);

  useEffect(() => {
    if (canSkip && remaining <= 0 && !autoFiredRef.current) {
      autoFiredRef.current = true;
      submitSelection(null);
    }
  }, [canSkip, remaining, submitSelection]);

  const countdown = `${Math.floor(remaining / 60)}:${String(remaining % 60).padStart(2, '0')}`;

  return (
    <div className={styles.panel} data-testid="visual-inspiration-panel">
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden>
          <Icon name="image" size={18} />
        </span>
        <div>
          <h2 className={styles.title}>{t('visualInspiration.title')}</h2>
          <p className={styles.description}>{t('visualInspiration.description')}</p>
        </div>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.search}>
          <span aria-hidden>
            <Icon name="search" size={14} />
          </span>
          <Input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder={t('visualInspiration.searchPlaceholder')}
            aria-label={t('visualInspiration.searchAria')}
          />
        </label>
        <SegmentedControl
          label={t('visualInspiration.sourceFilterAria')}
          value={sourceFilter}
          options={[
            ['all', t('visualInspiration.sourceAll')],
            ['template', t('visualInspiration.sourceTemplates')],
            ['community', t('visualInspiration.sourceCommunity')],
          ]}
          onChange={(value) => setSourceFilter(value as VisualInspirationSourceFilter)}
        />
        <SegmentedControl
          label={t('visualInspiration.surfaceFilterAria')}
          value={surfaceFilter}
          options={[
            ['all', t('visualInspiration.surfaceAll')],
            ['web', t('visualInspiration.surfaceWeb')],
            ['mobile', t('visualInspiration.surfaceMobile')],
          ]}
          onChange={(value) => setSurfaceFilter(value as VisualInspirationSurfaceFilter)}
        />
      </div>

      {pluginError ? (
        <div className={styles.notice}>{t('visualInspiration.pluginLoadError')}</div>
      ) : null}

      {ranked.length === 0 ? (
        <div className={styles.empty}>{t('visualInspiration.empty')}</div>
      ) : (
        <div className={styles.grid} role="list">
          {ranked.map((candidate) => (
            <article
              key={candidate.id}
              role="listitem"
              className={`${styles.card} ${selectedId === candidate.id ? styles.cardSelected : ''}`}
            >
              <button
                type="button"
                className={styles.cardSelectArea}
                aria-pressed={selectedId === candidate.id}
                onClick={() => setSelectedId(candidate.id)}
                data-testid={`visual-inspiration-card-${candidate.id}`}
              >
                <PreviewFrame candidate={candidate} />
                <span className={styles.cardBody}>
                  <span className={styles.cardTopline}>
                    <span className={styles.sourceBadge}>
                      {candidate.source === 'template'
                        ? t('visualInspiration.sourceTemplates')
                        : t('visualInspiration.sourceCommunity')}
                    </span>
                    {candidate.matchedTerms.length > 0 ? (
                      <span className={styles.matchText}>
                        {t('visualInspiration.matchedTerms', {
                          terms: candidate.matchedTerms.slice(0, 3).join(', '),
                        })}
                      </span>
                    ) : null}
                  </span>
                  <span className={styles.cardTitle}>{candidate.title}</span>
                  <span className={styles.cardDescription}>{candidate.description}</span>
                </span>
              </button>
              <span className={styles.cardActions}>
                <span className={styles.selectedState}>
                  {selectedId === candidate.id
                    ? t('visualInspiration.selected')
                    : t('visualInspiration.select')}
                </span>
                <button
                  type="button"
                  className={styles.previewButton}
                  onClick={() => setPreviewCandidate(candidate)}
                >
                  <Icon name="eye" size={13} />
                  {t('visualInspiration.preview')}
                </button>
              </span>
            </article>
          ))}
        </div>
      )}

      <div className={styles.notesRow}>
        <Textarea
          value={notes}
          onChange={(event) => setNotes(event.target.value)}
          placeholder={t('visualInspiration.notesPlaceholder')}
          rows={2}
        />
      </div>

      <div className={styles.footer}>
        <span className={styles.status}>
          {loadingPlugins
            ? t('visualInspiration.loading')
            : selected
              ? t('visualInspiration.selectedStatus', { title: selected.title })
              : t('visualInspiration.selectionHint')}
        </span>
        <Button
          variant="ghost"
          disabled={!canSkip}
          onClick={() => submitSelection(null)}
        >
          {t('visualInspiration.skip')}
          {canSkip ? <span className={styles.timer}>{countdown}</span> : null}
        </Button>
        <Button
          variant="primary"
          disabled={!canSubmit}
          onClick={() => submitSelection(selected)}
        >
          {t('visualInspiration.submit')}
        </Button>
      </div>

      {previewCandidate ? (
        <PreviewDialog
          candidate={previewCandidate}
          onClose={() => setPreviewCandidate(null)}
        />
      ) : null}
    </div>
  );
}

function SegmentedControl({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string;
  options: Array<[string, string]>;
  onChange: (value: string) => void;
}) {
  return (
    <div className={styles.segmented} role="group" aria-label={label}>
      {options.map(([optionValue, labelText]) => (
        <button
          key={optionValue}
          type="button"
          className={value === optionValue ? styles.segmentedActive : ''}
          aria-pressed={value === optionValue}
          onClick={() => onChange(optionValue)}
        >
          {labelText}
        </button>
      ))}
    </div>
  );
}

function PreviewFrame({ candidate }: { candidate: CandidateViewModel }) {
  if (candidate.preview.kind === 'html') {
    return (
      <span className={styles.previewFrame}>
        <iframe
          title={candidate.title}
          src={candidate.preview.url}
          sandbox="allow-scripts"
          tabIndex={-1}
        />
      </span>
    );
  }
  if (candidate.preview.kind === 'image') {
    return (
      <span className={styles.previewFrame}>
        <img src={candidate.preview.url} alt="" loading="lazy" />
      </span>
    );
  }
  if (candidate.preview.kind === 'video') {
    return (
      <span className={styles.previewFrame}>
        <video
          src={candidate.preview.url}
          poster={candidate.preview.poster ?? undefined}
          muted
          playsInline
          preload="metadata"
        />
      </span>
    );
  }
  return (
    <span className={`${styles.previewFrame} ${styles.previewFallback}`}>
      <Icon name="image" size={22} />
    </span>
  );
}

function PreviewDialog({
  candidate,
  onClose,
}: {
  candidate: CandidateViewModel;
  onClose: () => void;
}) {
  const { t } = useI18n();
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className={styles.modalBackdrop} role="presentation" onMouseDown={onClose}>
      <div
        className={styles.modal}
        role="dialog"
        aria-modal="true"
        aria-label={candidate.title}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className={styles.modalHead}>
          <div>
            <h3>{candidate.title}</h3>
            <p>{candidate.description}</p>
          </div>
          <Button
            size="icon"
            variant="ghost"
            aria-label={t('visualInspiration.closePreview')}
            title={t('visualInspiration.closePreview')}
            onClick={onClose}
          >
            <Icon name="close" size={16} />
          </Button>
        </div>
        <div className={styles.modalBody}>
          {candidate.preview.kind === 'html' ? (
            <iframe
              title={candidate.title}
              src={candidate.preview.url}
              sandbox="allow-scripts"
            />
          ) : candidate.preview.kind === 'image' ? (
            <img src={candidate.preview.url} alt="" />
          ) : candidate.preview.kind === 'video' ? (
            <video
              src={candidate.preview.url}
              poster={candidate.preview.poster ?? undefined}
              controls
              playsInline
            />
          ) : candidate.preview.kind === 'audio' ? (
            <div className={styles.audioPreview}>
              {candidate.preview.poster ? <img src={candidate.preview.poster} alt="" /> : null}
              <audio src={candidate.preview.url} controls />
            </div>
          ) : (
            <div className={styles.modalFallback}>{t('visualInspiration.noPreview')}</div>
          )}
        </div>
      </div>
    </div>
  );
}

function templateCandidate(locale: Locale, template: SkillSummary): VisualInspirationCandidate {
  const title = localizeSkillName(locale, template);
  const description = localizeSkillDescription(locale, template);
  const prompt = localizeSkillPrompt(locale, template) ?? template.examplePrompt;
  const surface = surfaceFromTemplate(template);
  return {
    id: template.id,
    source: 'template',
    title,
    description,
    ...(prompt ? { prompt } : {}),
    tags: compactTags([
      template.mode,
      template.surface,
      template.platform,
      template.scenario,
      template.category,
      ...(template.triggers ?? []),
    ]),
    surface,
    mode: template.mode,
    platform: template.platform,
    scenario: template.scenario,
    featured: template.featured,
    previewUrl: template.previewType === 'html'
      ? `/api/skills/${encodeURIComponent(template.id)}/example`
      : null,
    previewKind: template.previewType,
  };
}

function pluginCandidate(locale: string, record: InstalledPluginRecord): VisualInspirationCandidate {
  const preview = inferPluginPreview(record);
  const od = record.manifest?.od as
    | { mode?: unknown; taskKind?: unknown; featured?: unknown; useCase?: { query?: unknown } }
    | undefined;
  const title = localizePluginTitle(locale, record);
  const description = localizePluginDescription(locale, record);
  const prompt = typeof od?.useCase?.query === 'string' ? od.useCase.query : undefined;
  const mode = typeof od?.mode === 'string' ? od.mode : null;
  const taskKind = typeof od?.taskKind === 'string' ? od.taskKind : null;
  const previewUrl = previewUrlFromPluginPreview(preview);
  return {
    id: record.id,
    source: 'community',
    title,
    description,
    ...(prompt ? { prompt } : {}),
    tags: compactTags([
      mode,
      taskKind,
      preview.kind,
      ...(record.manifest?.tags ?? []),
    ]),
    surface: surfaceFromPluginPreview(preview, mode),
    mode,
    platform: null,
    scenario: taskKind,
    featured: featuredRank(od?.featured),
    previewUrl,
    previewKind: preview.kind === 'media' ? `media:${preview.mediaType}` : preview.kind,
  };
}

function featuredRank(value: unknown): number | null {
  if (value === true) return 0;
  return typeof value === 'number' && Number.isFinite(value) ? Math.max(0, value) : null;
}

function withPreview(candidate: RankedVisualInspirationCandidate): CandidateViewModel {
  if (candidate.previewUrl) {
    if (candidate.previewKind === 'media:image') {
      return { ...candidate, preview: { kind: 'image', url: candidate.previewUrl } };
    }
    if (candidate.previewKind === 'media:video') {
      return { ...candidate, preview: { kind: 'video', url: candidate.previewUrl } };
    }
    if (candidate.previewKind === 'media:audio') {
      return { ...candidate, preview: { kind: 'audio', url: candidate.previewUrl } };
    }
    if (candidate.previewKind === 'image') {
      return { ...candidate, preview: { kind: 'image', url: candidate.previewUrl } };
    }
    return { ...candidate, preview: { kind: 'html', url: candidate.previewUrl } };
  }
  return { ...candidate, preview: { kind: 'none' } };
}

function surfaceFromTemplate(template: SkillSummary): VisualInspirationSurface {
  if (template.platform === 'mobile') return 'mobile';
  if (template.mode === 'deck') return 'deck';
  if (template.mode === 'image' || template.mode === 'video' || template.mode === 'audio') {
    return template.mode;
  }
  if (template.surface === 'image' || template.surface === 'video' || template.surface === 'audio') {
    return template.surface;
  }
  return 'web';
}

function surfaceFromPluginPreview(
  preview: PluginPreviewSpec,
  mode: string | null,
): VisualInspirationSurface {
  const lowerMode = (mode ?? '').toLowerCase();
  if (lowerMode.includes('deck') || lowerMode.includes('slide')) return 'deck';
  if (lowerMode.includes('mobile')) return 'mobile';
  if (preview.kind === 'media') return preview.mediaType;
  return 'web';
}

function previewUrlFromPluginPreview(preview: PluginPreviewSpec): string | null {
  if (preview.kind === 'html') return preview.src;
  if (preview.kind !== 'media') return null;
  if (preview.mediaType === 'image') return preview.poster;
  if (preview.mediaType === 'video') return preview.videoUrl ?? preview.poster;
  if (preview.mediaType === 'audio') return preview.audioUrl ?? null;
  return null;
}

function compactTags(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value?.trim();
    if (!normalized || seen.has(normalized)) continue;
    seen.add(normalized);
    out.push(normalized);
  }
  return out;
}
