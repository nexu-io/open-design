#!/usr/bin/env -S npx -y tsx
/**
 * editorial-collage — HTML composer.
 *
 * Reads `inputs.json` (matching `../schema.ts`) and writes a single
 * self-contained HTML file with the Atelier Zero stylesheet inlined,
 * the 16 collage images referenced by relative URL, and the
 * scroll-reveal + headroom-nav scripts embedded.
 *
 * Usage:
 *   npx tsx scripts/compose.ts <inputs.json> <output.html>
 *
 * Re-generate the canonical example:
 *   npx tsx scripts/compose.ts inputs.example.json example.html
 */

import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve, isAbsolute } from 'node:path';
import { fileURLToPath } from 'node:url';
import type {
  EditorialCollageInputs,
  MixedText,
  HeroIndexItem,
  HeroStat,
  CapabilityCard,
  LabPill,
  LabCard,
  MethodStep,
  WorkCard,
  Partner,
  FooterColumn,
  SectionRule,
} from '../schema';

const SKILL_ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/* ------------------------------------------------------------------ *
 * helpers
 * ------------------------------------------------------------------ */

/** Render a `MixedText` into HTML (sans/em/dot segments). */
function mixed(text: MixedText): string {
  return text
    .map((seg) => {
      if (seg.dot) return `<span class='dot'>${seg.text}</span>`;
      if (seg.em) return `<em>${seg.text}</em>`;
      return seg.text;
    })
    .join('');
}

/** Newline → `<br/>` for multi-line headings/labels. */
function br(s: string): string {
  return s.replace(/\n/g, '<br/>');
}

/** External-link attribute pair. */
function ext(href: string): string {
  if (/^(https?:|mailto:|\/\/)/i.test(href)) {
    return ` target='_blank' rel='noreferrer noopener'`;
  }
  return '';
}

const ARROW_OUT = `<svg viewBox='0 0 24 24'><path d='M5 19L19 5M19 5H8M19 5v11'/></svg>`;
const ARROW_PLUS = `<svg viewBox='0 0 24 24'><circle cx='12' cy='12' r='9'/><path d='M9 12h6M12 9v6'/></svg>`;

/** A small CSS class we reference from inputs as `code-inline` / `code-inline sm`. */
const CODE_INLINE_CSS = `
.code-inline {
  font-family: var(--mono);
  font-size: 14px;
  background: var(--bone);
  padding: 1px 6px;
  border-radius: 4px;
}
.code-inline.sm { font-size: 12px; padding: 0 4px; }
`;

/* ------------------------------------------------------------------ *
 * section renderers
 * ------------------------------------------------------------------ */

function renderHead(i: EditorialCollageInputs, css: string): string {
  return `<head>
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1' />
<title>${i.brand.name} — ${i.brand.tagline}</title>
<meta name='description' content='${i.brand.description}' />
<link rel='preconnect' href='https://fonts.googleapis.com' />
<link rel='preconnect' href='https://fonts.gstatic.com' crossorigin />
<link href='https://fonts.googleapis.com/css2?family=Inter+Tight:wght@400;500;600;700;800;900&family=Inter:wght@300;400;500;600&family=Playfair+Display:ital,wght@0,500;0,600;1,400;1,500;1,600;1,700&family=JetBrains+Mono:wght@400;500&display=swap' rel='stylesheet' />
<style>${css}${CODE_INLINE_CSS}</style>
</head>`;
}

function renderRails(i: EditorialCollageInputs): string {
  return `
<div class='side-rail right' data-od-id='rail-right'>
  <span class='rail-text'>${i.brand.rails.right}</span>
</div>
<div class='side-rail left' data-od-id='rail-left'>
  <span class='rail-text'>${i.brand.rails.left}</span>
</div>`;
}

