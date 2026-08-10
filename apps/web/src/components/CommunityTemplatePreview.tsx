// Shared "lightweight" template detail preview + the catalogue→template
// projection behind it.
//
// Extracted from CommunityView so BOTH template-detail entry points resolve
// the same surfaces (飞书 recvqxDuYM6Uxk):
//   • the Community gallery card opens the FULL plugin details modal
//     (PluginDetailsModal), and
//   • the creation page's active template chip opens THIS lightweight
//     preview (header title/category + close, footer category + Remix).
// Keeping the projection (`buildCommunityTemplates`) and the modal together
// in one module is what lets the Home side render a plugin record through
// the exact same view-model the Community grid uses — no third modal, no
// duplicated data shaping.

import type {
  InstalledPluginRecord,
  WorkspaceCollabContext,
} from '@open-design/contracts';
import { createPortal } from 'react-dom';
import { useT } from '../i18n';
import type { Dict, Locale } from '../i18n/types';
import { Icon } from './Icon';
import {
  buildCategoryCatalog,
  buildSubcategoryCatalog,
  extractCategories,
  extractSubcategories,
} from './plugins-home/facets';
import { localizePluginTitle } from './plugins-home/localization';
import { examplePresetSeedPrompt } from './plugins-home/presetSeedPrompt';
import { inferPluginPreview, type MediaPreviewSpec } from './plugins-home/preview';
import { pluginSubfacetLabel } from './plugins-home/subfacetLabel';

export type TemplateType = 'Prototype' | 'Live Artifact' | 'Slides' | 'Image' | 'Video' | 'HyperFrames' | 'Audio';

export type TemplateDemo = {
  id: string;
  title: string;
  tags: string[];
  accent: string;
  meta: string;
  type: TemplateType;
  subtype: string;
  /** The WHOLE media spec the gallery tile renders — poster plus, for plugins
   *  the daemon has baked, the looping clip (`videoUrl`) and the in-place span
   *  it loops while idle (`loopHoldMs`). Flattening this to a poster string is
   *  what turned every tile into a still image. Null when the plugin resolves
   *  to no media at all (html/design/text), in which case the stylized paper
   *  thumb renders instead. */
  cardMedia: MediaPreviewSpec | null;
  /** Card thumbnail. Null when the plugin ships no poster at all, in which case
   *  the stylized paper thumb renders instead. */
  posterSrc: string | null;
  /** Daemon-served live preview for the detail modal (html-preview plugins). */
  previewSrc: string | null;
  /** Playable clip for the detail modal when the plugin is a media template. */
  previewVideo: string | null;
  /** Composer seed carried by the card's Remix / Copy prompt action. */
  prompt: string;
};

export const TEMPLATE_TYPE_ORDER: TemplateType[] = ['Slides', 'Prototype', 'Live Artifact', 'Image', 'Video', 'HyperFrames', 'Audio'];

/** The Community grid is the plugin catalogue seen through the artifact a user
 *  wants to make. Membership comes from the shared facet derivation in
 *  `plugins-home/facets.ts` — the same taxonomy the Home starter rail uses — so
 *  a plugin lands in exactly one tab here and in the same tab there. Do not
 *  re-derive categories locally. */
const FACET_CATEGORY_TYPE: Record<string, TemplateType> = {
  'deck': 'Slides',
  'prototype': 'Prototype',
  'live-artifact': 'Live Artifact',
  'image': 'Image',
  'video': 'Video',
  'hyperframes': 'HyperFrames',
  'audio': 'Audio',
};

// The type tabs are rendered from the catalogue's `type` field, which is
// a data value rather than copy. Map it onto a translated label so the tab row
// is not the one English strip on an otherwise localized page.
export const TEMPLATE_TYPE_LABEL_KEY: Record<TemplateType, keyof Dict> = {
  'Prototype': 'community.typePrototype',
  'Live Artifact': 'community.typeLiveArtifact',
  'Slides': 'community.typeSlides',
  'Image': 'community.typeImage',
  'Video': 'community.typeVideo',
  'HyperFrames': 'community.typeHyperFrames',
  'Audio': 'community.typeAudio',
};

// Card accents tint the thumbnail plate and the fallback preview page. The
// palette is the designer's; picking from it by a stable hash of the plugin id
// keeps a card's colour fixed across reloads without hand-maintaining a table.
const TEMPLATE_ACCENTS = [
  '#4164f4', '#d46342', '#111827', '#0f9f6e', '#353535', '#ea580c', '#0284c7',
  '#4f46e5', '#db2777', '#16a34a', '#475569', '#f59e0b', '#0f172a', '#1A74FF',
  '#be123c', '#0d9488', '#0891b2', '#ec4899', '#64748b', '#8b5cf6', '#334155',
];

function hashString(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i += 1) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h);
}

function templateAccent(id: string): string {
  return TEMPLATE_ACCENTS[hashString(id) % TEMPLATE_ACCENTS.length]!;
}

