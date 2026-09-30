#!/usr/bin/env -S npx -y tsx
/**
 * design-studio-web — standalone HTML composer.
 *
 * Usage:
 *   npx tsx scripts/compose.ts inputs.json out/index.html
 *
 * With Node 24 this file can also be run without tsx:
 *   node --experimental-strip-types scripts/compose.ts inputs.example.json example.html
 */
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import type { DesignStudioWebInputs, MixedText, Project, UiStrings } from '../schema.ts';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');

/**
 * Template-owned interface chrome. Anything the studio does not author
 * itself lives here so a non-Latin brief can translate the whole
 * artifact instead of leaving English fragments beside Chinese copy.
 */
const DEFAULT_UI = {
  loading: 'Loading type, image field and motion system.',
  menu: 'MENU',
  close: 'CLOSE',
  audio: 'SND',
  lab_title: 'Material\nbehaviour',
  lab_body: 'Use the controls as a small sample of how the studio treats motion and computation as design material—not decoration.',
  lab_hint: 'Pointer → local field / Scroll → velocity input',
  lab_readout: 'LIVE GLSL / FBM DOMAIN FIELD',
  lab_sliders: { noise: 'Noise freq.', flow: 'Flow speed', distortion: 'Distortion', chromatic: 'Chromatic' },
  lab_presets: { default: 'Default', subtle: 'Subtle', warp: 'Warp', hyper: 'Hyper' },
  cursor: { view: 'VIEW', top: 'TOP', open: 'OPEN', mail: 'MAIL' },
  nav_aria: 'Primary',
  alt_project: 'project art',
  alt_studio: 'Studio atmosphere',
};

function resolveUi(i: DesignStudioWebInputs): typeof DEFAULT_UI {
  const u: UiStrings = i.ui ?? {};
  return {
    ...DEFAULT_UI,
    ...u,
    lab_sliders: { ...DEFAULT_UI.lab_sliders, ...(u.lab_sliders ?? {}) },
    lab_presets: { ...DEFAULT_UI.lab_presets, ...(u.lab_presets ?? {}) },
    cursor: { ...DEFAULT_UI.cursor, ...(u.cursor ?? {}) },
  };
}
function br(value: string): string { return esc(value).replace(/\n/g, '<br/>'); }