function renderTopbar(i: EditorialCollageInputs): string {
  const langs = i.brand.languages
    .map((l, idx) => (idx === 0 ? `<b>${l}</b>` : l))
    .join(' · ');
  return `
<div class='topbar' data-od-id='topbar'>
  <div class='container topbar-inner'>
    <span><b>OD / ${i.brand.year}</b> &nbsp;·&nbsp; ${i.brand.edition}</span>
    <span class='mid'>
      <span>Filed under <b class='coral'>${i.brand.filed_under}</b></span>
      <span>${i.brand.license} · Made on Earth</span>
    </span>
    <span class='right'>
      <a class='topbar-link' href='${i.brand.primary_url}/releases'${ext(i.brand.primary_url)}><span class='pulse'></span>${i.brand.status}</a>
      <span>${langs}</span>
    </span>
  </div>
</div>`;
}

function renderNav(i: EditorialCollageInputs): string {
  const links = i.nav
    .map(
      (link) =>
        `<li><a href='${link.href}'${ext(link.href)}>${link.label}${
          link.count ? `<span class='num'>${link.count}</span>` : ''
        }</a></li>`,
    )
    .join('\n          ');
  return `
<header class='nav' data-od-id='nav'>
  <div class='container nav-inner'>
    <a href='#top' class='brand'>
      <span class='brand-mark'>${i.brand.mark}</span>
      <span>${i.brand.name}</span>
      <span class='brand-meta'><b>${i.brand.meta.title}</b>${i.brand.meta.subtitle}</span>
    </a>
    <nav>
      <ul class='nav-links'>
          ${links}
      </ul>
    </nav>
    <div class='nav-side'>
      ${
        i.brand.download_url
          ? `<a class='nav-cta ghost' href='${i.brand.download_url}'${ext(i.brand.download_url)}>${i.brand.download_url_label ?? 'Download'}</a>
      `
          : ''
      }<a class='nav-cta' href='${i.brand.primary_url}'${ext(i.brand.primary_url)}>${i.brand.primary_url_label}</a>
      <span class='status-dot' aria-hidden='true'></span>
    </div>
  </div>
</header>`;
}

function renderSecRule(r: SectionRule): string {
  return `
  <div class='sec-rule'>
    <span class='roman'>${r.roman}</span>
    <span class='meta-grp'>
      <span>${r.meta[0]}</span>
      <span class='dot-mark'>${r.meta[1]}</span>
      <span>${r.meta[2]}</span>
    </span>
    <span>${r.pagination}</span>
  </div>`;
}

function renderHeroStat(s: HeroStat): string {
  const variant = s.variant ?? 'dashed';
  const ringClass = variant === 'solid' ? 'ring solid' : variant === 'coral' ? 'ring coral' : 'ring';
  return `<div class='stat'>
    <span class='${ringClass}'>${s.value}</span>
    <span class='stat-label'><b>${s.label}</b>${s.sub}</span>
  </div>`;
}

function renderHeroIndex(item: HeroIndexItem): string {
  return `<span${item.active ? ` class='on'` : ''}><span class='n'>${item.num}</span>${item.label}</span>`;
}

