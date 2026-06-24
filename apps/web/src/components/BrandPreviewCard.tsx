// Shared rich brand preview.
//
// The Brand Kit tab renders a full master-detail preview of a brand (cover,
// identity, logo, typography specimens, palette, voice, imagery, the embedded
// design-system kit, and brand asset tiles). The same visual is reused in
// every design-system picker so selecting a brand shows the real brand kit
// instead of a thin one-line summary.
//
//   - `variant='panel'`  — the full Brand Kit tab preview, including the
//                          Use / Open project / Delete actions.
//   - `variant='compact'`— a trimmed pane sized for a narrow picker popover:
//                          cover, name/tagline/domain, identity, typography,
//                          and palette only (no actions or iframe-heavy
//                          sections that would be too heavy in a small popup).

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@open-design/components';
import type { BrandFontSpec, BrandImagerySample, BrandSummary } from '@open-design/contracts';
import { useT } from '../i18n';
import { navigate } from '../router';
import { projectRawUrl } from '../providers/registry';
import { requestHomeChip } from '../runtime/home-intent';
import styles from './BrandPreviewCard.module.css';

// Best-effort hostname for the brand's domain line. Brand names come from the
// extracted kit, but the source URL is always present in meta, so even an
// in-flight / failed brand shows a recognizable label.
export function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || rawUrl;
  }
}

// ─── Logo with fallback chain ────────────────────────────────────────
//
// The brand's own stored logo first, then Google's favicon service for the
// source domain, and finally a monogram tile. Each step advances only when the
// previous image fails to load. `faviconSize` lets callers request an
// appropriately-scaled favicon for the list (64) vs the preview cover (128).
type LogoStage = 'brand' | 'favicon' | 'letter';

interface BrandLogoProps {
  id: string;
  host: string;
  name: string;
  faviconSize: number;
  className?: string;
  fallbackClassName?: string;
}

export function BrandLogo({ id, host, name, faviconSize, className, fallbackClassName }: BrandLogoProps) {
  const [stage, setStage] = useState<LogoStage>('brand');

  useEffect(() => {
    setStage('brand');
  }, [id]);

  const src =
    stage === 'brand'
      ? `/api/brands/${encodeURIComponent(id)}/logo`
      : stage === 'favicon' && host
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${faviconSize}`
        : null;

  const advance = useCallback(() => {
    setStage((s) => (s === 'brand' ? 'favicon' : 'letter'));
  }, []);

  if (!src) {
    return (
      <span className={fallbackClassName} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={advance}
    />
  );
}

/** How many imagery samples render inline before the rest are gated behind a
 *  subtle "show all" toggle, so a long sample set never floods the panel. */
const IMAGE_CAP = 8;

/** Build a CSS font-family stack from a brand font spec, quoting multi-word
 *  family names so they parse as a single family. */
export function fontStack(spec: BrandFontSpec): string {
  const families = [spec.family, ...(spec.fallbacks ?? [])].filter(Boolean);
  if (families.length === 0) return 'ui-sans-serif, system-ui, sans-serif';
  return families.map((f) => (/\s/.test(f) ? `'${f}'` : f)).join(', ');
}

/** Relative-luminance check so swatch hex captions stay legible on the chip. */
export function isLightHex(hex: string): boolean {
  if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return true;
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return r * 0.299 + g * 0.587 + b * 0.114 > 150;
}

/** Token subset the design-system chips surface, mirroring the kit renderer. */
interface BrandTokenSubset {
  colorPrimary?: string;
  colorPrimaryBg?: string;
  colorPrimaryHover?: string;
  colorPrimaryActive?: string;
  fontSize?: number;
  borderRadius?: number;
}

interface BrandFontManifestFile {
  family: string;
  weight: string;
  style: string;
  file: string;
  format: string;
}

// Load the brand's real typefaces into the document so specimens render for
// real: append any Google Fonts stylesheets the kit declares, and inject
// self-hosted @font-face rules from the project's fonts/manifest.json. Both
// sources are best-effort and tolerant of absence (e.g. a brand with no
// harvested manifest still renders via googleFontsUrl or fallbacks). All
// injected nodes are torn down when the brand changes.
export function useBrandFonts(projectId: string | undefined, fonts: BrandFontSpec[]): void {
  const googleUrls = useMemo(() => {
    const urls = fonts
      .map((f) => f.googleFontsUrl)
      .filter((u): u is string => Boolean(u && /^https:\/\/fonts\.googleapis\.com\//i.test(u)));
    return Array.from(new Set(urls));
  }, [fonts]);

  useEffect(() => {
    const links = googleUrls.map((href) => {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = href;
      document.head.appendChild(link);
      return link;
    });
    return () => {
      for (const link of links) link.remove();
    };
  }, [googleUrls]);

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    let styleEl: HTMLStyleElement | null = null;
    void (async () => {
      try {
        const resp = await fetch(projectRawUrl(projectId, 'fonts/manifest.json'), {
          cache: 'no-store',
        });
        if (!resp.ok) return;
        const data = (await resp.json()) as { files?: BrandFontManifestFile[] };
        const files = Array.isArray(data?.files) ? data.files : [];
        if (cancelled || files.length === 0) return;
        const css = files
          .map((f) => {
            const url = projectRawUrl(projectId, `fonts/${f.file}`);
            return [
              '@font-face {',
              `  font-family: '${f.family.replace(/'/g, '')}';`,
              `  src: url('${url}') format('${f.format}');`,
              `  font-weight: ${f.weight};`,
              `  font-style: ${f.style};`,
              '  font-display: swap;',
              '}',
            ].join('\n');
          })
          .join('\n');
        styleEl = document.createElement('style');
        styleEl.dataset.brandFonts = projectId;
        styleEl.textContent = css;
        document.head.appendChild(styleEl);
      } catch {
        // A missing or malformed manifest is expected for some brands; the
        // specimens simply fall back to the system stack.
      }
    })();
    return () => {
      cancelled = true;
      if (styleEl) styleEl.remove();
    };
  }, [projectId]);
}