function esc(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}
function attr(value: string): string { return esc(value); }
function ext(href: string): string {
  return /^(https?:|mailto:|\/\/)/i.test(href) ? ` target='_blank' rel='noreferrer noopener'` : '';
}
function mixed(value: MixedText): string {
  return value.map((seg) => {
    const cls = seg.accent ? ` class='accent'` : '';
    if (seg.em) return `<em${cls}>${esc(seg.text)}</em>`;
    return seg.accent ? `<span class='accent'>${esc(seg.text)}</span>` : esc(seg.text);
  }).join('');
}
function mixedChars(value: MixedText): string {
  let i = 0;
  return value.map((seg) => {
    const classes = [seg.accent ? 'accent' : '', seg.em ? 'em-wrap' : ''].filter(Boolean).join(' ');
    const chars = seg.text.split(/([\p{Script=Latin}\p{Number}'’/-]+)/u).map(part => {
      const letters = [...part].map(ch => ch === ' ' ? ' ' : `<span class='char' style='--i:${i++}'>${esc(ch)}</span>`).join('');
      return /^[\p{Script=Latin}\p{Number}]/u.test(part) ? `<span class='word'>${letters}</span>` : letters;
    }).join('');
    if (seg.em) return `<em${classes ? ` class='${classes}'` : ''}>${chars}</em>`;
    if (seg.accent) return `<span class='accent'>${chars}</span>`;
    return chars;
  }).join('');
}
function assetBase(i: DesignStudioWebInputs): string {
  return i.imagery.assets_path.replace(/\/?$/, '/');
}
function assetUrl(i: DesignStudioWebInputs, slot: string): string {
  const ext = i.imagery.strategy === 'placeholder' ? '.svg' : '.png';
  return assetBase(i) + slot + ext;
}
function projectCard(p: Project, base: string, extName: string, ui: typeof DEFAULT_UI): string {
  return `<a class='project-card' href='${attr(p.href)}'${ext(p.href)} data-cursor='${attr(ui.cursor.view)}' data-tilt data-project='${attr(p.index)}'>
    <div class='project-media'><img src='${attr(base + p.image_slot + extName)}' alt='${attr(p.title + ' ' + ui.alt_project)}' loading='lazy' /></div>
    <div class='project-top'>
      <span>${esc(p.client)} · ${esc(p.category)}</span>
      <span class='project-index'>${esc(p.index)}</span>
    </div>
    <div class='project-copy'>
      <div>
        <h3 class='project-title'>${esc(p.title)}</h3>
        <div class='work-meta'>${esc(p.year)} · ${esc(p.category)}</div>
      </div>
      <div class='project-side'>
        <p>${esc(p.description)}</p>
        <div class='tags'>${p.services.map(s => `<span class='tag'>${esc(s)}</span>`).join('')}</div>
        <span class='metric'>${esc(p.metric)}</span>
      </div>
    </div>
  </a>`;
}

function head(i: DesignStudioWebInputs, css: string): string {
  return `<head>
<meta charset='utf-8' />
<meta name='viewport' content='width=device-width, initial-scale=1, viewport-fit=cover' />
<meta name='theme-color' content='#0a0a0b' />
<title>${esc(i.brand.name)} — ${esc(i.brand.tagline)}</title>
<meta name='description' content='${attr(i.brand.description)}' />
<meta property='og:title' content='${attr(i.brand.name + ' — ' + i.brand.tagline)}' />
<meta property='og:description' content='${attr(i.brand.description)}' />
<style>${css}</style>
</head>`;
}

function renderNav(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  return `<div class='topline' aria-hidden='true'></div>
<header class='nav' data-od-id='nav'>
  <div class='container nav-inner'>
    <a class='brand' href='#top' data-cursor='${attr(ui.cursor.top)}'><span class='brand-mark'>${esc(i.brand.mark)}</span><span>${esc(i.brand.name)}</span></a>
    <nav aria-label='${attr(ui.nav_aria)}'><ul class='nav-links' id='primary-navigation'>${i.nav.map(n => `<li><a href='${attr(n.href)}'>${esc(n.label)}</a></li>`).join('')}</ul></nav>
    <div class='nav-side'>
      <span class='nav-status'><i class='status-dot'></i>${esc(i.brand.status)}</span>
      ${i.motion.audio ? `<button class='audio-toggle' type='button' aria-label='${attr(ui.audio)}' aria-pressed='false'>${esc(ui.audio)}</button>` : ''}
      <button class='menu-toggle' type='button' aria-expanded='false' aria-controls='primary-navigation'>${esc(ui.menu)}</button>
    </div>
  </div>
</header>`;
}

function renderLoader(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  if (!i.motion.loader) return '';
  return `<div class='loader' aria-hidden='true'>
    <div class='loader-inner'>
      <div class='loader-mark'>${esc(i.brand.mark)}</div>
      <div class='loader-line'><span></span></div>
      <div class='loader-row'>
        <div class='loader-copy'>${esc(ui.loading)}<br/>${esc(i.brand.edition)}</div>
        <div class='loader-percent'>00</div>
      </div>
    </div>
  </div>`;
}

function renderHero(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  return `<section class='hero' id='top' data-act='1' data-od-id='hero'>
    <canvas class='hero-canvas' aria-hidden='true'></canvas>
    <div class='hero-fallback' aria-hidden='true'></div>
    <div class='hero-grid-overlay' aria-hidden='true'></div>
    <div class='container hero-content'>
      <div class='hero-eyebrow'>
        <span>${esc(i.hero.eyebrow)}</span>
        <span>${esc(i.brand.coordinates)}</span>
      </div>
      <div class='hero-main'>
        <div class='hero-copy'>
          <h1 class='hero-title'>${mixedChars(i.hero.headline)}</h1>
        </div>
        <aside class='hero-side'>
          <p class='lead' data-reveal>${esc(i.hero.lead)}</p>
          <div class='hero-actions' data-reveal>
            <a class='btn primary magnetic' href='${attr(i.hero.primary.href)}' data-cursor='${attr(ui.cursor.open)}'>${esc(i.hero.primary.label)} <span class='arrow'>↘</span></a>
            <a class='btn magnetic' href='${attr(i.hero.secondary.href)}'${ext(i.hero.secondary.href)} data-cursor='${attr(ui.cursor.mail)}'>${esc(i.hero.secondary.label)} <span class='arrow'>↗</span></a>
          </div>
        </aside>
      </div>
      <div class='hero-foot'>
        <div class='hero-stats'>${i.hero.stats.map(s => `<div class='hero-stat'><strong>${esc(s.value)}</strong><span>${esc(s.label)}</span></div>`).join('')}</div>
        <div class='hero-scroll'><i></i>${esc(i.hero.scroll_label)}</div>
        <div class='hero-art-label'>${esc(i.hero.art_label)}<br/>${esc(i.brand.location)}</div>
      </div>
    </div>
  </section>`;
}

function renderManifesto(i: DesignStudioWebInputs): string {
  return `<section class='section manifesto' id='manifesto' data-act='2' data-od-id='manifesto'>
    <div class='container'>
      <div class='section-head'>
        <span class='kicker' data-reveal>${esc(i.manifesto.kicker)}</span>
        <h2 class='display small' data-reveal>${mixed(i.manifesto.headline)}</h2>
        <span class='section-index'>02—08</span>
      </div>
      <div class='manifesto-grid'>
        <div></div>
        <div class='manifesto-copy'>${i.manifesto.paragraphs.map(p => `<p data-reveal>${esc(p)}</p>`).join('')}</div>
      </div>
      <div class='principles'>${i.manifesto.principles.map(p => `<article class='principle' data-reveal><span class='n'>${esc(p.index)}</span><h3>${esc(p.title)}</h3><p>${esc(p.body)}</p></article>`).join('')}</div>
    </div>
  </section>`;
}

function renderWork(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  const base = assetBase(i);
  const extName = i.imagery.strategy === 'placeholder' ? '.svg' : '.png';
  return `<section class='section work-section' id='work' data-act='3' data-od-id='work'>
    <div class='container'>
      <div class='section-head'>
        <span class='kicker' data-reveal>${esc(i.work.kicker)}</span>
        <h2 class='display small' data-reveal>${mixed(i.work.headline)}</h2>
        <span class='section-index'>03—08</span>
      </div>
      <div class='work-intro'><div></div><p class='lead' data-reveal>${esc(i.work.lead)}</p></div>
    </div>
    <div class='work-scroll-space'>
      <div class='work-sticky'>
        <div class='work-track'>${i.work.projects.map(p => projectCard(p, base, extName, ui)).join('\n')}</div>
      </div>
    </div>
    <div class='container work-footer'>
      <a class='text-link' href='${attr(i.work.archive_href)}' data-cursor='${attr(ui.cursor.view)}'>${esc(i.work.archive_label)}</a>
      <span class='work-counter'>01 / ${String(i.work.projects.length).padStart(2,'0')}</span>
    </div>
  </section>`;
}

function renderCapabilities(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  return `<section class='section' id='capabilities' data-act='4' data-od-id='capabilities'>
    <div class='container'>
      <div class='section-head'>
        <span class='kicker' data-reveal>${esc(i.capabilities.kicker)}</span>
        <h2 class='display small' data-reveal>${mixed(i.capabilities.headline)}</h2>
        <span class='section-index'>04—08</span>
      </div>
      <p class='lead' data-reveal style='margin:0 0 72px auto'>${esc(i.capabilities.lead)}</p>
      <div class='cap-grid'>${i.capabilities.items.map(c => `<article class='cap-row' data-reveal><span class='index'>${esc(c.index)}</span><h3>${esc(c.title)}</h3><p>${esc(c.body)}</p><div class='cap-services'>${c.services.map(s => `<span>${esc(s)}</span>`).join('')}</div></article>`).join('')}</div>
      <div class='lab' data-reveal='scale'>
        <div class='lab-stage'>
          <canvas class='lab-canvas' aria-hidden='true'></canvas>
          <span class='lab-stage-label'>${esc(i.capabilities.lab_label)}</span>
          <span class='lab-readout'>${esc(ui.lab_readout)}</span>
        </div>
        <div class='lab-panel'>
          <div>
            <h3>${br(ui.lab_title)}</h3>
            <p>${esc(ui.lab_body)}</p>
            <div class='slider-stack'>
              <div class='slider-row'><label for='noiseFreq'>${esc(ui.lab_sliders.noise)}</label><input id='noiseFreq' data-uniform='uNoiseFreq' type='range' min='.5' max='6' step='.05' value='1.8'/><span class='slider-value'>1.80</span></div>
              <div class='slider-row'><label for='flowSpeed'>${esc(ui.lab_sliders.flow)}</label><input id='flowSpeed' data-uniform='uFlowSpeed' type='range' min='.05' max='1.5' step='.01' value='.35'/><span class='slider-value'>0.35</span></div>
              <div class='slider-row'><label for='distortion'>${esc(ui.lab_sliders.distortion)}</label><input id='distortion' data-uniform='uDistortion' type='range' min='.2' max='5' step='.05' value='1.25'/><span class='slider-value'>1.25</span></div>
              <div class='slider-row'><label for='chromatic'>${esc(ui.lab_sliders.chromatic)}</label><input id='chromatic' data-uniform='uChromatic' type='range' min='0' max='.8' step='.01' value='.12'/><span class='slider-value'>0.12</span></div>
            </div>
            <div class='presets'>
              <button class='preset active' data-preset='default'>${esc(ui.lab_presets.default)}</button>
              <button class='preset' data-preset='subtle'>${esc(ui.lab_presets.subtle)}</button>
              <button class='preset' data-preset='warp'>${esc(ui.lab_presets.warp)}</button>
              <button class='preset' data-preset='hyper'>${esc(ui.lab_presets.hyper)}</button>
            </div>
          </div>
          <span class='kicker'>${esc(ui.lab_hint)}</span>
        </div>
      </div>
    </div>
  </section>`;
}

function renderMethod(i: DesignStudioWebInputs): string {
  return `<section class='section' id='method' data-act='5' data-od-id='method'>
    <div class='container method-layout'>
      <div class='method-intro'>
        <span class='kicker' data-reveal>${esc(i.method.kicker)}</span>
        <h2 class='display small' data-reveal style='margin-top:28px'>${mixed(i.method.headline)}</h2>
        <p class='lead' data-reveal>${esc(i.method.lead)}</p>
      </div>
      <div class='method-steps'>${i.method.steps.map(s => `<article class='method-step' data-reveal><span class='n'>${esc(s.index)}</span><h3>${esc(s.title)}</h3><div class='method-step-copy'><p>${esc(s.body)}</p><small>${esc(s.note)}</small></div></article>`).join('')}</div>
    </div>
  </section>`;
}

function renderStudio(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  const base = assetBase(i);
  return `<section class='section' id='studio' data-act='6' data-od-id='studio'>
    <div class='container'>
      <div class='section-head'>
        <span class='kicker' data-reveal>${esc(i.studio.kicker)}</span>
        <span></span>
        <span class='section-index'>06—08</span>
      </div>
      <div class='studio-layout'>
        <div class='studio-media' data-reveal='scale'><img src='${attr(assetUrl(i, i.studio.image_slot))}' alt='${attr(ui.alt_studio)}' loading='lazy'/><span class='studio-coord'>${esc(i.brand.coordinates)} · ${esc(i.brand.location)}</span></div>
        <div class='studio-copy'>
          <h2 class='display small' data-reveal>${mixed(i.studio.headline)}</h2>
          <p data-reveal>${esc(i.studio.body)}</p>
          <div class='disciplines' data-reveal>${i.studio.disciplines.map(d => `<span class='discipline'>${esc(d)}</span>`).join('')}</div>
          <div class='studio-stats'>${i.studio.stats.map(s => `<div class='studio-stat'><strong>${esc(s.value)}</strong><small>${esc(s.label)}</small></div>`).join('')}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function renderProof(i: DesignStudioWebInputs): string {
  return `<section class='section' id='recognition' data-act='7' data-od-id='proof'>
    <div class='container'>
      <div class='section-head'>
        <span class='kicker' data-reveal>${esc(i.proof.kicker)}</span>
        <span></span>
        <span class='section-index'>07—08</span>
      </div>
      <div class='proof-grid'>
        <div data-reveal>
          <div class='quote-mark'>“</div>
          <blockquote class='quote'>${esc(i.proof.quote)}</blockquote>
          <div class='quote-by'><i></i><span><strong>${esc(i.proof.quote_author)}</strong><br/>${esc(i.proof.quote_role)}</span></div>
        </div>
        <div class='proof-side'>
          <div class='client-cloud' data-reveal>${i.proof.clients.map(c => `<div class='client'>${esc(c)}</div>`).join('')}</div>
          <div class='awards'>${i.proof.awards.map(a => `<article class='proof-award' data-reveal><span class='year'>${esc(a.year)}</span><div><strong>${esc(a.title)}</strong><p>${esc(a.body)}</p></div></article>`).join('')}</div>
        </div>
      </div>
    </div>
  </section>`;
}

function renderContact(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  return `<section class='section contact' id='contact' data-act='8' data-od-id='contact'>
    <div class='container contact-inner'>
      <span class='kicker' data-reveal>${esc(i.contact.kicker)}</span>
      <h2 class='display' data-reveal style='margin-top:30px'>${mixed(i.contact.headline)}</h2>
      <div class='contact-bottom'>
        <div>
          <p class='lead' data-reveal>${esc(i.contact.lead)}</p>
          <a class='email-link magnetic' href='mailto:${attr(i.contact.email)}' data-cursor='${attr(ui.cursor.mail)}'><span class='orb'>↗</span><span>${esc(i.contact.email)}</span></a>
        </div>
        <div class='contact-meta' data-reveal><span>${esc(i.contact.email_label)}<br/>${esc(i.contact.availability)}</span><span>${esc(i.contact.timezone)}<br/>${esc(i.brand.location)}</span></div>
      </div>
    </div>
  </section>`;
}

function renderFooter(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  return `<footer class='footer' data-od-id='footer'>
    <div class='container'>
      <div class='footer-top'><span>${esc(i.footer.note)}</span><div class='footer-social'>${i.brand.social.map(s => `<a href='${attr(s.href)}'${ext(s.href)} data-cursor='${attr(ui.cursor.open)}'>${esc(s.label)}</a>`).join('')}</div></div>
      <div class='footer-word'>${esc(i.footer.closing_word)}</div>
      <div class='footer-meta'><span>${esc(i.brand.founded)} · ${esc(i.brand.year)}</span><span>${esc(i.brand.edition)} · ${esc(i.brand.coordinates)}</span></div>
    </div>
  </footer>`;
}

function runtime(i: DesignStudioWebInputs, ui: typeof DEFAULT_UI): string {
  const cfg = JSON.stringify({
    motion: i.motion,
    brand: { mark: i.brand.mark },
    ui: { menu: ui.menu, close: ui.close, cursorFallback: ui.cursor.view },
  }).replaceAll('<', '\\u003c');

  return `<script>
(() => {
  const CFG = ${cfg};
  const reducedQuery = matchMedia('(prefers-reduced-motion: reduce)');
  const mobileQuery = matchMedia('(max-width: 760px)');
  let reduced = reducedQuery.matches;
  const finePointer = matchMedia('(hover: hover) and (pointer: fine)');
  const canPoint = () => finePointer.matches && !mobileQuery.matches && !reduced;
  const lowPower = CFG.motion.adaptive_quality && ((navigator.hardwareConcurrency || 8) <= 4);
  const intensity = Math.max(0, Math.min(1, Number(CFG.motion.intensity ?? 1)));
  document.body.classList.add('enhanced');

  // Loader --------------------------------------------------------
  const loader = document.querySelector('.loader');
  const percent = document.querySelector('.loader-percent');
  const line = document.querySelector('.loader-line span');
  document.body.classList.toggle('is-loading', !!loader);
  const revealPage = () => {
    document.body.classList.add('ready');
    document.body.classList.remove('is-loading');
    if (loader) loader.classList.add('is-done');
    setTimeout(() => loader && loader.remove(), 1300);
  };
  if (loader && !reduced) {
    const start = performance.now();
    const duration = 1050;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      if (percent) percent.textContent = String(Math.round(eased * 100)).padStart(2, '0');
      if (line) line.style.transform = 'scaleX(' + eased + ')';
      if (t < 1) requestAnimationFrame(tick); else setTimeout(revealPage, 120);
    };
    requestAnimationFrame(tick);
  } else revealPage();

  // Reveal --------------------------------------------------------
  const revealEls = [...document.querySelectorAll('[data-reveal]')];
  if (reduced) revealEls.forEach(el => el.classList.add('is-visible'));
  else {
    const io = new IntersectionObserver((entries) => {
      entries.forEach(entry => {
        if (entry.isIntersecting) { entry.target.classList.add('is-visible'); io.unobserve(entry.target); }
      });
    }, { threshold: .12, rootMargin: '0px 0px -7% 0px' });
    revealEls.forEach(el => io.observe(el));
  }

  // Nav + progress + scroll velocity -----------------------------
  const nav = document.querySelector('.nav');
  const topline = document.querySelector('.topline');
  let lastY = scrollY;
  let lastT = performance.now();
  let rawVelocity = 0;
  let velocity = 0;
  let activeAct = 1;
  const actEls = [...document.querySelectorAll('[data-act]')];
  const onScroll = () => {
    const now = performance.now();
    const dy = scrollY - lastY;
    rawVelocity = Math.min(35, Math.abs(dy) / Math.max(1, (now - lastT)) * 16.6);
    const docH = Math.max(1, document.documentElement.scrollHeight - innerHeight);
    if (topline) topline.style.transform = 'scaleX(' + Math.min(1, scrollY / docH) + ')';
    if (nav) {
      nav.classList.toggle('scrolled', scrollY > 20);
      nav.classList.toggle('hidden', !nav.classList.contains('open') && !nav.contains(document.activeElement) && scrollY > lastY && scrollY > 160 && Math.abs(dy) > 5);
    }
    const center = innerHeight * .52;
    for (const el of actEls) {
      const r = el.getBoundingClientRect();
      if (r.top <= center && r.bottom >= center) { activeAct = Number(el.dataset.act || 1); break; }
    }
    lastY = scrollY; lastT = now;
    updateWork();
  };
  addEventListener('scroll', onScroll, { passive: true });

  // Desktop horizontal project rail ------------------------------
  const workSpace = document.querySelector('.work-scroll-space');
  const workTrack = document.querySelector('.work-track');
  const workCounter = document.querySelector('.work-counter');
  const projectCount = document.querySelectorAll('.project-card').length;
  function updateWork() {
    if (!workSpace || !workTrack) return;
    if (mobileQuery.matches || reduced) { workTrack.style.transform = ''; return; }
    const r = workSpace.getBoundingClientRect();
    const travel = Math.max(1, r.height - innerHeight);
    const p = Math.max(0, Math.min(1, -r.top / travel));
    const maxShift = Math.max(0, workTrack.scrollWidth - innerWidth + innerWidth * .10);
    workTrack.style.transform = 'translate3d(' + (-p * maxShift) + 'px,0,0)';
    if (workCounter && projectCount) {
      const idx = Math.min(projectCount, Math.max(1, Math.floor(p * projectCount) + 1));
      workCounter.textContent = String(idx).padStart(2,'0') + ' / ' + String(projectCount).padStart(2,'0');
    }
  }
  addEventListener('resize', updateWork, { passive: true });
  reducedQuery.addEventListener('change', e => {
    reduced = e.matches;
    if (reduced) { revealPage(); revealEls.forEach(el => el.classList.add('is-visible')); }
    updateWork();
  });
  // Keyboard focus must bring an off-screen project into the sticky viewport.
  document.querySelectorAll('.project-card').forEach(card => card.addEventListener('focus', () => {
    if (mobileQuery.matches || reduced || !workSpace || !workTrack) return;
    const maxShift = Math.max(0, workTrack.scrollWidth - innerWidth + innerWidth * .10);
    const offset = Math.max(0, card.offsetLeft - parseFloat(getComputedStyle(workTrack).paddingLeft));
    const p = maxShift ? Math.min(1, offset / maxShift) : 0;
    scrollTo({ top: scrollY + workSpace.getBoundingClientRect().top + p * (workSpace.offsetHeight - innerHeight), behavior: 'instant' });
  }));

  // Mobile navigation ----------------------------------------------
  const menuToggle = document.querySelector('.menu-toggle');
  if (menuToggle && nav) menuToggle.addEventListener('click', () => {
    const open = nav.classList.toggle('open');
    menuToggle.setAttribute('aria-expanded', String(open));
    menuToggle.textContent = open ? CFG.ui.close : CFG.ui.menu;
  });
  document.querySelectorAll('.nav-links a').forEach(a => a.addEventListener('click', () => {
    nav?.classList.remove('open');
    if (menuToggle) { menuToggle.setAttribute('aria-expanded','false'); menuToggle.textContent = CFG.ui.menu; }
  }));

  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && nav?.classList.contains('open')) {
      menuToggle.click(); menuToggle.focus();
    }
  });
  nav?.addEventListener('focusin', () => nav.classList.remove('hidden'));

  // Cursor --------------------------------------------------------
  if (CFG.motion.custom_cursor && finePointer.matches) {
    const dot = document.createElement('div'); dot.className = 'cursor-dot';
    const ring = document.createElement('div'); ring.className = 'cursor-ring'; ring.innerHTML = '<span></span>';
    document.body.append(dot, ring);
    let mx = innerWidth/2, my = innerHeight/2, rx = mx, ry = my;
    addEventListener('pointermove', e => { mx=e.clientX; my=e.clientY; dot.style.transform='translate('+(mx-2.5)+'px,'+(my-2.5)+'px)'; }, {passive:true});
    const cursorLoop = () => { dot.hidden = ring.hidden = !canPoint(); rx += (mx-rx)*.18; ry += (my-ry)*.18; ring.style.transform='translate('+(rx-21)+'px,'+(ry-21)+'px)'; requestAnimationFrame(cursorLoop); }; cursorLoop();
    document.querySelectorAll('[data-cursor]').forEach(el => {
      el.addEventListener('pointerenter', () => { ring.classList.add('active'); ring.querySelector('span').textContent = el.dataset.cursor || CFG.ui.cursorFallback; });
      el.addEventListener('pointerleave', () => ring.classList.remove('active'));
    });
  }

  // Magnetic elements --------------------------------------------
  document.querySelectorAll('.magnetic').forEach(el => {
    el.addEventListener('pointermove', e => {
      if (!canPoint()) { el.style.transform = ''; return; }
      const r = el.getBoundingClientRect();
      const x = (e.clientX - r.left - r.width/2) * .34 * intensity;
      const y = (e.clientY - r.top - r.height/2) * .34 * intensity;
      el.style.transform = 'translate3d('+x+'px,'+y+'px,0)';
    });
    el.addEventListener('pointerleave', () => { el.style.transition='transform .7s cubic-bezier(.16,1,.3,1)'; el.style.transform='translate3d(0,0,0)'; setTimeout(()=>el.style.transition='',720); });
  });

  // Project tilt --------------------------------------------------
  document.querySelectorAll('[data-tilt]').forEach(card => {
    card.addEventListener('pointermove', e => {
      if (!canPoint()) { card.style.transform = ''; return; }
      const r = card.getBoundingClientRect();
      const px = (e.clientX-r.left)/r.width-.5, py=(e.clientY-r.top)/r.height-.5;
      card.style.transform = 'perspective(1200px) rotateX('+(-py*5*intensity)+'deg) rotateY('+(px*7*intensity)+'deg)';
    });
    card.addEventListener('pointerleave', () => { card.style.transition='transform .7s cubic-bezier(.16,1,.3,1)'; card.style.transform='none'; setTimeout(()=>card.style.transition='',720); });
  });

  // WebGL fluid field --------------------------------------------
  const VERT = 'attribute vec2 aPosition; void main(){ gl_Position=vec4(aPosition,0.0,1.0); }';
  const FRAG = \`precision highp float;
    uniform float uTime;
    uniform vec2 uResolution;
    uniform vec2 uMouse;
    uniform float uScrollVelocity;
    uniform float uAct;
    uniform float uNoiseFreq;
    uniform float uFlowSpeed;
    uniform float uDistortion;
    uniform float uChromatic;
    float hash(vec2 p){ return fract(sin(dot(p,vec2(127.1,311.7)))*43758.5453123); }
    float noise(vec2 p){ vec2 i=floor(p),f=fract(p); f=f*f*(3.0-2.0*f); return mix(mix(hash(i),hash(i+vec2(1.,0.)),f.x),mix(hash(i+vec2(0.,1.)),hash(i+vec2(1.,1.)),f.x),f.y); }
    float fbm(vec2 p){ float v=0.; float a=.5; mat2 m=mat2(1.6,1.2,-1.2,1.6); for(int i=0;i<5;i++){ v+=a*noise(p); p=m*p; a*=.5; } return v; }
    float field(vec2 p,float t){ vec2 q=vec2(fbm(p+vec2(0.,t)),fbm(p+vec2(5.2,1.3)+t*.7)); vec2 r=vec2(fbm(p+uDistortion*q+vec2(1.7,9.2)+t*.18),fbm(p+uDistortion*q+vec2(8.3,2.8)-t*.15)); return fbm(p+uDistortion*r+uScrollVelocity*.025); }
    // Two deterministic particle depths follow the same warped flow as the liquid.
    // Analytic points keep the effect available on WebGL 1 and avoid simulation buffers.
    float dust(vec2 p, float scale, float t){
      vec2 cell=p*scale;
      vec2 id=floor(cell);
      vec2 local=fract(cell)-.5;
      float seed=hash(id);
      vec2 center=.30*vec2(sin(seed*63.0+t*.31),cos(seed*41.0+t*.24));
      float d=length(local-center);
      float core=1.0-smoothstep(.018,.075,d);
      float halo=exp(-d*d*95.0)*.22;
      float sparkle=.55+.45*sin(seed*91.0+t*.65);
      return (core+halo)*step(.64,seed)*sparkle;
    }
    void main(){
      vec2 uv=(gl_FragCoord.xy-.5*uResolution.xy)/uResolution.y;
      vec2 mp=uMouse*.5*vec2(uResolution.x/uResolution.y,1.0);
      float md=length(uv-mp);
      float t=uTime*uFlowSpeed;
      vec2 p=uv*uNoiseFreq;
      p += (uv-mp)*exp(-md*md*3.5)*.16;
      float f=field(p,t*.32);
      float f2=field(p+vec2(uChromatic*.08,-uChromatic*.04),t*.32+.04);
      vec3 bg=vec3(.039,.039,.043);
      vec3 indigo=vec3(.055,.070,.160);
      vec3 blue=vec3(.302,.486,.996);
      vec3 cyan=vec3(.486,1.,.796);

      // Sculpted contour bands, with fine bright rims instead of a soft cloud.
      vec2 center=uv-vec2(.30,.04);
      float radius=length(center*vec2(.82,1.16));
      float phase=radius*(32.0+uNoiseFreq*5.0)-t*1.5+f*uDistortion*9.0;
      phase += sin(md*22.0-t*2.0)*exp(-md*3.2)*.65;
      float ridge=.5+.5*sin(phase);
      float rim=pow(ridge,24.0);
      float body=pow(ridge,4.0);
      float caustic=pow(.5+.5*sin(phase+.23+f2*.5),44.0);
      float envelope=exp(-radius*radius*.85);
      vec3 col=mix(bg,indigo,smoothstep(.22,.82,f)*.88);
      col += blue*(body*.17+rim*.52)*envelope;
      col += cyan*caustic*.24*envelope;
      col += blue*exp(-md*md*5.0)*(.045+uScrollVelocity*.002);

      vec2 flow=uv+vec2(sin(uv.y*2.5+t*.14),cos(uv.x*2.2-t*.12))*.085;
      flow += vec2(f-.5,f2-.5)*.12;
      float nearDust=dust(flow,54.0,t);
      float farDust=dust(flow+vec2(.71,-.32),91.0,-t*.65);
      col += mix(blue,cyan,.42)*(nearDust*.65+farDust*.26);
      // Fine electronic grain and dithering, matching the reference's material finish.
      col += (hash(gl_FragCoord.xy)-.5)*.024;
      col += sin(gl_FragCoord.y*3.14159)*.004;
      float vignette=1.0-smoothstep(.35,1.35,length(uv));
      col *= (.50+.50*vignette)*(1.0-clamp((uAct-1.0)/7.0,0.0,1.0)*.12);
      gl_FragColor=vec4(max(col,vec3(0.0)),1.);
    }\`;

  const fields = [];
  function createField(canvas, interactive=false) {
    if (!canvas) return null;
    const gl = canvas.getContext('webgl', { antialias:false, alpha:false, powerPreference: lowPower ? 'low-power':'high-performance' });
    if (!gl) { canvas.style.display='none'; return null; }
    const compile=(type,src)=>{ const s=gl.createShader(type); gl.shaderSource(s,src); gl.compileShader(s); if(!gl.getShaderParameter(s,gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s)); return s; };
    let program;
    try { program=gl.createProgram(); gl.attachShader(program,compile(gl.VERTEX_SHADER,VERT)); gl.attachShader(program,compile(gl.FRAGMENT_SHADER,FRAG)); gl.linkProgram(program); if(!gl.getProgramParameter(program,gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(program)); }
    catch(err){ console.warn('WebGL field fallback:',err); canvas.style.display='none'; return null; }
    gl.useProgram(program);
    const buf=gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER,buf); gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,3,-1,-1,3]),gl.STATIC_DRAW);
    const loc=gl.getAttribLocation(program,'aPosition'); gl.enableVertexAttribArray(loc); gl.vertexAttribPointer(loc,2,gl.FLOAT,false,0,0);
    const U={}; ['uTime','uResolution','uMouse','uScrollVelocity','uAct','uNoiseFreq','uFlowSpeed','uDistortion','uChromatic'].forEach(n=>U[n]=gl.getUniformLocation(program,n));
    const params={uNoiseFreq:1.8,uFlowSpeed:.35,uDistortion:1.25,uChromatic:.12};
    let mouse={x:0,y:0};
    const pointer=(e)=>{ const r=canvas.getBoundingClientRect(); mouse.x=((e.clientX-r.left)/r.width)*2-1; mouse.y=-(((e.clientY-r.top)/r.height)*2-1); };
    (interactive?canvas:window).addEventListener('pointermove',pointer,{passive:true});
    const resize=()=>{ const r=canvas.getBoundingClientRect(); const pr=(lowPower||mobileQuery.matches)?1:Math.min(devicePixelRatio||1,1.65); const w=Math.max(2,Math.floor(r.width*pr)),h=Math.max(2,Math.floor(r.height*pr)); if(canvas.width!==w||canvas.height!==h){canvas.width=w;canvas.height=h;gl.viewport(0,0,w,h);} };
    const render=(time)=>{ resize(); gl.useProgram(program); gl.uniform1f(U.uTime,reduced ? 0 : time*.001*intensity); gl.uniform2f(U.uResolution,canvas.width,canvas.height); gl.uniform2f(U.uMouse,reduced ? 0 : mouse.x*intensity,reduced ? 0 : mouse.y*intensity); gl.uniform1f(U.uScrollVelocity,reduced ? 0 : velocity*intensity); gl.uniform1f(U.uAct,activeAct); Object.entries(params).forEach(([k,v])=>gl.uniform1f(U[k],v)); gl.drawArrays(gl.TRIANGLES,0,3); };
    fields.push({ canvas, render });
    return { params, canvas };
  }

  const heroField=createField(document.querySelector('.hero-canvas'),false);
  const labField=createField(document.querySelector('.lab-canvas'),true);

  // One clock and one velocity update for all visible fields.
  const renderFields = time => {
    if (!document.hidden) {
      velocity += (rawVelocity-velocity)*.08; rawVelocity*=.88;
      fields.forEach(field => {
        const r = field.canvas.getBoundingClientRect();
        if (r.bottom > 0 && r.top < innerHeight) field.render(time);
      });
    }
    requestAnimationFrame(renderFields);
  };
  if (fields.length) requestAnimationFrame(renderFields);

  // Lab controls --------------------------------------------------
  const presetValues={
    default:{uNoiseFreq:1.8,uFlowSpeed:.35,uDistortion:1.25,uChromatic:.12},
    subtle:{uNoiseFreq:1.05,uFlowSpeed:.18,uDistortion:.62,uChromatic:.03},
    warp:{uNoiseFreq:2.35,uFlowSpeed:.48,uDistortion:2.9,uChromatic:.25},
    hyper:{uNoiseFreq:4.35,uFlowSpeed:1.1,uDistortion:4.2,uChromatic:.62}
  };
  const sliders=[...document.querySelectorAll('[data-uniform]')];
  const syncSlider=(el)=>{ const key=el.dataset.uniform; const v=Number(el.value); if(labField) labField.params[key]=v; const out=el.parentElement.querySelector('.slider-value'); if(out) out.textContent=v.toFixed(2); };
  sliders.forEach(el=>{ syncSlider(el); el.addEventListener('input',()=>syncSlider(el)); });
  document.querySelectorAll('[data-preset]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-preset]').forEach(b=>b.classList.remove('active')); btn.classList.add('active');
    const vals=presetValues[btn.dataset.preset];
    sliders.forEach(el=>{ if(vals && vals[el.dataset.uniform] != null){ el.value=String(vals[el.dataset.uniform]); syncSlider(el); } });
  }));

  // Optional generative audio ------------------------------------
  const audioBtn=document.querySelector('.audio-toggle');
  let audioCtx=null, nodes=[];
  if(audioBtn) audioBtn.addEventListener('click', async()=>{
    const enabled=audioBtn.getAttribute('aria-pressed')==='true';
    if(enabled){ nodes.forEach(n=>{try{n.stop?.();n.disconnect?.();}catch{}}); nodes=[]; audioCtx?.close(); audioCtx=null; audioBtn.setAttribute('aria-pressed','false'); return; }
    audioCtx=new (window.AudioContext||window.webkitAudioContext)();
    const gain=audioCtx.createGain(); gain.gain.value=.025; const filter=audioCtx.createBiquadFilter(); filter.type='lowpass'; filter.frequency.value=220; filter.connect(gain); gain.connect(audioCtx.destination);
    [[55,'sine'],[82.5,'triangle']].forEach(([freq,type])=>{ const o=audioCtx.createOscillator(); o.frequency.value=freq; o.type=type; o.connect(filter); o.start(); nodes.push(o); }); nodes.push(filter,gain); audioBtn.setAttribute('aria-pressed','true');
  });

  onScroll();
})();
</script>`;
}