/** Project the installed plugin catalogue onto the Community grid's card shape.
 *  Every field the grid reads — badge counts, subtype pills, thumbnails, the
 *  modal preview, and the composer seed — is derived here from the record, so
 *  the page has exactly one data source: `GET /api/plugins`. */
export function buildCommunityTemplates(
  plugins: InstalledPluginRecord[],
  locale: Locale,
  t: ReturnType<typeof useT>,
  workspaceContext?: WorkspaceCollabContext | null,
): TemplateDemo[] {
  const categoryOrder = buildCategoryCatalog(plugins).map((option) => option.slug);
  const subcategoryCatalog = buildSubcategoryCatalog(plugins);
  const subcategoryRank = new Map<string, number>();
  const subcategoryLabel = new Map<string, string>();
  for (const [parent, options] of Object.entries(subcategoryCatalog)) {
    options.forEach((option, index) => {
      subcategoryRank.set(`${parent}:${option.slug}`, index);
      subcategoryLabel.set(`${parent}:${option.slug}`, option.label);
    });
  }

  const entries = plugins.flatMap((record, index) => {
    const categorySlug = extractCategories(record)[0];
    if (!categorySlug) return [];
    const type = FACET_CATEGORY_TYPE[categorySlug];
    if (!type) return [];
    const subSlug = extractSubcategories(record, categorySlug)[0] ?? null;
    return [{ record, index, categorySlug, subSlug, type }];
  });

  // Group the grid the way the pills read: category order, then the sub-facet
  // display order, then catalogue order. The subtype pill row is derived from
  // this array, so sorting here is what puts the pills in taxonomy order.
  entries.sort((a, b) => {
    const byCategory = categoryOrder.indexOf(a.categorySlug) - categoryOrder.indexOf(b.categorySlug);
    if (byCategory !== 0) return byCategory;
    const rank = (categorySlug: string, subSlug: string | null) => (
      subSlug === null
        ? Number.MAX_SAFE_INTEGER
        : subcategoryRank.get(`${categorySlug}:${subSlug}`) ?? Number.MAX_SAFE_INTEGER - 1
    );
    const bySub = rank(a.categorySlug, a.subSlug) - rank(b.categorySlug, b.subSlug);
    if (bySub !== 0) return bySub;
    return a.index - b.index;
  });

  return entries.map(({ record, categorySlug, subSlug, type }) => {
    const title = localizePluginTitle(locale, record);
    const typeLabel = t(TEMPLATE_TYPE_LABEL_KEY[type]);
    const subtype = subSlug
      ? pluginSubfacetLabel(subSlug, subcategoryLabel.get(`${categorySlug}:${subSlug}`) ?? subSlug, t)
      : '';
    // Gallery tiles prefer the pre-baked poster; the modal keeps the real
    // `od.preview` so opening a card shows the live page, not the baked frame.
    const card = inferPluginPreview(record, { preferBaked: true, workspaceContext });
    const detail = inferPluginPreview(record, { workspaceContext });
    // Carry the whole spec, not just its poster: a baked preview's `videoUrl`
    // and `loopHoldMs` are what let the tile play its short screen recording
    // instead of sitting on the first frame.
    const cardMedia = card.kind === 'media' ? card : null;
    return {
      id: record.id,
      title,
      tags: record.manifest?.tags ?? [],
      accent: templateAccent(record.id),
      meta: subtype ? `${typeLabel} · ${subtype}` : typeLabel,
      type,
      subtype,
      cardMedia,
      posterSrc: cardMedia ? cardMedia.poster : detail.kind === 'media' ? detail.poster : null,
      previewSrc: detail.kind === 'html' ? detail.src : null,
      previewVideo: detail.kind === 'media' ? detail.videoUrl : null,
      prompt: examplePresetSeedPrompt(record, locale, () => title).text,
    };
  });
}

export function TemplatePreviewModal({
  template,
  onClose,
  onUse,
  busy,
}: {
  template: TemplateDemo;
  onClose: () => void;
  onUse: () => void;
  busy?: boolean;
}) {
  const t = useT();
  // The overlay is `position: fixed; inset: 0`, so it must render as a direct
  // child of <body> (the PluginDetailsModal convention). Left inline, any host
  // ancestor that forms a stacking context — e.g. `.home-view`'s
  // `isolation: isolate` (home-hero.css), which contains its kinetic-grid
  // canvas — traps the scrim's z-index locally, and shell chrome like the
  // entry rail (z-index 30) and the workspace tabs paints on top of it.
  const overlay = (
    <div className="community-template-preview" role="presentation" onMouseDown={onClose}>
      <section
        className="community-template-preview__panel"
        role="dialog"
        aria-modal="true"
        aria-labelledby="community-template-preview-title"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="community-template-preview__head">
          <div>
            <h2 id="community-template-preview-title">{template.title}</h2>
            <p>{template.meta}</p>
          </div>
          <button type="button" aria-label={t('community.closePreview')} onClick={onClose}>
            <Icon name="close" size={17} />
          </button>
        </header>
        <iframe
          title={`${template.title} preview`}
          className="community-template-preview__frame"
          // Html-preview plugins load their real daemon-served page; media
          // templates have no page to load, so the same frame carries their
          // poster/clip instead.
          {...(template.previewSrc
            ? { src: template.previewSrc }
            : { srcDoc: templatePreviewHtml(template) })}
        />
        <footer className="community-template-preview__foot">
          <span>{template.meta}</span>
          <button type="button" disabled={busy} onClick={onUse}>
            {busy ? t('common.loading') : templateActionLabel(template)}
          </button>
        </footer>
      </section>
    </div>
  );
  if (typeof document === 'undefined') return overlay;
  return createPortal(overlay, document.body);
}