export interface BrandPreviewCardProps {
  summary: BrandSummary;
  /** Full Brand Kit tab card ('panel') vs trimmed picker popover ('compact'). */
  variant?: 'panel' | 'compact';
  /** Panel-only: called after a mutation (delete) so a parent can refresh. */
  onChanged?: () => void | Promise<void>;
  /** Panel-only: lets a parent clear iframe-heavy detail UI before mutation. */
  onBeforeMutation?: () => void;
  /** Panel-only: apply this brand's design system as the global default. */
  onApplyDesignSystem?: (designSystemId: string) => void;
  /** Panel-only: open the backing extraction project through the app shell. */
  onOpenProject?: (projectId: string) => Promise<boolean> | boolean | void;
  /** Panel-only: disables actions when parent route/selection/summary are stale. */
  actionsDisabled?: boolean;
}

export function BrandPreviewCard({
  summary,
  variant = 'panel',
  onChanged,
  onBeforeMutation,
  onApplyDesignSystem,
  onOpenProject,
  actionsDisabled = false,
}: BrandPreviewCardProps) {
  const t = useT();
  const compact = variant === 'compact';
  const { meta, brand } = summary;
  const host = hostnameOf(meta.sourceUrl);
  const name = brand?.name?.trim() || host;
  const extracting = meta.status === 'extracting';
  const needsInput = meta.status === 'needs_input';
  const failed = meta.status === 'failed';
  const ready = meta.status === 'ready';
  const projectId = meta.projectId;
  const [backingProjectMissing, setBackingProjectMissing] = useState(false);

  const [busy, setBusy] = useState(false);
  const [tokens, setTokens] = useState<BrandTokenSubset | null>(null);
  const [dsTheme, setDsTheme] = useState<'light' | 'dark'>('light');
  const [imagesExpanded, setImagesExpanded] = useState(false);
  const [lightbox, setLightbox] = useState<{ src: string; caption: string } | null>(null);

  const colors = brand?.colors ?? [];
  const fonts = useMemo<{ font: BrandFontSpec; label: string }[]>(() => {
    if (!brand) return [];
    const out: { font: BrandFontSpec; label: string }[] = [];
    if (brand.typography.display) out.push({ font: brand.typography.display, label: 'Display' });
    if (brand.typography.body) out.push({ font: brand.typography.body, label: 'Body' });
    if (brand.typography.mono) out.push({ font: brand.typography.mono, label: 'Mono' });
    return out;
  }, [brand]);

  useBrandFonts(
    projectId,
    useMemo(() => fonts.map((f) => f.font), [fonts]),
  );

  // Logo candidates (primary first, then alternates), de-duped. These resolve
  // under the backing project's raw file route — the same convention the
  // rendered brand.html uses. Only meaningful once the brand has a project.
  const logoCandidates = useMemo(() => {
    const primary = brand?.logo?.primary ?? null;
    const all = [primary, ...(brand?.logo?.alternates ?? [])].filter(
      (c): c is string => Boolean(c),
    );
    return Array.from(new Set(all));
  }, [brand]);
  const [activeLogo, setActiveLogo] = useState(0);
  const activeLogoSrc = logoCandidates[activeLogo] ?? logoCandidates[0] ?? null;
  useEffect(() => {
    setActiveLogo(0);
    setImagesExpanded(false);
    setLightbox(null);
  }, [meta.id]);

  const samples = useMemo<BrandImagerySample[]>(() => {
    const list = brand?.imagery?.samples;
    return Array.isArray(list) ? list.filter((s) => s && s.file) : [];
  }, [brand]);

  const adjectives = brand?.voice?.adjectives ?? [];
  const tone = brand?.voice?.tone?.trim() || '';
  const pillars = brand?.voice?.messagingPillars ?? [];
  const vocabUse = brand?.voice?.vocabulary?.use ?? [];
  const vocabAvoid = brand?.voice?.vocabulary?.avoid ?? [];
  const imagery = brand?.imagery;
  const layout = brand?.layout;

  // The compact picker preview deliberately drops the iframe-heavy sections
  // (embedded kit, asset tiles, image gallery) — they are too heavy for a
  // small popover and need a live project the popover may not warrant.
  const showSystem = Boolean(!compact && ready && projectId);

  // Fetch the six engine tokens the design-system chips show. Best-effort and
  // gated on a finalized brand (the system/ dir only exists post-finalize).
  useEffect(() => {
    if (!showSystem || !projectId) {
      setTokens(null);
      return;
    }
    let cancelled = false;
    void (async () => {
      try {
        const resp = await fetch(projectRawUrl(projectId, 'system/tokens.default.json'), {
          cache: 'no-store',
        });
        if (!resp.ok) return;
        const raw = (await resp.json()) as Record<string, unknown>;
        if (cancelled) return;
        const next: BrandTokenSubset = {};
        if (typeof raw.colorPrimary === 'string') next.colorPrimary = raw.colorPrimary;
        if (typeof raw.colorPrimaryBg === 'string') next.colorPrimaryBg = raw.colorPrimaryBg;
        if (typeof raw.colorPrimaryHover === 'string') next.colorPrimaryHover = raw.colorPrimaryHover;
        if (typeof raw.colorPrimaryActive === 'string') {
          next.colorPrimaryActive = raw.colorPrimaryActive;
        }
        if (typeof raw.fontSize === 'number') next.fontSize = raw.fontSize;
        if (typeof raw.borderRadius === 'number') next.borderRadius = raw.borderRadius;
        setTokens(next.colorPrimary ? next : null);
      } catch {
        // Token chips are decorative; a missing file just hides them.
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [showSystem, projectId]);

  const useInChat = useCallback(async () => {
    if (actionsDisabled) return;
    const designSystemId = meta.designSystemId;
    if (!designSystemId || busy) return;
    setBusy(true);
    try {
      // The brand registered a `user:<id>` design system. Apply it as the
      // global default through the web config channel so the Home composer
      // immediately preselects it; a bare daemon PATCH left React config stale
      // (composer kept showing "No design system") and a later config sync
      // could clobber it back. Fall back to a direct PATCH if the parent did
      // not thread the setter (e.g. a standalone mount).
      if (onApplyDesignSystem) {
        onApplyDesignSystem(designSystemId);
      } else {
        await fetch('/api/app-config', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ designSystemId }),
        });
      }
      // Default the new chat to the Prototype scenario: it surfaces the design
      // system field and is the most common brand-applied build, so the user
      // lands ready to generate with the brand instead of in the generic path.
      // Carry a confirmation notice so Home shows a visible "Using <brand>"
      // banner — otherwise the navigate+apply is silent and the CTA reads as a
      // no-op (the reported bug).
      requestHomeChip('prototype', { notice: t('brand.appliedToChat', { name }) });
      navigate({ kind: 'home', view: 'home' });
    } finally {
      setBusy(false);
    }
  }, [actionsDisabled, meta.designSystemId, busy, onApplyDesignSystem, t, name]);

  useEffect(() => {
    setBackingProjectMissing(false);
  }, [projectId]);

  const openProject = useCallback(async () => {
    if (actionsDisabled) return;
    if (!projectId) return;
    if (onOpenProject) {
      const opened = await onOpenProject(projectId);
      if (opened === false) setBackingProjectMissing(true);
      return;
    }
    navigate({ kind: 'project', projectId, fileName: null, conversationId: null });
  }, [actionsDisabled, onOpenProject, projectId]);

  const deleteBrand = useCallback(async () => {
    if (actionsDisabled) return;
    if (busy) return;
    const ok = window.confirm(t('brandDetail.deleteConfirm').replace('{name}', name));
    if (!ok) return;
    setBusy(true);
    try {
      const resp = await fetch(`/api/brands/${encodeURIComponent(meta.id)}`, { method: 'DELETE' });
      if (!resp.ok) throw new Error('Brand delete failed');
      // Drop the now-stale `/brands/:id` selection before refreshing the list.
      onBeforeMutation?.();
      navigate({ kind: 'home', view: 'brands' }, { replace: true });
      await onChanged?.();
    } catch {
      setBusy(false);
    }
  }, [actionsDisabled, busy, meta.id, name, onBeforeMutation, onChanged, t]);

  const dsKitFile = dsTheme === 'dark' ? 'system/kit.dark.html' : 'system/kit.html';

  const assetTiles = useMemo(
    () => [
      { kind: 'landing', label: 'Landing page', file: 'system/artifacts/landing.html' },
      { kind: 'deck', label: 'Pitch deck', file: 'system/artifacts/deck.html' },
      { kind: 'poster', label: 'Poster', file: 'system/artifacts/poster.html' },
      { kind: 'email', label: 'Email', file: 'system/artifacts/email.html' },
      { kind: 'newsletter', label: 'Newsletter', file: 'system/artifacts/newsletter.html' },
      { kind: 'form', label: 'Form page', file: 'system/artifacts/form.html' },
    ],
    [],
  );

  return (
    <div
      className={`${styles.previewInner} ${compact ? styles.compact : ''}`}
      data-testid="brand-preview-card"
      data-variant={variant}
    >
      <div className={styles.cover}>
        <BrandLogo
          id={meta.id}
          host={host}
          name={name}
          faviconSize={128}
          className={styles.coverLogo}
          fallbackClassName={styles.coverLogoFallback}
        />
      </div>

      <header className={styles.previewHead}>
        <div className={styles.previewHeadText}>
          <div className={styles.previewTitleRow}>
            <h2 className={styles.previewName}>{name}</h2>
            {needsInput ? (
              <span className={`${styles.badge} ${styles.badgeNeedsInput}`} role="status">
                {t('brand.needsInput')}
              </span>
            ) : extracting ? (
              <span className={`${styles.badge} ${styles.badgeBusy}`} role="status">
                {t('brand.extracting')}
              </span>
            ) : failed ? (
              <span className={`${styles.badge} ${styles.badgeFailed}`} role="status">
                {t('brand.failed')}
              </span>
            ) : null}
          </div>
          {brand?.tagline ? <p className={styles.previewTagline}>{brand.tagline}</p> : null}
          {host ? (
            <a
              className={styles.previewDomain}
              href={meta.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {host}
              <ExternalGlyph />
            </a>
          ) : null}
        </div>
        {compact ? null : (
          <div className={styles.previewActions}>
            <Button
              variant="primary"
              onClick={() => void useInChat()}
              disabled={actionsDisabled || busy || !meta.designSystemId}
              data-testid="brand-preview-use"
            >
              {t('brandDetail.useInChat')}
            </Button>
            {projectId ? (
              <Button
                variant="ghost"
                onClick={() => void openProject()}
                disabled={actionsDisabled || busy || backingProjectMissing}
                data-testid="brand-preview-open-project"
              >
                {t('brandDetail.openProject')}
              </Button>
            ) : null}
            <Button
              variant="ghost"
              onClick={() => void deleteBrand()}
              disabled={actionsDisabled || busy}
              data-testid="brand-preview-delete"
            >
              {t('brandDetail.delete')}
            </Button>
          </div>
        )}
      </header>

      {backingProjectMissing ? (
        <div className={styles.missingProjectNotice} role="status">
          {t('project.missing')}
        </div>
      ) : null}

      {needsInput ? (
        <div className={styles.missingProjectNotice} role="status">
          {t('brand.needsInputHint')}
        </div>
      ) : null}

      {failed && meta.error ? (
        <div className={styles.missingProjectNotice} role="status">
          {meta.error}
        </div>
      ) : null}

      {brand?.description ? (
        <section className={styles.section} aria-label={t('brandDetail.identity')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.identity')}</h3>
          <p className={styles.description}>{brand.description}</p>
        </section>
      ) : null}

      {!compact && projectId && activeLogoSrc ? (
        <section className={styles.section} aria-label={t('brandDetail.logo')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.logo')}</h3>
          <div className={styles.logoStage}>
            <img className={styles.logoStageImg} src={projectRawUrl(projectId, activeLogoSrc)} alt={name} />
          </div>
          {logoCandidates.length > 1 ? (
            <div className={styles.logoThumbs}>
              {logoCandidates.map((cand, i) => (
                <button
                  key={cand}
                  type="button"
                  className={`${styles.logoThumb} ${i === activeLogo ? styles.logoThumbActive : ''}`}
                  onClick={() => setActiveLogo(i)}
                  aria-pressed={i === activeLogo}
                >
                  <img src={projectRawUrl(projectId, cand)} alt="" />
                </button>
              ))}
            </div>
          ) : null}
          {brand?.logo?.notes ? <p className={styles.logoNotes}>{brand.logo.notes}</p> : null}
        </section>
      ) : null}

      {fonts.length > 0 ? (
        <section className={styles.section} aria-label={t('brandDetail.typography')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.typography')}</h3>
          <div className={styles.fontTiles}>
            {fonts.map(({ font, label }) => (
              <div key={`tile-${label}-${font.family}`} className={styles.fontTile}>
                <div className={styles.fontTileAg} style={{ fontFamily: fontStack(font) }}>
                  Ag
                </div>
                <div className={styles.fontTileMeta}>
                  <span className={styles.fontTileName}>{font.family}</span>
                  <span className={styles.fontTileRole}>{label}</span>
                </div>
              </div>
            ))}
          </div>
          {compact ? null : (
            <div className={styles.fontList}>
              {fonts.map(({ font, label }) => (
                <div key={`row-${label}-${font.family}`} className={styles.fontItem}>
                  <div className={styles.fontItemHead}>
                    <span className={styles.fontRole}>{label}</span>
                    <span className={styles.fontFamily}>
                      {font.family}
                      {font.weights.length > 0 ? (
                        <span className={styles.fontWeights}> · {font.weights.join('/')}</span>
                      ) : null}
                    </span>
                  </div>
                  <span className={styles.fontSpecimen} style={{ fontFamily: fontStack(font) }}>
                    {label === 'Mono' ? 'const brand = await extract(url);' : name}
                  </span>
                </div>
              ))}
            </div>
          )}
        </section>
      ) : null}

      {colors.length > 0 ? (
        <section className={styles.section} aria-label={t('brandDetail.palette')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.palette')}</h3>
          <div className={styles.paletteGrid}>
            {colors.map((c, i) => (
              <div key={`${c.role}-${i}`} className={styles.swatch}>
                <span className={styles.swatchChip} style={{ background: c.hex }}>
                  <span
                    className={styles.swatchHex}
                    style={{ color: isLightHex(c.hex) ? 'rgba(0,0,0,.65)' : 'rgba(255,255,255,.9)' }}
                  >
                    {c.hex}
                  </span>
                </span>
                <div className={styles.swatchBody}>
                  <span className={styles.swatchName}>{c.name || c.role}</span>
                  <span className={styles.swatchRole}>{c.role}</span>
                  {!compact && c.usage ? <span className={styles.swatchUsage}>{c.usage}</span> : null}
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!compact &&
      (adjectives.length > 0 ||
        tone ||
        pillars.length > 0 ||
        vocabUse.length > 0 ||
        vocabAvoid.length > 0) ? (
        <section className={styles.section} aria-label={t('brandDetail.voiceTone')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.voiceTone')}</h3>
          {adjectives.length > 0 ? (
            <div className={styles.pills}>
              {adjectives.map((adj, i) => (
                <span key={`${adj}-${i}`} className={styles.pill}>
                  {adj}
                </span>
              ))}
            </div>
          ) : null}
          {tone ? <p className={styles.aesthetic}>{tone}</p> : null}
          {pillars.length > 0 ? (
            <ul className={styles.pillars}>
              {pillars.map((p, i) => (
                <li key={`pillar-${i}`}>{p}</li>
              ))}
            </ul>
          ) : null}
          {vocabUse.length > 0 || vocabAvoid.length > 0 ? (
            <div className={styles.vocab}>
              {vocabUse.length > 0 ? (
                <div className={styles.vocabCol}>
                  <span className={styles.vocabUse}>{t('brandDetail.useLabel')}</span>
                  <span className={styles.vocabVals}>{vocabUse.join(' · ')}</span>
                </div>
              ) : null}
              {vocabAvoid.length > 0 ? (
                <div className={styles.vocabCol}>
                  <span className={styles.vocabAvoid}>{t('brandDetail.avoidLabel')}</span>
                  <span className={styles.vocabVals}>{vocabAvoid.join(' · ')}</span>
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {!compact &&
      (imagery?.style ||
        (imagery?.subjects?.length ?? 0) > 0 ||
        imagery?.treatment ||
        (imagery?.avoid?.length ?? 0) > 0 ||
        (layout?.postureRules?.length ?? 0) > 0) ? (
        <section className={styles.section} aria-label={t('brandDetail.imageryLayout')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.imageryLayout')}</h3>
          {imagery?.style ? <p className={styles.description}>{imagery.style}</p> : null}
          {(imagery?.subjects?.length ?? 0) > 0 ? (
            <p className={styles.imageryLine}>
              <span className={styles.imageryKey}>{t('brandDetail.subjects')}:</span>{' '}
              {imagery?.subjects.join(', ')}
            </p>
          ) : null}
          {imagery?.treatment ? (
            <p className={styles.imageryLine}>
              <span className={styles.imageryKey}>{t('brandDetail.treatment')}:</span>{' '}
              {imagery.treatment}
            </p>
          ) : null}
          {(imagery?.avoid?.length ?? 0) > 0 ? (
            <p className={styles.imageryLine}>
              <span className={styles.imageryKeyAvoid}>{t('brandDetail.avoidLabel')}:</span>{' '}
              {imagery?.avoid.join(', ')}
            </p>
          ) : null}
          {(layout?.postureRules?.length ?? 0) > 0 ? (
            <div className={styles.posture}>
              <h4 className={styles.subTitle}>{t('brandDetail.layoutPosture')}</h4>
              <ul className={styles.postureList}>
                {layout?.postureRules.map((r, i) => (
                  <li key={`posture-${i}`}>{r}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </section>
      ) : null}

      {!compact && projectId && samples.length > 0 ? (
        <section className={styles.section} aria-label={t('brandDetail.images')}>
          <div className={styles.dsHead}>
            <h3 className={styles.sectionTitle}>{t('brandDetail.images')}</h3>
            {samples.length > IMAGE_CAP ? (
              <button
                type="button"
                className={styles.sectionAction}
                onClick={() => setImagesExpanded((v) => !v)}
              >
                {imagesExpanded
                  ? t('brandDetail.viewLess')
                  : t('brandDetail.viewMore').replace('{count}', String(samples.length))}
              </button>
            ) : null}
          </div>
          <div className={styles.gallery}>
            {(imagesExpanded ? samples : samples.slice(0, IMAGE_CAP)).map((s, i) => {
              const src = projectRawUrl(projectId, s.file);
              const cap = s.caption || s.kind || name;
              return (
                <figure key={`${s.file}-${i}`} className={styles.shot}>
                  <button
                    type="button"
                    className={styles.shotFrame}
                    onClick={() => setLightbox({ src, caption: cap })}
                    aria-label={cap}
                  >
                    <img src={src} alt={cap} loading="lazy" />
                  </button>
                  {s.caption || s.kind ? (
                    <figcaption className={styles.shotMeta}>
                      <span className={styles.shotCap}>{s.caption || s.kind}</span>
                      {s.caption && s.kind ? (
                        <span className={styles.shotKind}>{s.kind}</span>
                      ) : null}
                    </figcaption>
                  ) : null}
                </figure>
              );
            })}
          </div>
        </section>
      ) : null}

      {showSystem && projectId ? (
        <section className={styles.section} aria-label={t('brandDetail.designSystem')}>
          <div className={styles.dsHead}>
            <h3 className={styles.sectionTitle}>{t('brandDetail.designSystem')}</h3>
            <a
              className={styles.dsOpen}
              href={projectRawUrl(projectId, 'system/index.html')}
              target="_blank"
              rel="noreferrer noopener"
            >
              {t('brandDetail.openFullSystem')}
              <ExternalGlyph />
            </a>
          </div>
          <div className={styles.dsFrameWrap}>
            <div className={styles.dsBar}>
              <div className={styles.dsTabs}>
                <button
                  type="button"
                  className={`${styles.dsTab} ${dsTheme === 'light' ? styles.dsTabActive : ''}`}
                  onClick={() => setDsTheme('light')}
                  aria-pressed={dsTheme === 'light'}
                >
                  {t('brandDetail.themeLight')}
                </button>
                <button
                  type="button"
                  className={`${styles.dsTab} ${dsTheme === 'dark' ? styles.dsTabActive : ''}`}
                  onClick={() => setDsTheme('dark')}
                  aria-pressed={dsTheme === 'dark'}
                >
                  {t('brandDetail.themeDark')}
                </button>
              </div>
              <span className={styles.dsCap}>system/kit.html</span>
            </div>
            <iframe
              key={`${meta.id}:${projectId}:${dsKitFile}`}
              className={styles.dsFrame}
              src={projectRawUrl(projectId, dsKitFile)}
              loading="lazy"
              sandbox=""
              title={t('brandDetail.designSystem')}
            />
          </div>
          {tokens?.colorPrimary ? (
            <div className={styles.dsTokens}>
              <TokenChip label="colorPrimary" hex={tokens.colorPrimary} />
              {tokens.colorPrimaryBg ? (
                <TokenChip label="colorPrimaryBg" hex={tokens.colorPrimaryBg} />
              ) : null}
              {tokens.colorPrimaryHover ? (
                <TokenChip label="colorPrimaryHover" hex={tokens.colorPrimaryHover} />
              ) : null}
              {tokens.colorPrimaryActive ? (
                <TokenChip label="colorPrimaryActive" hex={tokens.colorPrimaryActive} />
              ) : null}
              {tokens.fontSize != null ? (
                <ValueChip label="fontSize" value={String(tokens.fontSize)} />
              ) : null}
              {tokens.borderRadius != null ? (
                <ValueChip label="borderRadius" value={String(tokens.borderRadius)} />
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}

      {showSystem && projectId ? (
        <section className={styles.section} aria-label={t('brandDetail.brandAssets')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.brandAssets')}</h3>
          <div className={styles.assets}>
            {assetTiles.map((a) => (
              <a
                key={a.kind}
                className={styles.asset}
                href={projectRawUrl(projectId, a.file)}
                target="_blank"
                rel="noreferrer noopener"
              >
                <div className={styles.assetFrame}>
                  <iframe
                    key={`${meta.id}:${projectId}:${a.file}`}
                    src={projectRawUrl(projectId, a.file)}
                    loading="lazy"
                    tabIndex={-1}
                    aria-hidden="true"
                    sandbox=""
                    title={a.label}
                  />
                </div>
                <div className={styles.assetMeta}>
                  <span className={styles.assetName}>{a.label}</span>
                </div>
              </a>
            ))}
          </div>
        </section>
      ) : null}

      {lightbox ? (
        <div
          className={styles.lightbox}
          role="dialog"
          aria-modal="true"
          aria-label={lightbox.caption}
          onClick={() => setLightbox(null)}
        >
          <button
            type="button"
            className={styles.lightboxClose}
            onClick={() => setLightbox(null)}
            aria-label={t('newBrand.close')}
          >
            <CloseGlyph />
          </button>
          <img
            className={styles.lightboxImg}
            src={lightbox.src}
            alt={lightbox.caption}
            onClick={(e) => e.stopPropagation()}
          />
        </div>
      ) : null}
    </div>
  );
}

function TokenChip({ label, hex }: { label: string; hex: string }) {
  return (
    <div className={styles.tok}>
      <span className={styles.tokSwatch} style={{ background: hex }} />
      <span className={styles.tokText}>
        <span className={styles.tokKey}>{label}</span>
        <span className={styles.tokHex}>{hex}</span>
      </span>
    </div>
  );
}

function ValueChip({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.tok}>
      <span className={styles.tokValue}>{value}</span>
      <span className={styles.tokKey}>{label}</span>
    </div>
  );
}

function ExternalGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden>
      <path
        d="M6 3.5h6.5V10M12.5 3.5L6.5 9.5M9 3.5H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function CloseGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="16" height="16" fill="none" aria-hidden>
      <path
        d="M4 4l8 8M12 4l-8 8"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </svg>
  );
}