async function main(): Promise<void> {
  const inputPath = process.argv[2];
  const outputPath = process.argv[3];
  if (!inputPath || !outputPath) throw new Error('Usage: compose.ts <inputs.json> <output.html>');
  const inputAbs = resolve(process.cwd(), inputPath);
  const outputAbs = resolve(process.cwd(), outputPath);
  const inputs = JSON.parse(await readFile(inputAbs, 'utf8')) as DesignStudioWebInputs;
  const css = await readFile(resolve(ROOT, 'styles.css'), 'utf8');
  const ui = resolveUi(inputs);

  const html = `<!doctype html>
<html lang='${attr(inputs.brand.locale ?? 'en')}'>
${head(inputs, css)}
<body>
${renderLoader(inputs, ui)}
<div class='noise' aria-hidden='true'></div>
${renderNav(inputs, ui)}
<main>
${renderHero(inputs, ui)}
${renderManifesto(inputs)}
${renderWork(inputs, ui)}
${renderCapabilities(inputs, ui)}
${renderMethod(inputs)}
${renderStudio(inputs, ui)}
${renderProof(inputs)}
${renderContact(inputs, ui)}
</main>
${renderFooter(inputs, ui)}
${runtime(inputs, ui)}
</body>
</html>`;
  await mkdir(dirname(outputAbs), { recursive: true });
  await writeFile(outputAbs, html.replace(/^[ \t]+$/gm, ''), 'utf8');
  console.log(`design-studio-web → ${outputAbs}`);
}

main().catch((error) => { console.error(error); process.exit(1); });