export function isPromptArtifact(template: TemplateDemo): boolean {
  return template.type === 'Image' || template.type === 'Video' || template.type === 'Audio';
}

export function templateActionLabel(template: TemplateDemo): string {
  return isPromptArtifact(template) ? 'Copy prompt' : 'Remix';
}

export async function copyTemplatePrompt(template: TemplateDemo): Promise<void> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return;
  await navigator.clipboard.writeText(template.prompt);
}

function escapeHtmlAttribute(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

/** Document rendered inside the detail frame when the plugin has no daemon
 *  html preview: media templates show their real poster/clip, and the handful
 *  of plugins that ship neither fall back to the stylized template page. */
function templatePreviewHtml(template: TemplateDemo): string {
  if (template.previewVideo || template.posterSrc) {
    const poster = template.posterSrc ? escapeHtmlAttribute(template.posterSrc) : '';
    const body = template.previewVideo
      ? `<video src="${escapeHtmlAttribute(template.previewVideo)}"${poster ? ` poster="${poster}"` : ''} controls autoplay muted loop playsinline></video>`
      : `<img src="${poster}" alt="" />`;
    return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    html, body { margin: 0; height: 100%; }
    body { display: grid; place-items: center; background: #0b1020; }
    img, video { display: block; max-width: 100%; max-height: 100%; object-fit: contain; }
  </style>
</head>
<body>${body}</body>
</html>`;
  }
  return `<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <style>
    * { box-sizing: border-box; }
    body { margin: 0; font-family: var(--sans); color: #111827; background: #f8fafc; }
    .shell { min-height: 100vh; padding: 56px; background: linear-gradient(135deg, ${template.accent}1f, #ffffff 42%, #f8fafc); }
    nav { display: flex; justify-content: space-between; align-items: center; margin-bottom: 72px; font-size: 14px; color: #64748b; }
    .logo { display: flex; align-items: center; gap: 10px; color: #111827; font-weight: 800; }
    .mark { width: 28px; height: 28px; border-radius: var(--radius-large, 8px); background: ${template.accent}; box-shadow: 0 12px 30px ${template.accent}45; }
    .hero { display: grid; grid-template-columns: minmax(0, 1fr) 360px; gap: 56px; align-items: center; }
    h1 { margin: 0; max-width: 740px; font-size: 64px; line-height: .94; letter-spacing: -.04em; }
    p { color: #64748b; line-height: 1.7; font-size: 18px; }
    .cta { display: inline-flex; margin-top: 24px; padding: 14px 20px; border-radius: 999px; background: #111827; color: #fff; font-weight: 750; }
    .card { min-height: 360px; padding: 28px; border: 1px solid #e5e7eb; border-radius: 28px; background: rgba(255,255,255,.82); box-shadow: 0 30px 80px rgba(15,23,42,.12); }
    .stripe { height: 8px; border-radius: 999px; background: ${template.accent}; margin-bottom: 28px; }
    .metric { display: grid; gap: 8px; padding: 18px 0; border-bottom: 1px solid #e5e7eb; }
    .metric strong { font-size: 28px; }
    .sections { display: grid; grid-template-columns: repeat(3, 1fr); gap: 18px; margin-top: 56px; }
    .section { padding: 22px; border-radius: 20px; background: #fff; border: 1px solid #e5e7eb; }
    .section b { display: block; margin-bottom: 10px; }
  </style>
</head>
<body>
  <main class="shell">
    <nav><span class="logo"><span class="mark"></span>${template.title}</span><span>${template.tags.join(' · ')}</span></nav>
    <section class="hero">
      <div>
        <h1>${template.title} template for polished product storytelling.</h1>
        <p>${template.meta}</p>
        <span class="cta">Preview template</span>
      </div>
      <aside class="card">
        <div class="stripe"></div>
        <div class="metric"><span>Primary outcome</span><strong>Clearer launch story</strong></div>
        <div class="metric"><span>Format</span><strong>${template.meta}</strong></div>
        <div class="metric"><span>Style</span><strong>Modern editorial</strong></div>
      </aside>
    </section>
    <section class="sections">
      <div class="section"><b>Structure</b><span>Ready-made sections and hierarchy.</span></div>
      <div class="section"><b>Visual System</b><span>Color, type, rhythm, and reusable blocks.</span></div>
      <div class="section"><b>Editable</b><span>Remix into a real Open Design project.</span></div>
    </section>
  </main>
</body>
</html>`;
}