function renderHero(i: EditorialCollageInputs): string {
  const stats = i.hero.stats.map(renderHeroStat).join('\n          ');
  const index = i.hero.index.map(renderHeroIndex).join('\n      ');
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  return `
<section class='hero' id='top' data-od-id='hero'>
  <div class='container'>
    <div class='sec-rule'>
      <span class='roman'>I.</span>
      <span class='meta-grp'>
        <span>Hero / Cover Plate</span>
        <span class='dot-mark'>•</span>
        <span>${i.brand.name} / Volume 01</span>
      </span>
      <span>001 / 008</span>
    </div>
  </div>
  <div class='container hero-grid'>
    <div class='hero-copy'>
      <span class='label' data-reveal>${i.hero.label} <span class='ix'>${i.hero.ix}</span></span>
      <h1 class='display' data-reveal>${mixed(i.hero.headline)}</h1>
      <p class='lead' data-reveal>${i.hero.lead}</p>
      <div class='hero-actions' data-reveal>
        <a class='btn btn-primary' href='${i.hero.primary.href}'${ext(i.hero.primary.href)}>
          ${i.hero.primary.label}
          <span class='arrow'>${ARROW_OUT}</span>
        </a>
        <a class='btn btn-ghost' href='${i.hero.secondary.href}'${ext(i.hero.secondary.href)}>
          ${i.hero.secondary.label}
          <span class='arrow'>${ARROW_PLUS}</span>
        </a>
      </div>
      <div class='hero-stats' data-reveal>
          ${stats}
      </div>
      <div class='hero-foot' data-reveal>
        <span class='meta'>${i.hero.meta}</span>
        <span class='coord'>${i.brand.coordinates}</span>
      </div>
    </div>
    <div class='hero-art' data-reveal='scale'>
      <span class='corner tl'></span>
      <span class='corner tr'></span>
      <span class='corner bl'></span>
      <span class='corner br'></span>
      <span class='annot annot-tl coord'>${i.hero.annotations.tl}</span>
      <span class='annot annot-tr'>${i.hero.annotations.tr}</span>
      <span class='annot annot-bl coord'>${i.hero.annotations.bl}</span>
      <span class='annot annot-br'>${i.hero.annotations.br}</span>
      <img src='${assets}hero.png' alt='' />
      <div class='index'>
      ${index}
      </div>
    </div>
  </div>
</section>`;
}

function renderAbout(i: EditorialCollageInputs): string {
  const r = i.rules.about;
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  return `
<section class='about' data-od-id='about'>
  <div class='container'>
    ${renderSecRule(r).trim()}
    <div class='about-grid'>
      <div class='about-copy' data-reveal>
        <span class='label'>${i.about.label} <span class='ix'>${i.about.ix}</span></span>
        <h2 class='display'>${mixed(i.about.headline)}</h2>
        <p class='lead'>${i.about.lead}</p>
        <a class='btn btn-ghost' href='${i.about.cta_href}'${ext(i.about.cta_href)}>
          ${i.about.cta_label}
          <span class='arrow'>${ARROW_OUT}</span>
        </a>
        <div class='footer-row'>
          <span class='mark'>${i.brand.mark}</span>
          <span>${i.about.footer_text}</span>
          <span class='stamp'>
            <span>${i.about.stamp_top}</span>
            <span style='color: var(--ink);'>${i.about.stamp_bottom}</span>
          </span>
        </div>
      </div>
      <div class='about-art' data-reveal='right'>
        <img src='${assets}about.png' alt='' />
        <div class='about-side-note'>
          <b></b>
          ${i.about.side_note}
        </div>
        <div class='about-caption'>
          <b>${i.about.caption.bold}</b>
          ${i.about.caption.rest}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function renderCapabilityCard(c: CapabilityCard): string {
  return `<div class='card' data-reveal>
    <div class='num'>${c.num}<span class='tag'>${c.tag}</span></div>
    <svg class='icon' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.5'>
      ${c.icon_svg}
    </svg>
    <h3>${br(c.title)}</h3>
    <p>${c.body}</p>
    <a class='arrow-mark' href='${c.href}'${ext(c.href)} aria-label='Learn more about ${c.tag}'>
      ${ARROW_OUT}
    </a>
  </div>`;
}

function renderCapabilities(i: EditorialCollageInputs): string {
  const cards = i.capabilities.cards.map(renderCapabilityCard).join('\n            ');
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  return `
<section class='capabilities' id='agents' data-od-id='capabilities'>
  <div class='container'>
    ${renderSecRule(i.rules.capabilities).trim()}
    <div class='capabilities-grid'>
      <div class='capabilities-art' data-reveal='left'>
        <span class='corner tl'></span>
        <span class='corner br'></span>
        <img src='${assets}capabilities.png' alt='' />
        <div class='ribbon'>${i.capabilities.ribbon}</div>
      </div>
      <div class='capabilities-copy' data-reveal>
        <span class='label'>${i.capabilities.label} <span class='ix'>${i.capabilities.ix}</span></span>
        <h2 class='display'>${mixed(i.capabilities.headline)}</h2>
        <p class='lead'>${i.capabilities.lead}</p>
        <div class='cards'>
            ${cards}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

function renderLabPill(p: LabPill): string {
  return `<button class='pill${p.active ? ' active' : ''}'>${p.label}<span class='count'>${p.count}</span></button>`;
}

function renderLabCard(c: LabCard, n: number, assets: string): string {
  return `<div class='lab' data-reveal>
    <div class='lab-img'><span class='badge'>${c.badge}</span><img src='${assets}lab-${n}.png' alt='' /></div>
    <div class='num-row'><span>${c.num}</span><span>${c.year}</span></div>
    <h4>${c.title}</h4>
    <p>${c.body}</p>
    <a class='arrow-mark' href='${c.href}'${ext(c.href)} aria-label='Open ${c.title}'>${ARROW_OUT}</a>
  </div>`;
}

function renderLabs(i: EditorialCollageInputs): string {
  const pills = i.labs.pills.map(renderLabPill).join('\n          ');
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  const cards = i.labs.cards
    .map((c, idx) => renderLabCard(c, idx + 1, assets))
    .join('\n        ');
  const progress = Array.from({ length: i.labs.progress.total }, (_, k) =>
    k < i.labs.progress.filled ? `<span class='on'></span>` : `<span></span>`,
  ).join('');
  return `
<section class='labs' id='labs' data-od-id='labs'>
  <div class='container'>
    ${renderSecRule(i.rules.labs).trim()}
    <div class='labs-head'>
      <div data-reveal>
        <span class='label'>${i.labs.label} <span class='ix'>${i.labs.ix}</span></span>
        <h2 class='display' style='margin-top:30px;'>${mixed(i.labs.headline)}</h2>
      </div>
      <div class='pills' data-reveal='right'>
          ${pills}
      </div>
    </div>
    <div class='labs-meta'>
      <span class='ring'>${i.labs.meta.ring}</span>
      <div class='meta-text'>
        <b>${i.labs.meta.bold}</b>
        ${i.labs.meta.sub}
      </div>
    </div>
    <div class='labs-grid'>
        ${cards}
    </div>
    <div class='labs-foot'>
      <div class='progress'>
        ${progress}
      </div>
      <span class='meta'>${i.labs.foot}</span>
    </div>
  </div>
</section>`;
}

function renderMethodStep(s: MethodStep, last: boolean, n: number, assets: string): string {
  return `<div class='method-step' data-reveal>
    <div class='num'>${s.num}</div>
    <h4>${s.title}${last ? '' : ` <span class='arrow-r'>→</span>`}</h4>
    <p>${s.body}</p>
    <div class='img'><img src='${assets}method-${n}.png' alt='' /></div>
  </div>`;
}

function renderMethod(i: EditorialCollageInputs): string {
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  const steps = i.method.steps
    .map((s, idx, arr) => renderMethodStep(s, idx === arr.length - 1, idx + 1, assets))
    .join('\n        ');
  return `
<section class='method' data-od-id='method'>
  <div class='container'>
    ${renderSecRule(i.rules.method).trim()}
    <div class='method-head'>
      <div data-reveal>
        <span class='label'>${i.method.label} <span class='ix'>${i.method.ix}</span></span>
        <h2 class='display' style='margin-top:30px;'>${mixed(i.method.headline)}</h2>
      </div>
      <div class='right' data-reveal='right'>
        <span class='plus'>+</span>
        <p>${i.method.right}</p>
      </div>
    </div>
    <div class='method-grid'>
        ${steps}
    </div>
    <div class='method-foot'>
      <div class='left'>
        <span class='ring'></span>
        <span>${i.method.foot_left}</span>
      </div>
      <div class='right'><a class='method-repo-link' href='https://${i.method.foot_right_bold}'${ext('https://x')}><b>${i.method.foot_right_bold}</b></a> &nbsp;·&nbsp; ${i.method.foot_right_rest}</div>
    </div>
  </div>
</section>`;
}

function renderWorkCard(c: WorkCard, idx: number, assets: string, href: string): string {
  return `<a class='work-card${idx === 1 ? ' alt' : ''}' data-reveal href='${href}'${ext(href)}>
    <div class='label-row'>
      <span class='small-label'>${c.small_label}</span>
      <span class='index'>${c.index}</span>
    </div>
    <h3>${c.title}</h3>
    <p>${c.body}</p>
    <div class='img'><img src='${assets}work-${idx + 1}.png' alt='' /></div>
    <div class='meta-row'>
      <span class='year'>${c.year}</span>
      <span>${c.tag}</span>
    </div>
  </a>`;
}

function renderWork(i: EditorialCollageInputs): string {
  const r = i.rules.work;
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  // Use the first nav link as the work-card href fallback (we don't model per-card hrefs in WorkCard).
  const fallbackHref = i.nav.find((l) => /skills/i.test(l.label))?.href ?? '#';
  const cards = i.work.cards
    .map((c, idx) => renderWorkCard(c, idx, assets, fallbackHref))
    .join('\n      ');
  return `
<section class='tight' data-od-id='work'>
  <div class='work'>
    <div class='work-rule'>
      <span class='roman'>${r.roman}</span>
      <span style='display:inline-flex;gap:24px;'>
        <span>${r.meta[0]}</span>
        <span style='color:var(--coral);'>${r.meta[1]}</span>
        <span>${r.meta[2]}</span>
      </span>
      <span>${r.pagination}</span>
    </div>
    <div class='work-grid'>
      <div class='work-copy' data-reveal>
        <span class='label'>${i.work.label}</span>
        <h2>${mixed(i.work.headline)}</h2>
        <a class='work-link' href='${i.work.link_href}'${ext(i.work.link_href)}>${i.work.link_label}</a>
      </div>
      ${cards}
    </div>
    <div class='work-arrows'>
      <button class='nav-btn'><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6'><path d='M14 6l-6 6 6 6'/></svg></button>
      <button class='nav-btn active'><svg width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='currentColor' stroke-width='1.6'><path d='M10 6l6 6-6 6'/></svg></button>
    </div>
  </div>
</section>`;
}

function renderPartner(p: Partner, href: string): string {
  return `<a class='partner' data-reveal href='${href}'${ext(href)}>
    <div class='glyph'>
      <svg viewBox='0 0 80 30' fill='none' stroke='currentColor' stroke-width='2'>
        ${p.glyph_svg}
      </svg>
    </div>
    <span>${p.name}</span>
    <small>${p.role}</small>
  </a>`;
}

function renderTestimonial(i: EditorialCollageInputs): string {
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  // Each Partner can carry its own href. We fall back to the testimonial
  // read-more URL (then '#') so older brand inputs without per-partner
  // links still render valid anchors.
  const fallback = i.testimonial.read_more_href ?? '#';
  const partners = i.testimonial.partners
    .map((p) => renderPartner(p, p.href ?? fallback))
    .join('\n        ');
  return `
<section class='testimonial' data-od-id='testimonial'>
  <div class='container'>
    ${renderSecRule(i.rules.testimonial).trim()}
    <div class='testimonial-grid'>
      <div class='testimonial-copy' data-reveal>
        <span class='label'>${i.testimonial.label} <span class='ix'>${i.testimonial.ix}</span></span>
        <h2 style='margin-top:30px;'>&ldquo;${mixed(i.testimonial.quote)}&rdquo;</h2>
        <div class='author'>
          <span class='avatar'>${i.testimonial.author.initial}</span>
          <p>${i.testimonial.author.name}<br/><span>${i.testimonial.author.title}</span></p>
        </div>
        <div class='divider'></div>
        <p class='partners-text'>${i.testimonial.partners_text}</p>
        <div class='partners'>
        ${partners}
        </div>
        <a class='read-more' href='${i.testimonial.read_more_href}'${ext(i.testimonial.read_more_href)}>${i.testimonial.read_more_label}</a>
      </div>
      <div class='testimonial-art' data-reveal='right'>
        <img src='${assets}testimonial.png' alt='' />
      </div>
    </div>
  </div>
</section>`;
}

function renderCTA(i: EditorialCollageInputs): string {
  const assets = i.imagery.assets_path.replace(/\/?$/, '/');
  return `
<section class='cta' id='contact' data-od-id='cta'>
  <div class='container'>
    ${renderSecRule(i.rules.cta).trim()}
    <div class='cta-grid'>
      <div data-reveal>
        <span class='label'>${i.cta.label} <span class='ix'>${i.cta.ix}</span></span>
        <h2 class='display'>${mixed(i.cta.headline)}</h2>
        <p class='lead'>${i.cta.lead}</p>
        <div class='cta-actions'>
          <a class='btn btn-primary' href='${i.cta.primary.href}'${ext(i.cta.primary.href)}>
            ${i.cta.primary.label}
            <span class='arrow'>${ARROW_OUT}</span>
          </a>
          <a class='email-pill' href='${i.brand.contact_email}'${ext(i.brand.contact_email)}>
            ${/^mailto:/.test(i.brand.contact_email) ? i.brand.contact_email.replace(/^mailto:/, '') : 'Open an issue'}
            <span class='arrow-circle'>→</span>
          </a>
        </div>
        <div class='cta-foot'>
          <span class='stamp'>● Live</span>
          <span>${i.brand.version} / ${i.brand.license}</span>
          <span style='margin-left:auto;'>${i.brand.coordinates}</span>
        </div>
      </div>
      <div class='cta-art' data-reveal='right'>
        <img src='${assets}cta.png' alt='' />
        <div class='index'>Nº 08</div>
        <div class='ribbon'>${i.cta.ribbon}</div>
      </div>
    </div>
  </div>
</section>`;
}

function renderFooterColumn(c: FooterColumn): string {
  const links = c.links
    .map((l) => `<li><a href='${l.href}'${ext(l.href)}>${l.label}</a></li>`)
    .join('\n        ');
  return `<div class='foot-col'>
    <h5>${c.title}</h5>
    <ul>
        ${links}
    </ul>
  </div>`;
}

function renderFooter(i: EditorialCollageInputs): string {
  const cols = i.footer.columns.map(renderFooterColumn).join('\n      ');
  // Resolve the footer brand CTA — explicit `footer.brand_cta` wins,
  // otherwise inherit `brand.download_url` so a single field lights up
  // both the nav and the footer download entry.
  const brandCta =
    i.footer.brand_cta ??
    (i.brand.download_url
      ? {
          label: i.brand.download_url_label ?? 'Download desktop',
          href: i.brand.download_url,
          meta: i.brand.version,
        }
      : null);
  const brandCtaHtml = brandCta
    ? `
        <a class='foot-cta' href='${brandCta.href}'${ext(brandCta.href)}>${brandCta.label}${
          brandCta.meta ? `<span class='meta'>${brandCta.meta}</span>` : ''
        }</a>`
    : '';
  return `
<footer data-od-id='footer'>
  <div class='container'>
    <div class='foot-grid'>
      <div class='foot-brand'>
        <a href='#top' class='brand'>
          <span class='brand-mark'>${i.brand.mark}</span>
          <span>${i.brand.name}</span>
        </a>
        <p style='margin-top:18px;'>${i.footer.brand_description}</p>${brandCtaHtml}
      </div>
      ${cols}
    </div>
    <div class='foot-bottom'>
      <span><span class='pulse'></span>● <b style='color:var(--ink);'>${i.brand.name}</b> · ${i.brand.license} · ${i.brand.year} / ${i.brand.edition}</span>
      <span class='right'>
        <span>${i.brand.location}</span>
        <span>${i.brand.coordinates}</span>
        <span style='color:var(--coral);'>♥ ${i.brand.year_roman}</span>
      </span>
    </div>
    <div class='foot-mega'>
      <div class='word' data-reveal='rise-lg'>${mixed(i.footer.mega)}</div>
    </div>
  </div>
</footer>`;
}

function renderWire(i: EditorialCollageInputs): string {
  const w = i.wire;
  if (!w || (w.cities.length === 0 && w.contributors.length === 0)) return '';
  // Duplicate each list so the marquee CSS animation translates -50%
  // and lands seamlessly at the start of the second copy.
  const cityRow = [...w.cities, ...w.cities]
    .map(
      (c) =>
        `<span class='wire-item'><span class='wire-dot'>·</span><span class='wire-coord'>${c.coord}</span><span class='wire-name'>${c.name}</span></span>`,
    )
    .join('\n          ');
  const contribRow = [...w.contributors, ...w.contributors]
    .map(
      (c) =>
        `<a class='wire-item is-link' href='${c.href}'${ext(c.href)} aria-label='Open ${c.handle} on GitHub'><span class='wire-dot'>·</span><span class='wire-handle'>@${c.handle}</span><span class='wire-role'>${c.role}</span></a>`,
    )
    .join('\n          ');
  const subtitle =
    w.subtitle ??
    `Open · ${w.cities.length} cities · ${Math.max(w.contributors.length - 1, 0)} contributors`;
  return `
<section class='wire' data-od-id='wire' aria-label='Global wire — cities and contributors'>
  <div class='container wire-inner'>
    <div class='wire-left'>
      <span class='wire-mark' aria-hidden='true'><span class='wire-pulse'></span></span>
      <span class='wire-title'>
        <b>${w.title}</b>
        <span>${subtitle}</span>
      </span>
    </div>
    <div class='wire-rows'>
      <div class='wire-row'>
        <div class='marquee-track' aria-hidden='true'>
          ${cityRow}
        </div>
      </div>
      <div class='wire-row reverse'>
        <div class='marquee-track'>
          ${contribRow}
        </div>
      </div>
    </div>
  </div>
</section>`;
}

/* ------------------------------------------------------------------ *
 * inline scripts (mirror apps/landing-page/app/_components/*)
 * ------------------------------------------------------------------ */

const REVEAL_AND_NAV_SCRIPT = `
<script>
  /*
   * Scroll-reveal observer — mirrors apps/landing-page/app/_components/reveal-root.tsx.
   * Watches every [data-reveal] element and flips data-revealed='true'
   * when it first enters the viewport, triggering the CSS transition.
   */
  (function () {
    var elements = document.querySelectorAll('[data-reveal]:not([data-revealed])');
    if (!elements.length) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      for (var i = 0; i < elements.length; i++) elements[i].dataset.revealed = 'true';
      return;
    }
    var observer = new IntersectionObserver(function (entries) {
      for (var i = 0; i < entries.length; i++) {
        if (!entries[i].isIntersecting) continue;
        entries[i].target.dataset.revealed = 'true';
        observer.unobserve(entries[i].target);
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -8% 0px' });
    for (var j = 0; j < elements.length; j++) observer.observe(elements[j]);
  })();

  /*
   * Headroom-style sticky header — mirrors apps/landing-page/app/_components/header.tsx.
   * Hides the nav on downward scroll, re-pins it on upward scroll, and
   * always keeps it visible near the top of the page.
   */
  (function () {
    var nav = document.querySelector('header.nav');
    if (!nav) return;
    var SHOW_TOP = 100;
    var DELTA = 6;
    var lastY = window.scrollY || 0;
    function onScroll() {
      var y = window.scrollY || 0;
      var d = y - lastY;
      if (y <= SHOW_TOP) {
        nav.classList.remove('is-hidden');
      } else if (d > DELTA) {
        nav.classList.add('is-hidden');
      } else if (d < -DELTA) {
        nav.classList.remove('is-hidden');
      }
      lastY = y;
    }
    window.addEventListener('scroll', onScroll, { passive: true });
  })();
</script>`;

const STAR_SCRIPT_TEMPLATE = (repo: string) => `
<script>
  /*
   * GitHub star count — pulls live count and replaces the placeholder
   * text in the nav CTA. Failures fall back silently.
   */
  (function () {
    var cta = document.querySelector('a.nav-cta:not(.ghost)');
    if (!cta) return;
    function format(n) {
      if (!isFinite(n) || n <= 0) return '0';
      if (n < 1000) return String(n);
      var k = (n / 1000).toFixed(1).replace(/\\.0$/, '');
      return k + 'K';
    }
    fetch('https://api.github.com/repos/${repo}', {
      headers: { Accept: 'application/vnd.github+json' }
    })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        if (!data || typeof data.stargazers_count !== 'number') return;
        cta.textContent = 'Star · ' + format(data.stargazers_count);
        cta.setAttribute('aria-label', 'Star on GitHub — ' + format(data.stargazers_count) + ' stars');
      })
      .catch(function () { /* leave placeholder on failure */ });
  })();
</script>`;

/* ------------------------------------------------------------------ *
 * top-level
 * ------------------------------------------------------------------ */

function repoFromUrl(url: string): string | null {
  const m = url.match(/github\.com\/([^/]+)\/([^/?#]+)/i);
  return m ? `${m[1]}/${m[2]}` : null;
}

export function renderPage(inputs: EditorialCollageInputs, css: string): string {
  const repo = repoFromUrl(inputs.brand.primary_url);
  const starScript = repo ? STAR_SCRIPT_TEMPLATE(repo) : '';
  return [
    `<!DOCTYPE html>`,
    `<html lang='${inputs.brand.locale ?? 'en'}'>`,
    renderHead(inputs, css),
    `<body>`,
    renderRails(inputs),
    `<div class='shell'>`,
    renderTopbar(inputs),
    renderNav(inputs),
    renderHero(inputs),
    renderWire(inputs),
    renderAbout(inputs),
    renderCapabilities(inputs),
    renderLabs(inputs),
    renderMethod(inputs),
    renderWork(inputs),
    renderTestimonial(inputs),
    renderCTA(inputs),
    renderFooter(inputs),
    `</div>`,
    REVEAL_AND_NAV_SCRIPT,
    starScript,
    `</body>`,
    `</html>`,
    ``,
  ].join('\n');
}

async function main(): Promise<void> {
  const [, , inputsArg, outputArg] = process.argv;
  if (!inputsArg || !outputArg) {
    console.error('Usage: npx tsx scripts/compose.ts <inputs.json> <output.html>');
    process.exit(1);
  }

  const inputsPath = isAbsolute(inputsArg) ? inputsArg : resolve(process.cwd(), inputsArg);
  const outputPath = isAbsolute(outputArg) ? outputArg : resolve(process.cwd(), outputArg);
  const stylesPath = resolve(SKILL_ROOT, 'styles.css');

  const [inputsRaw, css] = await Promise.all([
    readFile(inputsPath, 'utf8'),
    readFile(stylesPath, 'utf8'),
  ]);
  const inputs = JSON.parse(inputsRaw) as EditorialCollageInputs;
  const html = renderPage(inputs, css);

  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, html, 'utf8');
  console.log(`✓ wrote ${outputPath} (${(html.length / 1024).toFixed(1)} KB)`);
}

const isMain = import.meta.url === `file://${process.argv[1]}`;
if (isMain) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
