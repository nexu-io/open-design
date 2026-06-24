// Open Design web clipper brand/design-system capture runtime.
//
// Injected on demand by the service worker. It does not clone the page. Instead
// it programmatically reads brand signals from the live DOM/CSSOM and fills a
// stable, reviewable design-system HTML template.

(function () {
  if (window.__odBrandCapture) return;

  const MAX_ELEMENTS = 1400;
  const MAX_IMAGES = 15;
  const MAX_LOGOS = 8;
  const MAX_RESOURCES = 120;
  const I18N = globalThis.OD_CLIPPER_I18N;
  let activeLocale = I18N?.currentLocale ? I18N.currentLocale() : 'en';

  // Built-in English copy for every label this capture renders. The extension's
  // shared i18n bundle (i18n.js) is preferred when present — it carries the
  // translations — but injection/order glitches have shipped captures with the
  // bundle missing, which used to bake raw keys ("brandPalette") straight into
  // the saved HTML. This map guarantees real words no matter what; `tr` only
  // falls back to the raw key when a string is genuinely unknown.
  const EN_FALLBACK = {
    brandFallbackTitle: 'Captured site',
    brandFallbackDescription: 'Programmatically extracted from the live web page.',
    brandPageTitleSuffix: 'Design System',
    brandFileTitle: '{title}',
    brandReady: 'Captured',
    brandLogo: 'Logo',
    brandNoLogoFound: 'No logo detected',
    brandTypography: 'Typography',
    brandPalette: 'Palette',
    brandVoiceTone: 'Voice & tone',
    brandImageryLayout: 'Imagery & layout',
    brandImages: 'Images',
    brandComponentKit: 'Component kit',
    brandComponentKitSub: 'A working UI kit colored entirely from the captured palette, type and corner radius.',
    brandSubjectsLabel: 'Subjects',
    brandRadiusLabel: 'Corner radius',
    brandLayoutPosture: 'Layout posture',
    brandImageryStyle: '{count} representative images captured from this page.',
    brandImageryStyleNone: 'No representative imagery was captured from this page.',
    brandViewAll: 'View all ({count})',
    brandAllImages: 'All images · {count}',
    brandClose: 'Close',
    brandPrevImage: 'Previous image',
    brandNextImage: 'Next image',
    brandImageLabel: 'Image {index}',
    brandKeywordFallback: 'captured',
    brandDataNote: 'A structured JSON payload is embedded at <code>#od-design-system-data</code> for downstream automation.',
    swatchBackground: 'Background',
    swatchSurface: 'Surface',
    swatchForeground: 'Foreground',
    swatchMuted: 'Muted',
    swatchBorder: 'Border',
    swatchAccent: 'Accent',
    swatchSupport: 'Secondary',
    swatchHighlight: 'Highlight',
    swatchColor: 'Color {index}',
    swatchUseBackground: 'Page background',
    swatchUseSurface: 'Cards and raised panels',
    swatchUseForeground: 'Primary text and icons',
    swatchUseMuted: 'Secondary text and captions',
    swatchUseBorder: 'Dividers and outlines',
    swatchUseAccent: 'Primary actions and emphasis',
    swatchUseSupport: 'Secondary highlights',
    swatchUseHighlight: 'Accents and details',
    layoutSquare: 'Square, sharp corners',
    layoutRounded: 'Rounded corners (~{px}px radius)',
    layoutShadow: 'Soft shadows add depth',
    layoutFlat: 'Flat surfaces, minimal shadow',
    layoutBordered: 'Hairline borders frame content',
    kitButtons: 'Buttons',
    kitPrimary: 'Primary',
    kitSecondary: 'Secondary',
    kitGhost: 'Ghost',
    kitDisabled: 'Disabled',
    kitForms: 'Form controls',
    kitFieldLabel: 'Email address',
    kitFieldPlaceholder: 'you@example.com',
    kitSelectLabel: 'Plan',
    kitTextareaPlaceholder: 'Write a message…',
    kitCheckbox: 'Email me updates',
    kitRadioA: 'Monthly',
    kitRadioB: 'Annual',
    kitSwitch: 'Enabled',
    kitBadges: 'Badges & tags',
    kitBadgeNew: 'New',
    kitBadgeBeta: 'Beta',
    kitBadgePro: 'Pro',
    kitCardTitle: 'Card title',
    kitCardBody: 'Cards, fields and chips inherit the captured radius, border and color.',
    kitAlert: 'Heads up — this kit is generated from one captured design seed.',
    kitTabs: 'Table',
    kitTabOverview: 'Overview',
    kitTabActivity: 'Activity',
    kitTabSettings: 'Settings',
    kitTableHead1: 'Name',
    kitTableHead2: 'Role',
    kitTableHead3: 'Status',
    kitTableStatus: 'Active',
    dsKitSub: "Buttons, inputs and cards rebuilt from this site's own component styles — radius, padding, border, shadow, weight and color.",
    kitInputs: 'Inputs',
    kitSelection: 'Selection',
    kitAvatars: 'Avatars',
    kitNav: 'Navigation',
    kitData: 'Data display',
    kitFeedback: 'Feedback',
    kitOverlays: 'Overlays',
    kitWithIcon: 'With icon',
    kitLoading: 'Loading',
    kitProgress: 'Progress',
    kitSearchLabel: 'Search',
    kitSearchPlaceholder: 'Search…',
    kitTooltip: 'Hover me',
    kitTooltipText: 'Tooltip',
    kitStep1: 'Account',
    kitStep2: 'Details',
    kitStep3: 'Done',
    kitStatVisitors: 'Visitors',
    kitStatRevenue: 'Revenue',
    kitStatChurn: 'Churn',
    kitTablePending: 'Pending',
    kitListMeta: 'Updated just now',
    kitToastTitle: 'Saved',
    kitToastBody: 'Your changes are live.',
    kitDialogTitle: 'Delete item?',
    kitDialogBody: 'This action cannot be undone. The item will be permanently removed.',
    kitCancel: 'Cancel',
    kitConfirm: 'Delete',
    brandTemplates: 'Templates',
    brandTemplatesSub: 'Ready-made layouts — landing, deck, poster, email, newsletter and form — composed from this brand. Click any tile to preview the full page.',
    brandPreview: 'Preview →',
    assetLanding: 'Landing page',
    assetLandingDesc: 'Hero, nav and feature grid',
    assetDeck: 'Title slide',
    assetDeckDesc: 'Deck cover with brand mark',
    assetPoster: 'Poster',
    assetPosterDesc: 'Accent banner and headline',
    assetEmail: 'Email',
    assetEmailDesc: 'Header, body and CTA',
    assetNewsletter: 'Newsletter',
    assetNewsletterDesc: 'Masthead and article grid',
    assetForm: 'Form',
    assetFormDesc: 'Signup card and inputs',
  };

  function interpolateLocal(raw, vars) {
    if (!vars) return raw;
    return String(raw).replace(/\{(\w+)\}/g, (_, name) => (vars[name] == null ? `{${name}}` : String(vars[name])));
  }

  function setActiveLocale(locale) {
    const api = globalThis.OD_CLIPPER_I18N || I18N;
    activeLocale = api?.normalizeLocale ? (api.normalizeLocale(locale) || activeLocale) : (locale || activeLocale);
  }

  function tr(key, vars) {
    const api = globalThis.OD_CLIPPER_I18N || I18N;
    if (api?.t) {
      const value = api.t(key, vars, activeLocale);
      // The shared bundle returns the key unchanged when it has no entry; treat
      // that as a miss and fall through to the built-in English copy.
      if (value != null && value !== key) return value;
    }
    return interpolateLocal(EN_FALLBACK[key] || key, vars);
  }

  function text(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function escapeHtml(value) {
    return String(value ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function escapeScriptJson(json) {
    return json.replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
  }

  function safeCss(value) {
    return String(value || '').replace(/<\/style/gi, '<\\/style');
  }

  function absUrl(url, base) {
    if (!url) return '';
    try {
      return new URL(url, base || document.baseURI).href;
    } catch {
      return '';
    }
  }

  function isHttp(url) {
    return /^https?:\/\//i.test(url || '');
  }

  function hostOf(url) {
    try {
      return new URL(url).host;
    } catch {
      return '';
    }
  }

  function meta(name) {
    const selectors = [
      `meta[name="${name}"]`,
      `meta[property="${name}"]`,
      `meta[name="og:${name}"]`,
      `meta[property="og:${name}"]`,
      `meta[name="twitter:${name}"]`,
      `meta[property="twitter:${name}"]`,
    ];
    for (const selector of selectors) {
      const value = document.querySelector(selector)?.getAttribute('content');
      if (text(value)) return text(value);
    }
    return '';
  }

  function parseRgb(value) {
    if (!value || value === 'transparent' || value === 'currentColor') return null;
    const rgba = /rgba?\(\s*([\d.]+)[,\s]+([\d.]+)[,\s]+([\d.]+)(?:[,/\s]+([\d.]+))?\s*\)/i.exec(value);
    if (rgba) {
      const a = rgba[4] === undefined ? 1 : Number(rgba[4]);
      if (!Number.isFinite(a) || a <= 0.04) return null;
      return {
        r: Math.max(0, Math.min(255, Math.round(Number(rgba[1])))),
        g: Math.max(0, Math.min(255, Math.round(Number(rgba[2])))),
        b: Math.max(0, Math.min(255, Math.round(Number(rgba[3])))),
        a,
      };
    }
    const hex = /#([0-9a-f]{3,8})\b/i.exec(value);
    if (!hex) return null;
    let raw = hex[1];
    if (raw.length === 3 || raw.length === 4) raw = raw.split('').map((c) => c + c).join('');
    const r = parseInt(raw.slice(0, 2), 16);
    const g = parseInt(raw.slice(2, 4), 16);
    const b = parseInt(raw.slice(4, 6), 16);
    const a = raw.length >= 8 ? parseInt(raw.slice(6, 8), 16) / 255 : 1;
    if (![r, g, b, a].every(Number.isFinite) || a <= 0.04) return null;
    return { r, g, b, a };
  }

  function hexOf(c) {
    const part = (n) => Math.max(0, Math.min(255, Math.round(n))).toString(16).padStart(2, '0');
    return `#${part(c.r)}${part(c.g)}${part(c.b)}`.toUpperCase();
  }

  function luminance(c) {
    const lin = (n) => {
      const v = n / 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    };
    return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  }

  function saturation(c) {
    const max = Math.max(c.r, c.g, c.b);
    const min = Math.min(c.r, c.g, c.b);
    return max === 0 ? 0 : (max - min) / max;
  }

  function contrastText(hex) {
    const c = parseRgb(hex);
    return c && luminance(c) < 0.48 ? '#FFFFFF' : '#111111';
  }

  function distinctColors(items, limit) {
    const out = [];
    for (const item of items) {
      const c = parseRgb(item.hex);
      if (!c) continue;
      const tooClose = out.some((existing) => {
        const e = parseRgb(existing.hex);
        if (!e) return false;
        return Math.abs(c.r - e.r) + Math.abs(c.g - e.g) + Math.abs(c.b - e.b) < 44;
      });
      if (!tooClose) out.push(item);
      if (out.length >= limit) break;
    }
    return out;
  }

  function visibleElements() {
    const out = [];
    const all = document.body ? document.body.getElementsByTagName('*') : [];
    for (let i = 0; i < all.length && out.length < MAX_ELEMENTS; i += 1) {
      const el = all[i];
      if (!el || el.id?.startsWith('od-clipper-')) continue;
      let s;
      let r;
      try {
        s = getComputedStyle(el);
        if (s.display === 'none' || s.visibility === 'hidden' || Number(s.opacity) === 0) continue;
        r = el.getBoundingClientRect();
      } catch {
        continue;
      }
      if (r.width <= 0 || r.height <= 0) continue;
      out.push({ el, style: s, rect: r });
    }
    return out;
  }

  function collectPalette(elements) {
    const scores = new Map();
    const add = (raw, score, role) => {
      const c = parseRgb(raw);
      if (!c) return;
      const hex = hexOf(c);
      const prev = scores.get(hex) || { hex, score: 0, roles: new Set(), c };
      prev.score += score;
      if (role) prev.roles.add(role);
      scores.set(hex, prev);
    };

    add(meta('theme-color'), 60, 'theme');
    add(getComputedStyle(document.documentElement).backgroundColor, 25, 'background');
    add(getComputedStyle(document.body || document.documentElement).backgroundColor, 40, 'background');
    add(getComputedStyle(document.body || document.documentElement).color, 40, 'foreground');

    const root = getComputedStyle(document.documentElement);
    for (let i = 0; i < root.length; i += 1) {
      const prop = root[i];
      if (!prop || !prop.startsWith('--')) continue;
      const lower = prop.toLowerCase();
      if (!/(color|bg|background|accent|brand|border|surface|foreground|text)/.test(lower)) continue;
      add(root.getPropertyValue(prop), 16, prop);
    }

    for (const item of elements) {
      const area = Math.min(40, Math.max(1, (item.rect.width * item.rect.height) / 6000));
      const tag = item.el.tagName.toLowerCase();
      const isControl = /^(a|button|input|select|textarea)$/.test(tag) || item.el.getAttribute('role') === 'button';
      add(item.style.backgroundColor, area + (isControl ? 24 : 0), isControl ? 'component-bg' : 'background');
      add(item.style.color, Math.min(18, text(item.el.textContent).length / 12) + (isControl ? 18 : 2), 'text');
      add(item.style.borderTopColor, isControl ? 10 : 3, 'border');
      add(item.style.outlineColor, 2, 'outline');
      add(item.style.fill, 4, 'svg-fill');
      add(item.style.stroke, 4, 'svg-stroke');
    }

    const ranked = [...scores.values()]
      .filter((item) => item.hex !== '#000000' || item.score > 8)
      .sort((a, b) => b.score - a.score);
    return distinctColors(ranked, 12).map((item) => ({
      hex: item.hex,
      score: Math.round(item.score),
      roles: [...item.roles].slice(0, 4),
      luminance: Number(luminance(item.c).toFixed(3)),
      saturation: Number(saturation(item.c).toFixed(3)),
    }));
  }

  function clamp255(n) {
    return Math.max(0, Math.min(255, Math.round(n)));
  }

  // Linear interpolation between two hex colors (t in 0..1, toward b).
  function mixHex(a, b, t) {
    const ca = parseRgb(a) || { r: 255, g: 255, b: 255 };
    const cb = parseRgb(b) || { r: 0, g: 0, b: 0 };
    return hexOf({
      r: clamp255(ca.r + (cb.r - ca.r) * t),
      g: clamp255(ca.g + (cb.g - ca.g) * t),
      b: clamp255(ca.b + (cb.b - ca.b) * t),
    });
  }

  function pxValue(value) {
    const match = /(-?[\d.]+)px/.exec(String(value || ''));
    return match ? parseFloat(match[1]) : null;
  }

  function firstDefined() {
    for (let i = 0; i < arguments.length; i += 1) {
      if (arguments[i] != null) return arguments[i];
    }
    return null;
  }

  const ROLE_NAME_KEYS = {
    background: 'swatchBackground',
    surface: 'swatchSurface',
    foreground: 'swatchForeground',
    muted: 'swatchMuted',
    border: 'swatchBorder',
    accent: 'swatchAccent',
    'accent-secondary': 'swatchSupport',
    highlight: 'swatchHighlight',
  };
  const ROLE_USAGE_KEYS = {
    background: 'swatchUseBackground',
    surface: 'swatchUseSurface',
    foreground: 'swatchUseForeground',
    muted: 'swatchUseMuted',
    border: 'swatchUseBorder',
    accent: 'swatchUseAccent',
    'accent-secondary': 'swatchUseSupport',
    highlight: 'swatchUseHighlight',
  };

  function roleColor(role, hex) {
    return {
      role,
      hex,
      name: tr(ROLE_NAME_KEYS[role] || 'swatchHighlight'),
      usage: tr(ROLE_USAGE_KEYS[role] || 'swatchUseHighlight'),
    };
  }

  // Map the observed palette onto stable semantic roles. Crucially, only these
  // swatches and the single accent ever surface the real brand colors — the page
  // chrome stays on a fixed neutral paper/surface set. That is the fix for the
  // old behavior where a saturated brand background (picked as `surface`) tinted
  // every card on the page.
  function deriveBrandColors(palette) {
    const parsed = palette.map((p) => ({ ...p, c: parseRgb(p.hex) })).filter((p) => p.c);
    if (!parsed.length) {
      return [roleColor('background', '#FFFFFF'), roleColor('foreground', '#1A1A18'), roleColor('accent', '#C96442')];
    }
    const lumOf = (p) => luminance(p.c);
    const satOf = (p) => saturation(p.c);
    const byLight = [...parsed].sort((a, b) => lumOf(b) - lumOf(a));
    const byScore = (list) => [...list].sort((a, b) => b.score - a.score);
    const neutrals = byScore(parsed.filter((p) => satOf(p) < 0.16));
    const colored = parsed
      .filter((p) => satOf(p) > 0.2 && lumOf(p) > 0.05 && lumOf(p) < 0.93)
      .sort((a, b) => b.score * (0.4 + satOf(b)) - a.score * (0.4 + satOf(a)));

    const background = byLight[0] && lumOf(byLight[0]) > 0.55 ? byLight[0].hex : '#FFFFFF';
    const darkest = [...byLight].reverse();
    const foreground = (darkest.find((p) => lumOf(p) < 0.4) || darkest[0]).hex;
    const surface =
      firstDefined((neutrals.find((p) => p.hex !== background && lumOf(p) > 0.84) || {}).hex) ||
      mixHex(background, '#FFFFFF', 0.55);
    const muted =
      firstDefined((neutrals.find((p) => lumOf(p) > 0.22 && lumOf(p) < 0.62) || {}).hex) ||
      mixHex(foreground, background, 0.5);
    const border =
      firstDefined(
        (neutrals.find((p) => lumOf(p) > 0.6 && lumOf(p) < 0.92 && p.hex !== surface && p.hex !== background) || {})
          .hex,
      ) || mixHex(background, foreground, 0.12);
    const accent = (colored[0] && colored[0].hex) || mixHex(foreground, '#C96442', 0.45);
    const accentLum = luminance(parseRgb(accent) || { r: 0, g: 0, b: 0 });
    const accentSecondary = colored.find((p) => p.hex !== accent && Math.abs(lumOf(p) - accentLum) > 0.03);

    const used = new Set([background, surface, foreground, muted, border, accent]);
    const roles = [
      roleColor('background', background),
      roleColor('surface', surface),
      roleColor('foreground', foreground),
      roleColor('muted', muted),
      roleColor('border', border),
      roleColor('accent', accent),
    ];
    if (accentSecondary) {
      roles.push(roleColor('accent-secondary', accentSecondary.hex));
      used.add(accentSecondary.hex);
    }
    // Surface any remaining distinctive brand colors so the palette feels complete.
    for (const p of colored) {
      if (roles.length >= 8) break;
      if (used.has(p.hex)) continue;
      used.add(p.hex);
      roles.push(roleColor('highlight', p.hex));
    }
    return roles;
  }

  // A readable variant of the accent for text/iconography on light surfaces — a
  // pale brand accent (e.g. a yellow) is darkened toward the ink so chips, links
  // and "—" pillar markers never fall below legibility on white.
  function accentInk(accent, foreground) {
    const c = parseRgb(accent);
    if (c && luminance(c) > 0.6) return mixHex(accent, foreground || '#1A1A18', 0.55);
    return accent;
  }

  // Observable layout posture — corner radius, shadow depth and border treatment
  // read straight off the page's real components. Honest, not invented.
  function deriveLayout(components) {
    const card = components.card || {};
    const button = components.button || {};
    const input = components.input || {};
    const radius = firstDefined(pxValue(card.radius), pxValue(button.radius), pxValue(input.radius));
    const hasShadow = [card.shadow, button.shadow].some((s) => s && s !== 'none');
    const rules = [];
    if (radius != null) {
      rules.push(radius <= 2 ? tr('layoutSquare') : tr('layoutRounded', { px: Math.round(radius) }));
    }
    rules.push(hasShadow ? tr('layoutShadow') : tr('layoutFlat'));
    rules.push(tr('layoutBordered'));
    return { radius: radius != null ? `${Math.round(radius)}px` : '—', postureRules: rules };
  }

  function firstFamily(fontFamily) {
    return text(fontFamily).split(',')[0]?.replace(/["']/g, '').trim() || 'system-ui';
  }

  function fontSpecFor(selector, fallbackEl) {
    const el = document.querySelector(selector) || fallbackEl || document.body || document.documentElement;
    const s = getComputedStyle(el);
    return {
      selector,
      family: firstFamily(s.fontFamily),
      stack: s.fontFamily || 'system-ui',
      weight: s.fontWeight || '400',
      size: s.fontSize || '16px',
      lineHeight: s.lineHeight || 'normal',
      letterSpacing: s.letterSpacing || 'normal',
    };
  }

  function collectFontFaces(resources) {
    const faces = [];
    for (const sheet of Array.from(document.styleSheets)) {
      let rules;
      try {
        rules = sheet.cssRules;
      } catch {
        continue;
      }
      if (!rules) continue;
      for (const rule of Array.from(rules)) {
        if (faces.length >= 8) break;
        if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
        const css = rule.cssText || '';
        css.replace(/url\(\s*['"]?([^'")]+)['"]?\s*\)/gi, (_m, ref) => {
          const url = absUrl(ref, sheet.href || document.baseURI);
          if (isHttp(url)) resources.add(url);
          return _m;
        });
        faces.push(css.replace(/url\(\s*(['"]?)([^'")]+)\1\s*\)/gi, (m, q, ref) => {
          const url = absUrl(ref, sheet.href || document.baseURI);
          return url ? `url(${q}${url}${q})` : m;
        }));
      }
    }
    return faces;
  }

  function collectTypography() {
    const specs = [
      { role: 'Display', ...fontSpecFor('h1, [class*="hero" i], [class*="title" i]') },
      { role: 'Body', ...fontSpecFor('body, p') },
      { role: 'UI', ...fontSpecFor('button, a, input, select') },
      { role: 'Mono', ...fontSpecFor('code, pre, kbd') },
    ];
    const familyScores = new Map();
    for (const el of Array.from(document.querySelectorAll('body, h1, h2, h3, p, a, button, input, code')).slice(0, 80)) {
      try {
        const s = getComputedStyle(el);
        const family = firstFamily(s.fontFamily);
        familyScores.set(family, (familyScores.get(family) || 0) + 1);
      } catch {
        // ignore
      }
    }
    return {
      specs,
      families: [...familyScores.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 6)
        .map(([family, count]) => ({ family, count })),
    };
  }

  function addCandidate(out, rawSrc, label, kind, score) {
    const src = absUrl(rawSrc);
    if (!isHttp(src) && !/^data:image\//i.test(src)) return;
    if (out.some((item) => item.src === src)) return;
    out.push({ src, label: text(label), kind, score });
  }

  function collectImageAssets(elements, resources) {
    const candidates = [];
    document.querySelectorAll('link[rel~="icon"], link[rel~="apple-touch-icon"], link[rel~="mask-icon"]').forEach((link) => {
      addCandidate(candidates, link.getAttribute('href'), link.getAttribute('rel') || 'App icon', 'logo', 70);
    });
    addCandidate(candidates, meta('image'), 'Social preview image', 'image', 45);

    // The page's own brand name (og:site_name, else first heading, else
    // <title>). A logo whose alt/class echoes this is the PRIMARY brand mark —
    // not a partner/sub-brand lockup that merely renders in the same header.
    // Matched against alt/id/class only, never the src URL, because the domain
    // usually echoes the brand and would otherwise match every asset.
    const normalizeName = (value) =>
      String(value || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
    const brandName = normalizeName(
      meta('site_name') || document.querySelector('h1')?.textContent || document.title,
    );

    for (const img of Array.from(document.images)) {
      const src = img.currentSrc || img.src;
      if (!src) continue;
      const r = img.getBoundingClientRect();
      // Skip images that finished loading but produced no pixels — a broken src,
      // a 404, or a decode failure. We only drop them when nothing renders
      // either (a valid CSS-sized SVG can have naturalWidth 0 yet a real box),
      // so a legitimately rendered mark is never discarded. This stops broken
      // URLs from being captured and re-surfaced as a broken-image glyph later.
      if (
        img.complete &&
        (img.naturalWidth | 0) === 0 &&
        (img.naturalHeight | 0) === 0 &&
        (r.width | 0) === 0 &&
        (r.height | 0) === 0
      ) {
        continue;
      }
      const naturalArea = Math.max(img.naturalWidth || r.width || 0, 1) * Math.max(img.naturalHeight || r.height || 0, 1);
      const renderedArea = Math.max(r.width || 0, 0) * Math.max(r.height || 0, 0);
      const hay = `${img.alt || ''} ${img.id || ''} ${img.className || ''} ${img.src || ''}`.toLowerCase();
      const logoish = /(logo|brand|mark|icon|wordmark)/.test(hay) || img.closest('header, nav');
      if (Math.max(img.naturalWidth || r.width || 0, img.naturalHeight || r.height || 0) < 32 && !logoish) continue;
      // Logos rank by ON-PAGE size + brand-name match: an SVG's intrinsic
      // naturalWidth/Height is its arbitrary viewBox and says nothing about
      // which mark is primary (a small sub-brand SVG with a large viewBox would
      // otherwise outrank the bigger, real logo). Non-logo images keep
      // natural-area ranking, where higher source resolution is preferable.
      const nameHay = normalizeName(`${img.alt || ''} ${img.id || ''} ${img.className || ''}`);
      const nameBonus = logoish && brandName.length > 2 && nameHay.includes(brandName) ? 30 : 0;
      const areaBonus = logoish ? Math.min(20, renderedArea / 2000) : Math.min(30, naturalArea / 30000);
      addCandidate(
        candidates,
        src,
        img.alt || (logoish ? 'Brand mark' : 'Page image'),
        logoish ? 'logo' : 'image',
        (logoish ? 75 : 20) + areaBonus + nameBonus,
      );
    }

    for (const item of elements.slice(0, 900)) {
      const bg = item.style.backgroundImage;
      if (!bg || bg === 'none' || !bg.includes('url(')) continue;
      const match = /url\(\s*['"]?([^'")]+)['"]?\s*\)/i.exec(bg);
      if (!match) continue;
      const area = item.rect.width * item.rect.height;
      if (Math.max(item.rect.width, item.rect.height) < 64) continue;
      addCandidate(
        candidates,
        match[1],
        item.el.getAttribute('aria-label') || item.el.getAttribute('title') || 'Background image',
        'image',
        18 + Math.min(35, area / 30000),
      );
    }

    const sorted = candidates.sort((a, b) => b.score - a.score);
    const logos = sorted.filter((item) => item.kind === 'logo').slice(0, MAX_LOGOS);
    const images = sorted.filter((item) => item.kind !== 'logo').slice(0, MAX_IMAGES);
    for (const item of [...logos, ...images]) if (isHttp(item.src)) resources.add(item.src);
    return { logos, images };
  }

  function collectContent() {
    const title =
      meta('site_name') ||
      text(document.querySelector('h1')?.textContent) ||
      text(document.title) ||
      hostOf(location.href) ||
      tr('brandFallbackTitle');
    const description =
      meta('description') ||
      text(document.querySelector('main p, article p, [class*="subtitle" i], [class*="description" i]')?.textContent) ||
      tr('brandFallbackDescription');
    const headings = Array.from(document.querySelectorAll('h1, h2, h3'))
      .map((el) => text(el.textContent))
      .filter(Boolean)
      .filter((value, index, arr) => arr.indexOf(value) === index)
      .slice(0, 8);
    const keywords = [
      ...text(meta('keywords')).split(',').map((s) => text(s)).filter(Boolean),
      ...headings.slice(0, 4),
    ].slice(0, 8);
    return {
      title,
      description,
      domain: hostOf(location.href),
      url: location.href,
      documentTitle: text(document.title),
      headings,
      keywords,
    };
  }

  function styleProfile(el) {
    const cs = getComputedStyle(el);
    return {
      background: cs.backgroundColor,
      color: cs.color,
      border: cs.borderTopColor,
      borderWidth: cs.borderTopWidth,
      radius: cs.borderTopLeftRadius,
      padX: cs.paddingLeft,
      padY: cs.paddingTop,
      font: cs.fontFamily,
      weight: cs.fontWeight,
      size: cs.fontSize,
      transform: cs.textTransform,
      letterSpacing: cs.letterSpacing,
      shadow: cs.boxShadow,
    };
  }

  function isShown(cs, r) {
    return cs && cs.display !== 'none' && cs.visibility !== 'hidden' && Number(cs.opacity) !== 0 && r && r.width > 0 && r.height > 0;
  }

  // Pick the most representative primary button on the page: a visible, solidly
  // filled control of button-ish size (prefer saturated fills, then bordered).
  function pickButton() {
    const sel = 'button, a[role="button"], [role="button"], input[type="submit"], input[type="button"], .btn, [class*="btn" i], [class*="button" i]';
    let best = null;
    let bestScore = -1;
    for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 160)) {
      let cs;
      let r;
      try {
        cs = getComputedStyle(el);
        r = el.getBoundingClientRect();
      } catch {
        continue;
      }
      if (!isShown(cs, r) || r.width < 40 || r.height < 22 || r.height > 90) continue;
      const bg = parseRgb(cs.backgroundColor);
      const solid = bg && bg.a > 0.55 ? 1 : 0;
      const sat = bg ? saturation(bg) : 0;
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const hasBorder = parseRgb(cs.borderTopColor) && bw > 0 ? 1 : 0;
      const score = solid * 36 + sat * 24 + hasBorder * 8 + Math.min(18, r.width / 14);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function pickFirstShown(selector) {
    for (const el of Array.from(document.querySelectorAll(selector)).slice(0, 80)) {
      let cs;
      let r;
      try {
        cs = getComputedStyle(el);
        r = el.getBoundingClientRect();
      } catch {
        continue;
      }
      if (isShown(cs, r)) return el;
    }
    return null;
  }

  // Pick a representative content card: a visible block with a real border or a
  // shadow (plus some rounding/padding) so the kit's card mirrors the site.
  function pickCard() {
    const sel = 'article, section, .card, [class*="card" i], [class*="panel" i], [class*="tile" i], li';
    let best = null;
    let bestScore = -1;
    for (const el of Array.from(document.querySelectorAll(sel)).slice(0, 120)) {
      let cs;
      let r;
      try {
        cs = getComputedStyle(el);
        r = el.getBoundingClientRect();
      } catch {
        continue;
      }
      if (!isShown(cs, r) || r.width < 120 || r.height < 60 || r.width > 920) continue;
      const bw = parseFloat(cs.borderTopWidth) || 0;
      const hasBorder = parseRgb(cs.borderTopColor) && bw > 0 ? 1 : 0;
      const hasShadow = cs.boxShadow && cs.boxShadow !== 'none' ? 1 : 0;
      const radius = parseFloat(cs.borderTopLeftRadius) || 0;
      const pad = parseFloat(cs.paddingTop) || 0;
      if (!hasBorder && !hasShadow && radius < 4) continue;
      const score = hasShadow * 24 + hasBorder * 16 + Math.min(12, radius) + Math.min(10, pad / 2);
      if (score > bestScore) {
        bestScore = score;
        best = el;
      }
    }
    return best;
  }

  function collectComponents() {
    const profile = (el) => (el ? styleProfile(el) : {});
    return {
      button: profile(pickButton()),
      input: profile(pickFirstShown('input:not([type=hidden]):not([type=submit]):not([type=button]), textarea, select')),
      card: profile(pickCard()),
      nav: profile(pickFirstShown('nav, header')),
    };
  }

  function clampPx(value, min, max, fallback) {
    const n = pxValue(value);
    if (n == null) return fallback;
    return Math.max(min, Math.min(max, Math.round(n)));
  }

  function colorOr(value, fallback) {
    const c = parseRgb(value);
    return c && c.a > 0.04 ? hexOf(c) : fallback;
  }

  function weightOr(value, fallback) {
    const n = parseInt(value, 10);
    return Number.isFinite(n) && n >= 100 ? Math.max(400, Math.min(800, n)) : fallback;
  }

  function transformOr(value) {
    return value === 'uppercase' || value === 'capitalize' ? value : 'none';
  }

  function shadowOr(value, fallback) {
    if (!value || value === 'none') return fallback;
    // Keep a real shadow but bound its length so a monster computed value can't
    // bloat the saved file.
    return String(value).slice(0, 120);
  }

  // Translate the captured component profiles into a sanitized set of "atoms"
  // the kit and templates render with. Every site yields its own button radius,
  // padding, border weight, shadow, weight and letter-case, so each captured
  // design system's kit looks like THAT site — not a shared template.
  function deriveAtoms(components, brand) {
    const b = components.button || {};
    const i = components.input || {};
    const c = components.card || {};
    const btnBgRaw = parseRgb(b.background);
    const btnBg = btnBgRaw && btnBgRaw.a > 0.5 ? hexOf(btnBgRaw) : brand.accent;
    const btnFg = colorOr(b.color, contrastText(btnBg));
    return {
      button: {
        bg: btnBg,
        fg: btnFg,
        border: colorOr(b.border, btnBg),
        borderWidth: clampPx(b.borderWidth, 0, 3, 1),
        radius: clampPx(b.radius, 0, 26, 10),
        padX: clampPx(b.padX, 10, 30, 18),
        padY: clampPx(b.padY, 6, 18, 11),
        weight: weightOr(b.weight, 600),
        transform: transformOr(b.transform),
        letterSpacing: b.letterSpacing && b.letterSpacing !== 'normal' ? b.letterSpacing : 'normal',
        shadow: shadowOr(b.shadow, 'none'),
      },
      input: {
        bg: colorOr(i.background, brand.surface),
        fg: colorOr(i.color, brand.foreground),
        border: colorOr(i.border, brand.border),
        borderWidth: clampPx(i.borderWidth, 0, 3, 1),
        radius: clampPx(i.radius, 0, 22, 9),
        padX: clampPx(i.padX, 8, 22, 12),
        padY: clampPx(i.padY, 6, 16, 10),
        shadow: shadowOr(i.shadow, 'none'),
      },
      card: {
        bg: colorOr(c.background, brand.surface),
        border: colorOr(c.border, brand.border),
        borderWidth: clampPx(c.borderWidth, 0, 3, 1),
        radius: clampPx(c.radius, 0, 28, 12),
        shadow: shadowOr(c.shadow, '0 1px 2px rgba(0,0,0,.05)'),
        pad: clampPx(c.padX, 12, 28, 18),
      },
      accent: brand.accent,
      onAccent: contrastText(brand.accent),
    };
  }

  // srcdoc carries a full HTML document inside an attribute. Escaping only the
  // attribute delimiter (") keeps the real image/logo URLs byte-identical so the
  // service worker's inline pass still swaps them for data URIs; HTML5 tolerates
  // literal <, >, & inside a double-quoted attribute value.
  function srcdocEscape(html) {
    return String(html).replace(/"/g, '&quot;');
  }

  // Shared CSS for every asset template: the captured atoms (button / input /
  // card) plus palette + type, so the generated artifacts look like THIS brand.
  function assetBase(ctx) {
    const a = ctx.atoms;
    return [
      '*{box-sizing:border-box;margin:0;padding:0}',
      'html,body{height:100%}',
      `body{font-family:${ctx.fontBody};color:${ctx.fg};background:${ctx.bg};line-height:1.5;-webkit-font-smoothing:antialiased}`,
      `.serif{font-family:${ctx.fontDisplay}}`,
      'img{display:block;max-width:100%}',
      'a{color:inherit;text-decoration:none}',
      '.muted{color:' + ctx.muted + '}',
      `.accbar{height:4px;width:54px;background:${ctx.accent};border-radius:2px}`,
      `.btn{display:inline-flex;align-items:center;justify-content:center;cursor:default;background:${a.button.bg};color:${a.button.fg};border:${a.button.borderWidth}px solid ${a.button.border};border-radius:${a.button.radius}px;padding:${a.button.padY}px ${a.button.padX}px;font-weight:${a.button.weight};text-transform:${a.button.transform};letter-spacing:${a.button.letterSpacing};box-shadow:${a.button.shadow};font-size:14px}`,
      `.btn.ghost{background:transparent;color:${ctx.ink};border-color:${ctx.border};box-shadow:none}`,
      `.card{background:${a.card.bg};border:${a.card.borderWidth}px solid ${a.card.border};border-radius:${a.card.radius}px;box-shadow:${a.card.shadow};padding:${a.card.pad}px}`,
      `.input{width:100%;background:${a.input.bg};color:${a.input.fg};border:${a.input.borderWidth}px solid ${a.input.border};border-radius:${a.input.radius}px;padding:${a.input.padY}px ${a.input.padX}px;font-size:14px;font-family:inherit}`,
    ].join('');
  }

  function assetDoc(ctx, body, extra) {
    return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${assetBase(ctx)}${extra || ''}</style></head><body>${body}</body></html>`;
  }

  function tplLanding(ctx) {
    const links = ctx.headings.slice(0, 3).map((h) => `<a>${escapeHtml(h)}</a>`).join('');
    const featSrc = ctx.headings.length ? ctx.headings : [ctx.title, ctx.title, ctx.title];
    const feats = featSrc
      .slice(0, 3)
      .map((h) => `<div class="f"><span class="fdot"></span><h3 class="serif">${escapeHtml(h)}</h3><p class="muted">${escapeHtml(ctx.tagline)}</p></div>`)
      .join('');
    const hero = ctx.images[0] ? `<div class="himg"><img src="${ctx.images[0]}" alt=""></div>` : '';
    const mark = ctx.logo ? `<img src="${ctx.logo}" alt="">` : `<span class="serif" style="color:${ctx.accent}">${ctx.initial}</span>`;
    const extra = `.nav{display:flex;align-items:center;justify-content:space-between;padding:20px 44px;border-bottom:1px solid ${ctx.border}}.brand{display:flex;align-items:center;gap:10px;font-weight:700;font-size:17px}.brand img{height:26px}.links{display:flex;gap:24px;color:${ctx.muted};font-size:14px}.hero{display:grid;grid-template-columns:1.05fr .95fr;gap:34px;align-items:center;padding:60px 44px 40px}.hero h1{font-size:48px;line-height:1.04;letter-spacing:-.02em}.hero .sub{margin:18px 0 26px;color:${ctx.muted};font-size:18px;max-width:30ch}.cta{display:flex;gap:12px}.himg{aspect-ratio:4/3;border-radius:${ctx.atoms.card.radius}px;overflow:hidden;background:${ctx.surfaceMuted}}.himg img{width:100%;height:100%;object-fit:cover}.feats{display:grid;grid-template-columns:repeat(3,1fr);gap:18px;padding:0 44px 56px}.f .fdot{display:block;width:30px;height:30px;border-radius:8px;background:${ctx.accent};margin-bottom:12px}.f h3{font-size:17px;margin-bottom:6px}.f p{font-size:13px}`;
    const body = `<div class="nav"><div class="brand">${mark}<span>${escapeHtml(ctx.title)}</span></div><div class="links">${links}</div><span class="btn">Get started</span></div><div class="hero"><div><h1 class="serif">${escapeHtml(ctx.title)}</h1><p class="sub">${escapeHtml(ctx.tagline)}</p><div class="cta"><span class="btn">Get started</span><span class="btn ghost">Learn more</span></div></div>${hero}</div><div class="feats">${feats}</div>`;
    return assetDoc(ctx, body, extra);
  }

  function tplDeck(ctx) {
    const mark = ctx.logo ? `<img src="${ctx.logo}" alt="">` : `<span class="serif" style="color:${ctx.accent}">${ctx.initial}</span>`;
    const extra = `.slide{height:100%;display:flex;flex-direction:column;justify-content:center;padding:64px 72px;position:relative}.eye{font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:${ctx.muted};margin-bottom:18px}.slide h1{font-size:60px;line-height:1.02;letter-spacing:-.02em;max-width:18ch}.slide .sub{margin-top:20px;font-size:22px;color:${ctx.muted};max-width:34ch}.foot{position:absolute;left:72px;right:72px;bottom:40px;display:flex;align-items:center;justify-content:space-between;font-size:13px;color:${ctx.muted}}.mark{display:flex;align-items:center;gap:8px;font-weight:700}.mark img{height:22px}`;
    const body = `<div class="slide"><div class="eye">${escapeHtml(ctx.domain || 'Design system')}</div><h1 class="serif">${escapeHtml(ctx.title)}</h1><div class="accbar" style="margin-top:24px"></div><p class="sub">${escapeHtml(ctx.tagline)}</p><div class="foot"><div class="mark">${mark}<span>${escapeHtml(ctx.title)}</span></div><div>01 / 12</div></div></div>`;
    return assetDoc(ctx, body, extra);
  }

  function tplPoster(ctx) {
    const mark = ctx.logo ? `<img src="${ctx.logo}" alt="">` : `<span>${ctx.initial}</span>`;
    const extra = `.poster{height:100%;display:grid;grid-template-rows:auto 1fr auto}.pt{background:${ctx.accent};color:${ctx.onAccent};padding:28px 40px;display:flex;align-items:center;justify-content:space-between}.pt .mark{display:flex;align-items:center;gap:10px;font-weight:700}.pt img{height:26px}.pb{padding:48px 40px;display:flex;flex-direction:column;justify-content:center}.pb h1{font-size:58px;line-height:1;letter-spacing:-.02em}.pb p{margin-top:20px;font-size:20px;color:${ctx.muted};max-width:26ch}.pf{padding:22px 40px;border-top:1px solid ${ctx.border};display:flex;justify-content:space-between;font-size:13px;color:${ctx.muted}}`;
    const body = `<div class="poster"><div class="pt"><div class="mark">${mark}<span>${escapeHtml(ctx.title)}</span></div><span>${escapeHtml(ctx.domain)}</span></div><div class="pb"><h1 class="serif">${escapeHtml(ctx.headings[0] || ctx.title)}</h1><p>${escapeHtml(ctx.tagline)}</p><div style="margin-top:30px"><span class="btn">Learn more</span></div></div><div class="pf"><span>${escapeHtml(ctx.title)}</span><span>${escapeHtml(ctx.domain)}</span></div></div>`;
    return assetDoc(ctx, body, extra);
  }

  function tplEmail(ctx) {
    const mark = ctx.logo ? `<img src="${ctx.logo}" alt="">` : `<span class="serif" style="color:${ctx.accent}">${ctx.initial}</span>`;
    const extra = `body{background:${ctx.surfaceMuted}}.wrap{max-width:600px;margin:0 auto;background:${ctx.surface};min-height:100%}.eh{padding:24px 32px;border-bottom:1px solid ${ctx.border};display:flex;align-items:center;gap:10px;font-weight:700}.eh img{height:24px}.eb{padding:36px 32px}.eb h1{font-size:26px;line-height:1.2}.eb p{margin:14px 0 24px;color:${ctx.muted};font-size:15px}.ef{padding:24px 32px;border-top:1px solid ${ctx.border};color:${ctx.muted};font-size:12px;text-align:center;line-height:1.7}`;
    const body = `<div class="wrap"><div class="eh">${mark}<span>${escapeHtml(ctx.title)}</span></div><div class="eb"><h1 class="serif">${escapeHtml(ctx.headings[0] || ctx.title)}</h1><p>${escapeHtml(ctx.tagline)}</p><span class="btn">Read more</span></div><div class="ef">${escapeHtml(ctx.domain)} — you are receiving this because you subscribed.<br>Unsubscribe · Preferences</div></div>`;
    return assetDoc(ctx, body, extra);
  }

  function tplNewsletter(ctx) {
    const lead = ctx.images[0] ? `<div class="lead"><img src="${ctx.images[0]}" alt=""></div>` : '';
    const itemSrc = ctx.headings.slice(1, 4).length ? ctx.headings.slice(1, 4) : [ctx.title, ctx.title];
    const items = itemSrc.map((h) => `<div class="it"><h4 class="serif">${escapeHtml(h)}</h4><p class="muted">${escapeHtml(ctx.tagline)}</p></div>`).join('');
    const extra = `.wrap{max-width:680px;margin:0 auto;padding:36px 40px}.mh{text-align:center;border-bottom:3px solid ${ctx.accent};padding-bottom:16px}.mh h1{font-size:40px;letter-spacing:-.01em}.mh .d{margin-top:6px;font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:${ctx.muted}}.lead{margin:24px 0;aspect-ratio:16/8;overflow:hidden;border-radius:${ctx.atoms.card.radius}px;background:${ctx.surfaceMuted}}.lead img{width:100%;height:100%;object-fit:cover}.lh{font-size:24px;line-height:1.2}.lp{margin:10px 0 0;color:${ctx.muted};font-size:15px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:20px;margin-top:26px;border-top:1px solid ${ctx.border};padding-top:22px}.it h4{font-size:16px;margin-bottom:6px}.it p{font-size:13px}`;
    const body = `<div class="wrap"><div class="mh"><h1 class="serif">${escapeHtml(ctx.title)}</h1><div class="d">${escapeHtml(ctx.domain)} · Newsletter</div></div>${lead}<h2 class="serif lh">${escapeHtml(ctx.headings[0] || ctx.title)}</h2><p class="lp">${escapeHtml(ctx.tagline)}</p><div class="grid">${items}</div></div>`;
    return assetDoc(ctx, body, extra);
  }

  function tplForm(ctx) {
    const extra = `body{background:${ctx.surfaceMuted};display:flex;align-items:center;justify-content:center;padding:40px}.fc{width:100%;max-width:420px}.fc h1{font-size:24px;margin-bottom:4px}.fc .s{color:${ctx.muted};font-size:14px;margin-bottom:22px}.row{margin-bottom:16px}.row label{display:block;font-size:13px;font-weight:600;margin-bottom:6px}.check{display:flex;align-items:center;gap:8px;font-size:13px;color:${ctx.muted};margin:4px 0 20px}.check i{width:16px;height:16px;border-radius:4px;background:${ctx.accent};display:inline-block;flex:none}.fc .btn{width:100%}`;
    const body = `<div class="card fc"><h1 class="serif">Create account</h1><div class="s">${escapeHtml(ctx.tagline || ctx.title)}</div><div class="row"><label>Full name</label><input class="input" value="Ada Lovelace"></div><div class="row"><label>Email</label><input class="input" value="ada@example.com"></div><div class="check"><i></i><span>I agree to the terms</span></div><span class="btn">Create account</span></div>`;
    return assetDoc(ctx, body, extra);
  }

  function buildAssetTemplates(ctx) {
    return [
      { key: 'landing', label: tr('assetLanding'), desc: tr('assetLandingDesc'), html: tplLanding(ctx) },
      { key: 'deck', label: tr('assetDeck'), desc: tr('assetDeckDesc'), html: tplDeck(ctx) },
      { key: 'poster', label: tr('assetPoster'), desc: tr('assetPosterDesc'), html: tplPoster(ctx) },
      { key: 'email', label: tr('assetEmail'), desc: tr('assetEmailDesc'), html: tplEmail(ctx) },
      { key: 'newsletter', label: tr('assetNewsletter'), desc: tr('assetNewsletterDesc'), html: tplNewsletter(ctx) },
      { key: 'form', label: tr('assetForm'), desc: tr('assetFormDesc'), html: tplForm(ctx) },
    ];
  }

  function renderHtml(data, fontFaces) {
    const content = data.content;
    const colors =
      data.brand && data.brand.colors && data.brand.colors.length
        ? data.brand.colors
        : [roleColor('background', '#FFFFFF'), roleColor('foreground', '#1A1A18'), roleColor('accent', '#C96442')];
    const byRole = (role, fallback) => {
      const found = colors.find((c) => c.role === role);
      return found ? found.hex : fallback;
    };
    const background = byRole('background', '#FFFFFF');
    const foreground = byRole('foreground', '#1A1A18');
    const accentObserved = byRole('accent', '#C96442');

    const specs = (data.typography && data.typography.specs) || [];
    const stackAt = (i, fallback) => (specs[i] && specs[i].stack) || fallback;
    const fontDisplay = stackAt(0, 'ui-serif, Georgia, "Times New Roman", serif');
    const fontBody = stackAt(1, 'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif');
    const fontMono = stackAt(3, 'ui-monospace, SFMono-Regular, Menlo, Consolas, monospace');

    const logos = data.assets.logos || [];
    const images = data.assets.images || [];
    const logo = logos[0];
    const fontCss = fontFaces.length ? `${fontFaces.join('\n')}\n` : '';
    const initial = escapeHtml((content.title || '?').trim().slice(0, 1).toUpperCase());

    const layout = data.layout || { radius: '—', postureRules: [] };
    const radiusNum = pxValue(layout.radius);
    const uiRadius = radiusNum != null ? `${Math.max(0, Math.min(16, Math.round(radiusNum)))}px` : '10px';

    const surfaceRole = byRole('surface', '#ffffff');
    const mutedRole = byRole('muted', '#57564f');
    const borderRole = byRole('border', '#e7e5dc');
    // The captured component styles drive the kit + templates so each site's
    // design system looks like itself, not a shared template.
    const atoms = deriveAtoms(data.components || {}, {
      accent: accentObserved,
      surface: surfaceRole,
      foreground,
      border: borderRole,
    });

    // Unify the whole kit + templates + chrome on ONE primary color — the
    // captured solid-button color when present, else the observed accent — so
    // buttons, toggles, sliders, badges, tabs and the templates all match
    // instead of mixing the button color with a separate accent.
    const accent = atoms.button.bg;
    const onAccent = atoms.button.fg;
    const ink = accentInk(accent, foreground);

    // Six on-brand artifact templates, rendered as scaled srcdoc previews.
    const assetCtx = {
      title: content.title || 'Brand',
      tagline: content.description || '',
      headings: content.headings || [],
      domain: content.domain || '',
      logo: logo ? logo.src : '',
      initial,
      images: images.map((s) => s.src),
      accent,
      ink,
      onAccent,
      bg: background,
      surface: surfaceRole,
      surfaceMuted: mixHex(background, foreground, 0.05),
      fg: foreground,
      muted: mutedRole,
      border: borderRole,
      fontDisplay,
      fontBody,
      atoms,
    };
    const templates = buildAssetTemplates(assetCtx);
    const assetsSection = `<section class="sec"><h2 class="sec-title">${escapeHtml(tr('brandTemplates'))}</h2><p class="sec-sub">${escapeHtml(tr('brandTemplatesSub'))}</p><div class="assets">${templates
      .map(
        (t) =>
          `<button type="button" class="asset" data-label="${escapeHtml(t.label)}" data-desc="${escapeHtml(t.desc)}"><span class="asset-frame"><iframe loading="lazy" tabindex="-1" aria-hidden="true" sandbox="" srcdoc="${srcdocEscape(t.html)}"></iframe></span><span class="asset-meta"><span class="asset-name">${escapeHtml(t.label)}<span class="asset-open">${escapeHtml(tr('brandPreview'))}</span></span><span class="asset-desc">${escapeHtml(t.desc)}</span></span></button>`,
      )
      .join('')}</div></section>`;

    // --- Header identity mark ---
    const headerMark = logo
      ? `<span class="id-mark" style="background:${escapeHtml(background)}"><img src="${escapeHtml(logo.src)}" alt="" /></span>`
      : `<span class="id-mark initial">${initial}</span>`;

    // --- Hero band (first representative image) ---
    const heroHtml = images.length
      ? `<div class="hero"><img src="${escapeHtml(images[0].src)}" alt="${escapeHtml(content.title)}" loading="lazy" /></div>`
      : '';

    // --- Logo ---
    const logoThumbs =
      logos.length > 1
        ? `<div class="logo-thumbs">${logos
            .map(
              (item, i) =>
                `<button type="button" class="logo-thumb${i === 0 ? ' active' : ''}" data-src="${escapeHtml(item.src)}" aria-label="${escapeHtml(item.label || 'logo')}"><img src="${escapeHtml(item.src)}" alt="" /></button>`,
            )
            .join('')}</div>`
        : '';
    const logoBlock = logo
      ? `<div class="logo-stage" style="background:${escapeHtml(background)}"><img id="od-logo-img" src="${escapeHtml(logo.src)}" alt="${escapeHtml(logo.label || content.title)}" /></div>${logoThumbs}`
      : `<div class="logo-stage empty"><span class="logo-initial">${initial}</span><span class="logo-empty-note">${escapeHtml(tr('brandNoLogoFound'))}</span></div>`;

    // --- Typography ---
    const fontTiles = [
      ['Display', 0],
      ['Body', 1],
      ['Mono', 3],
    ]
      .map(([label, i]) => ({ label, spec: specs[i] }))
      .filter((t) => t.spec && t.spec.family)
      .map(
        (t) =>
          `<div class="font-tile"><div class="ag" style="font-family:${escapeHtml(t.spec.stack)}">Ag</div><div class="ft-meta"><div class="ft-name">${escapeHtml(t.spec.family)}</div><div class="ft-role">${escapeHtml(t.label)}</div></div></div>`,
      )
      .join('');
    const fontTilesHtml = fontTiles ? `<div class="fonts">${fontTiles}</div>` : '';
    const typeRows = [
      { label: 'Display', i: 0, sample: content.title || 'Aa Bb Cc', size: '32px', weight: 600 },
      { label: 'Body', i: 1, sample: content.description || 'The quick brown fox jumps over the lazy dog.', size: '16px', weight: 400 },
      { label: 'Mono', i: 3, sample: 'const system = capture(url)', size: '13px', weight: 400 },
    ]
      .filter((r) => specs[r.i] && specs[r.i].family)
      .map((r) => {
        const spec = specs[r.i];
        const w = spec.weight ? ` · ${escapeHtml(String(spec.weight))}` : '';
        return `<div class="type-row"><div class="type-meta"><span class="type-label">${escapeHtml(r.label)}</span><span class="type-font">${escapeHtml(spec.family)}${w}</span></div><p class="type-sample" style="font-family:${escapeHtml(spec.stack)};font-size:${r.size};font-weight:${r.weight}">${escapeHtml(r.sample)}</p></div>`;
      })
      .join('');

    // --- Palette ---
    const paletteHtml = colors
      .map(
        (c) =>
          `<div class="swatch"><div class="swatch-chip" style="background:${escapeHtml(c.hex)};color:${contrastText(c.hex)}"><span class="hex">${escapeHtml(c.hex)}</span></div><div class="swatch-body"><div class="swatch-name">${escapeHtml(c.name || c.role)}</div><div class="swatch-role">${escapeHtml(c.role || '')}</div>${c.usage ? `<div class="swatch-usage">${escapeHtml(c.usage)}</div>` : ''}</div></div>`,
      )
      .join('');

    // --- Voice & tone (all observed copy: keyword chips, the site's own
    //     description, real page headings as key messages) ---
    const chips = (content.keywords || [])
      .slice(0, 8)
      .map((k) => `<span class="chip">${escapeHtml(k)}</span>`)
      .join('');
    const pillars = (content.headings || [])
      .slice(0, 5)
      .map((h) => `<li><span class="dash">—</span><span>${escapeHtml(h)}</span></li>`)
      .join('');
    const voiceHtml = `<div class="card">${chips ? `<div class="chips">${chips}</div>` : ''}${content.description ? `<p class="tone">${escapeHtml(content.description)}</p>` : ''}${pillars ? `<ul class="pillars">${pillars}</ul>` : ''}</div>`;

    // --- Imagery & layout ---
    const imageryLine = images.length ? tr('brandImageryStyle', { count: images.length }) : tr('brandImageryStyleNone');
    const subjects = (content.keywords || []).slice(0, 6).join(', ');
    const posture = (layout.postureRules || []).map((r) => `<li>${escapeHtml(r)}</li>`).join('');
    const imageryHtml = `<div class="card imagery"><p>${escapeHtml(imageryLine)}</p>${subjects ? `<p><span class="k">${escapeHtml(tr('brandSubjectsLabel'))}:</span> ${escapeHtml(subjects)}</p>` : ''}<p><span class="k">${escapeHtml(tr('brandRadiusLabel'))}:</span> ${escapeHtml(layout.radius)}</p>${posture ? `<div class="posture"><div class="mini-label">${escapeHtml(tr('brandLayoutPosture'))}</div><ul>${posture}</ul></div>` : ''}</div>`;

    // --- Images gallery (compact, click to preview) ---
    const gallery = images.length
      ? `<section class="sec"><div class="sec-head"><h2 class="sec-title">${escapeHtml(tr('brandImages'))}</h2>${images.length > 8 ? `<button type="button" class="view-all" id="od-view-all">${escapeHtml(tr('brandViewAll', { count: images.length }))}</button>` : ''}</div><div class="gallery">${images
          .map((s, i) => {
            const cap = s.label || '';
            return `<button type="button" class="shot" data-idx="${i}" aria-label="${escapeHtml(cap || tr('brandImageLabel', { index: i + 1 }))}"><span class="shot-frame"><img src="${escapeHtml(s.src)}" alt="${escapeHtml(cap)}" loading="lazy" /></span>${cap ? `<span class="shot-cap">${escapeHtml(cap)}</span>` : ''}</button>`;
          })
          .join('')}</div></section>`
      : '';

    // --- Component kit (a complete, on-brand UI kit) ---
    const avatarMark = logo
      ? `<span class="avatar"><img src="${escapeHtml(logo.src)}" alt="" /></span>`
      : `<span class="avatar initials">${initial}</span>`;
    const kit = `<div class="kit">
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitButtons'))}</div>
        <div class="kit-row">
          <button type="button" class="btn primary">${escapeHtml(tr('kitPrimary'))}</button>
          <button type="button" class="btn secondary">${escapeHtml(tr('kitSecondary'))}</button>
          <button type="button" class="btn ghost">${escapeHtml(tr('kitGhost'))}</button>
          <button type="button" class="btn primary lg">${escapeHtml(tr('kitPrimary'))}</button>
          <button type="button" class="btn primary sm">${escapeHtml(tr('kitPrimary'))}</button>
          <button type="button" class="btn primary"><span class="ic">&#9733;</span>${escapeHtml(tr('kitWithIcon'))}</button>
          <button type="button" class="btn primary"><span class="spin"></span>${escapeHtml(tr('kitLoading'))}</button>
          <button type="button" class="btn primary" disabled>${escapeHtml(tr('kitDisabled'))}</button>
          <button type="button" class="btn icon" aria-label="more">&#8943;</button>
        </div>
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitInputs'))}</div>
        <div class="kit-grid">
          <label class="field-label">${escapeHtml(tr('kitFieldLabel'))}<input class="input" type="email" placeholder="${escapeHtml(tr('kitFieldPlaceholder'))}" /></label>
          <label class="field-label">${escapeHtml(tr('kitSelectLabel'))}<select class="input"><option>${escapeHtml(tr('kitRadioA'))}</option><option>${escapeHtml(tr('kitRadioB'))}</option></select></label>
          <label class="field-label">${escapeHtml(tr('kitSearchLabel'))}<span class="search"><span class="search-ic">&#9906;</span><input class="input" type="search" placeholder="${escapeHtml(tr('kitSearchPlaceholder'))}" /></span></label>
          <label class="field-label">${escapeHtml(tr('kitDisabled'))}<input class="input" value="${escapeHtml(tr('kitFieldPlaceholder'))}" disabled /></label>
        </div>
        <textarea class="input textarea" rows="2" placeholder="${escapeHtml(tr('kitTextareaPlaceholder'))}"></textarea>
        <input class="range" type="range" min="0" max="100" value="62" aria-label="${escapeHtml(tr('kitProgress'))}" />
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitSelection'))}</div>
        <div class="kit-row toggles">
          <label class="check"><input type="checkbox" checked /> ${escapeHtml(tr('kitCheckbox'))}</label>
          <label class="check"><input type="radio" name="od-kit-r" checked /> ${escapeHtml(tr('kitRadioA'))}</label>
          <label class="check"><input type="radio" name="od-kit-r" /> ${escapeHtml(tr('kitRadioB'))}</label>
          <span class="switch on"><span class="knob"></span></span><span class="switch-label">${escapeHtml(tr('kitSwitch'))}</span>
          <span class="seg"><button type="button" class="seg-opt active">${escapeHtml(tr('kitRadioA'))}</button><button type="button" class="seg-opt">${escapeHtml(tr('kitRadioB'))}</button></span>
        </div>
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitBadges'))}</div>
        <div class="kit-row">
          <span class="badge solid">${escapeHtml(tr('kitBadgeNew'))}</span>
          <span class="badge soft">${escapeHtml(tr('kitBadgeBeta'))}</span>
          <span class="badge outline">${escapeHtml(tr('kitBadgePro'))}</span>
          <span class="dot-status"><span class="dot"></span>${escapeHtml(tr('kitTableStatus'))}</span>
          <span class="tag">${escapeHtml(tr('kitTabOverview'))}<span class="tag-x">&times;</span></span>
          <span class="tag">${escapeHtml(tr('kitTabActivity'))}<span class="tag-x">&times;</span></span>
          <span class="tip-wrap">${escapeHtml(tr('kitTooltip'))}<span class="tip">${escapeHtml(tr('kitTooltipText'))}</span></span>
        </div>
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitAvatars'))}</div>
        <div class="kit-row" style="gap:18px">
          <span class="avatar-group">${avatarMark}<span class="avatar initials">AT</span><span class="avatar initials">GH</span><span class="avatar more">+5</span></span>
          <span class="user"><span class="avatar initials">AL</span><span class="user-meta"><b>Ada Lovelace</b><span class="muted-s">${escapeHtml(tr('kitTabOverview'))}</span></span></span>
        </div>
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitNav'))}</div>
        <div class="tabs"><button type="button" class="tab active">${escapeHtml(tr('kitTabOverview'))}</button><button type="button" class="tab">${escapeHtml(tr('kitTabActivity'))}</button><button type="button" class="tab">${escapeHtml(tr('kitTabSettings'))}</button></div>
        <nav class="crumbs">Home<span>/</span>${escapeHtml(tr('kitTabOverview'))}<span>/</span><b>${escapeHtml(tr('kitTabSettings'))}</b></nav>
        <div class="kit-row" style="justify-content:space-between">
          <div class="steps"><span class="step done"><i>1</i>${escapeHtml(tr('kitStep1'))}</span><span class="step active"><i>2</i>${escapeHtml(tr('kitStep2'))}</span><span class="step"><i>3</i>${escapeHtml(tr('kitStep3'))}</span></div>
          <div class="pager"><button type="button" class="page">&#8249;</button><button type="button" class="page active">1</button><button type="button" class="page">2</button><button type="button" class="page">3</button><button type="button" class="page">&#8250;</button></div>
        </div>
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitData'))}</div>
        <div class="stats">
          <div class="stat"><span class="stat-k">${escapeHtml(tr('kitStatVisitors'))}</span><b class="stat-v">128.4k</b><span class="stat-d up">+12.5%</span></div>
          <div class="stat"><span class="stat-k">${escapeHtml(tr('kitStatRevenue'))}</span><b class="stat-v">$48,920</b><span class="stat-d up">+4.2%</span></div>
          <div class="stat"><span class="stat-k">${escapeHtml(tr('kitStatChurn'))}</span><b class="stat-v">1.8%</b><span class="stat-d down">-0.4%</span></div>
        </div>
        <table class="ui-table"><thead><tr><th>${escapeHtml(tr('kitTableHead1'))}</th><th>${escapeHtml(tr('kitTableHead2'))}</th><th>${escapeHtml(tr('kitTableHead3'))}</th></tr></thead><tbody>
          <tr><td><span class="user-cell"><span class="avatar initials xs">AL</span>Ada Lovelace</span></td><td>${escapeHtml(tr('kitTabOverview'))}</td><td><span class="badge soft">${escapeHtml(tr('kitTableStatus'))}</span></td></tr>
          <tr><td><span class="user-cell"><span class="avatar initials xs">AT</span>Alan Turing</span></td><td>${escapeHtml(tr('kitTabActivity'))}</td><td><span class="badge outline">${escapeHtml(tr('kitTablePending'))}</span></td></tr>
        </tbody></table>
        <ul class="list">
          <li class="list-item"><span class="li-dot"></span><span class="li-main"><b>${escapeHtml(content.headings[0] || content.title)}</b><span class="muted-s">${escapeHtml(tr('kitListMeta'))}</span></span><span class="badge soft">${escapeHtml(tr('kitBadgeNew'))}</span></li>
          <li class="list-item"><span class="li-dot"></span><span class="li-main"><b>${escapeHtml(content.headings[1] || content.title)}</b><span class="muted-s">${escapeHtml(tr('kitListMeta'))}</span></span><span class="chevron">&#8250;</span></li>
        </ul>
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitFeedback'))}</div>
        <div class="alert"><span class="alert-icon">&#9733;</span><span>${escapeHtml(tr('kitAlert'))}</span></div>
        <div class="toast"><span class="toast-dot"></span><span><b>${escapeHtml(tr('kitToastTitle'))}</b><span class="muted-s">${escapeHtml(tr('kitToastBody'))}</span></span><span class="toast-x">&times;</span></div>
        <div class="kit-row" style="gap:18px"><span class="progress" style="flex:1"><span style="width:62%"></span></span><span class="spin dark"></span></div>
      </div>
      <div class="kit-group two">
        <div class="ui-card">
          <div class="ui-card-title">${escapeHtml(tr('kitCardTitle'))}</div>
          <p class="ui-card-body">${escapeHtml(tr('kitCardBody'))}</p>
          <div class="kit-row"><button type="button" class="btn primary sm">${escapeHtml(tr('kitPrimary'))}</button><button type="button" class="btn ghost sm">${escapeHtml(tr('kitSecondary'))}</button></div>
        </div>
        <div class="menu">
          <div class="menu-item">${escapeHtml(tr('kitTabOverview'))}<span class="menu-k">&#8984;O</span></div>
          <div class="menu-item active">${escapeHtml(tr('kitTabActivity'))}<span class="menu-k">&#8984;A</span></div>
          <div class="menu-sep"></div>
          <div class="menu-item">${escapeHtml(tr('kitTabSettings'))}</div>
        </div>
      </div>
      <div class="kit-group">
        <div class="kit-label">${escapeHtml(tr('kitOverlays'))}</div>
        <div class="dialog">
          <div class="dialog-head"><b>${escapeHtml(tr('kitDialogTitle'))}</b><span class="toast-x">&times;</span></div>
          <p class="dialog-body">${escapeHtml(tr('kitDialogBody'))}</p>
          <div class="dialog-foot"><button type="button" class="btn ghost sm">${escapeHtml(tr('kitCancel'))}</button><button type="button" class="btn primary sm">${escapeHtml(tr('kitConfirm'))}</button></div>
        </div>
      </div>
    </div>`;

    const json = escapeScriptJson(JSON.stringify(data, null, 2));
    const lbl = escapeScriptJson(
      JSON.stringify({
        close: tr('brandClose'),
        prev: tr('brandPrevImage'),
        next: tr('brandNextImage'),
        all: tr('brandAllImages', { count: images.length }),
      }),
    );
    const api = globalThis.OD_CLIPPER_I18N || I18N;
    const htmlLocale = api && api.htmlLang ? api.htmlLang(activeLocale) : activeLocale;
    const dir = api && api.isRtl && api.isRtl(activeLocale) ? 'rtl' : 'ltr';

    return `<!doctype html>
<html lang="${escapeHtml(htmlLocale)}" dir="${escapeHtml(dir)}">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${escapeHtml(content.title)} — ${escapeHtml(tr('brandPageTitleSuffix'))}</title>
<meta name="od-library-kind" content="design-system" />
<style data-brand-fonts>${safeCss(fontCss)}</style>
<style>
  :root {
    color-scheme: light;
    --paper: #faf9f5;
    --surface: #ffffff;
    --ink: #1a1a18;
    --ink-mute: #57564f;
    --ink-faint: #8a887f;
    --line: #e7e5dc;
    --line-soft: #efeee7;
    --accent: ${accent};
    --accent-ink: ${ink};
    --on-accent: ${onAccent};
    --ok: #3d7a4f;
    --err: #b4453a;
    --radius: 14px;
    --ui-radius: ${uiRadius};
    --btn-bg: ${atoms.button.bg};
    --btn-fg: ${atoms.button.fg};
    --btn-bd: ${atoms.button.border};
    --btn-bw: ${atoms.button.borderWidth}px;
    --btn-radius: ${atoms.button.radius}px;
    --btn-px: ${atoms.button.padX}px;
    --btn-py: ${atoms.button.padY}px;
    --btn-weight: ${atoms.button.weight};
    --btn-transform: ${atoms.button.transform};
    --btn-ls: ${atoms.button.letterSpacing};
    --btn-shadow: ${atoms.button.shadow};
    --inp-bg: ${atoms.input.bg};
    --inp-fg: ${atoms.input.fg};
    --inp-bd: ${atoms.input.border};
    --inp-bw: ${atoms.input.borderWidth}px;
    --inp-radius: ${atoms.input.radius}px;
    --inp-px: ${atoms.input.padX}px;
    --inp-py: ${atoms.input.padY}px;
    --inp-shadow: ${atoms.input.shadow};
    --card-bg: ${atoms.card.bg};
    --card-bd: ${atoms.card.border};
    --card-bw: ${atoms.card.borderWidth}px;
    --card-radius: ${atoms.card.radius}px;
    --card-shadow: ${atoms.card.shadow};
    --card-pad: ${atoms.card.pad}px;
    --font-display: ${fontDisplay};
    --font-body: ${fontBody};
    --font-mono: ${fontMono};
  }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { background: var(--paper); color: var(--ink); font-family: var(--font-body); font-size: 15px; line-height: 1.5; -webkit-font-smoothing: antialiased; }
  .wrap { max-width: 1040px; margin: 0 auto; padding: 40px 28px 96px; }
  a { color: inherit; }
  .muted { color: var(--ink-faint); font-size: 13px; }

  header.kit-head { display: flex; flex-wrap: wrap; align-items: flex-start; justify-content: space-between; gap: 16px; }
  .kit-id { display: flex; align-items: center; gap: 14px; min-width: 0; }
  .id-mark { width: 52px; height: 52px; flex: none; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line); border-radius: 13px; overflow: hidden; }
  .id-mark img { max-width: 78%; max-height: 78%; object-fit: contain; }
  .id-mark.initial { font-family: var(--font-display); font-weight: 700; font-size: 24px; background: var(--surface); color: var(--accent-ink); }
  .kit-id-text { min-width: 0; }
  .kit-title { font-family: var(--font-display); font-size: 38px; line-height: 1.05; font-weight: 600; letter-spacing: -0.02em; margin: 0; word-break: break-word; }
  .kit-tagline { margin: 6px 0 0; font-size: 16px; color: var(--ink-mute); max-width: 62ch; }
  .kit-source { margin-top: 6px; display: inline-flex; align-items: center; gap: 5px; font-size: 12px; color: var(--ink-faint); text-decoration: none; }
  .kit-source:hover { color: var(--accent-ink); }
  .status-pill { display: inline-flex; align-items: center; gap: 7px; border-radius: 999px; padding: 4px 11px 4px 9px; font-size: 12px; font-weight: 500; border: 1px solid var(--line); background: var(--surface); color: var(--ink-mute); white-space: nowrap; }
  .status-pill .dot { width: 7px; height: 7px; border-radius: 50%; background: var(--ok); }

  .hero { margin-top: 22px; border: 1px solid var(--line-soft); border-radius: var(--radius); overflow: hidden; background: var(--line-soft); aspect-ratio: 16 / 5; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
  .hero img { width: 100%; height: 100%; object-fit: cover; display: block; }

  .sec { margin-top: 40px; }
  .sec-head { display: flex; align-items: baseline; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
  .sec-title { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.14em; color: var(--ink-faint); margin: 0 0 12px; }
  .sec-head .sec-title { margin: 0; }
  .sec-sub { margin: -4px 0 14px; color: var(--ink-faint); font-size: 13px; }
  .grid-2, .grid-top { display: grid; gap: 28px; grid-template-columns: 1fr; }
  @media (min-width: 860px) { .grid-2 { grid-template-columns: 1fr 1fr; } .grid-top { grid-template-columns: 1fr 2fr; } }
  .card { border: 1px solid var(--line-soft); background: var(--surface); border-radius: var(--radius); padding: 18px; box-shadow: 0 1px 2px rgba(0,0,0,.03); }

  /* Logo */
  .logo-stage { display: flex; min-height: 150px; align-items: center; justify-content: center; border: 1px solid var(--line-soft); border-radius: var(--radius); padding: 24px; }
  .logo-stage img { max-height: 88px; max-width: 100%; object-fit: contain; }
  .logo-stage.empty { flex-direction: column; gap: 8px; border-style: dashed; border-color: var(--line); color: var(--ink-faint); }
  .logo-initial { font-family: var(--font-display); font-weight: 800; font-size: 46px; line-height: 1; color: var(--accent-ink); }
  .logo-empty-note { font-size: 13px; }
  .logo-thumbs { margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap; }
  .logo-thumb { width: 42px; height: 42px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--line-soft); border-radius: 9px; padding: 6px; cursor: pointer; background: var(--surface); }
  .logo-thumb.active { border-color: var(--accent); }
  .logo-thumb img { max-width: 100%; max-height: 100%; object-fit: contain; }

  /* Typography */
  .fonts { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); margin-bottom: 14px; }
  @media (min-width: 560px) { .fonts { grid-template-columns: repeat(3, 1fr); } }
  .font-tile { border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
  .font-tile .ag { display: flex; align-items: center; justify-content: center; height: 100px; font-size: 54px; line-height: 1; color: var(--ink); background: var(--line-soft); }
  .font-tile .ft-meta { padding: 9px 11px 11px; }
  .font-tile .ft-name { font-size: 13px; font-weight: 600; line-height: 1.2; word-break: break-word; }
  .font-tile .ft-role { font-size: 11px; color: var(--ink-faint); margin-top: 1px; text-transform: uppercase; letter-spacing: .06em; }
  .type-row { border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); padding: 16px 18px; }
  .type-row + .type-row { margin-top: 12px; }
  .type-meta { display: flex; align-items: baseline; justify-content: space-between; gap: 14px; }
  .type-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-faint); }
  .type-font { font-size: 12px; color: var(--ink-mute); text-align: right; word-break: break-word; }
  .type-sample { margin: 8px 0 0; line-height: 1.15; word-break: break-word; }

  /* Palette */
  .palette { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 560px) { .palette { grid-template-columns: repeat(4, 1fr); } }
  @media (min-width: 920px) { .palette { grid-template-columns: repeat(8, 1fr); } }
  .swatch { overflow: hidden; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); box-shadow: 0 1px 2px rgba(0,0,0,.03); }
  .swatch-chip { height: 84px; display: flex; align-items: flex-end; padding: 8px; }
  .swatch-chip .hex { font-family: var(--font-mono); font-size: 11px; }
  .swatch-body { padding: 9px 10px 11px; }
  .swatch-name { font-size: 13px; font-weight: 500; line-height: 1.2; }
  .swatch-role { font-size: 11px; color: var(--ink-faint); margin-top: 1px; }
  .swatch-usage { font-size: 11px; color: var(--ink-mute); margin-top: 5px; line-height: 1.35; }

  /* Voice */
  .chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .chip { border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 500; background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-ink); }
  .tone { margin: 12px 0 0; font-size: 14px; color: var(--ink-mute); line-height: 1.55; }
  .pillars { margin: 12px 0 0; padding: 0; list-style: none; font-size: 14px; }
  .pillars li { display: flex; gap: 8px; margin-top: 4px; }
  .pillars .dash { color: var(--accent-ink); }

  /* Imagery */
  .imagery p { margin: 0; font-size: 14px; }
  .imagery p + p { margin-top: 6px; color: var(--ink-mute); }
  .imagery .k { font-weight: 600; color: var(--ink); }
  .posture { margin-top: 12px; border-top: 1px solid var(--line-soft); padding-top: 12px; }
  .mini-label { font-size: 11px; text-transform: uppercase; letter-spacing: .08em; color: var(--ink-faint); }
  .posture ul { margin: 6px 0 0; padding-left: 18px; font-size: 12px; color: var(--ink-mute); }
  .posture ul li { margin-top: 2px; }

  /* Gallery */
  .view-all { border: 1px solid var(--line); background: var(--surface); color: var(--ink-mute); border-radius: 999px; padding: 4px 12px; font-size: 12px; font-weight: 500; cursor: pointer; font-family: inherit; transition: border-color .2s cubic-bezier(.23,1,.32,1), color .2s cubic-bezier(.23,1,.32,1); }
  .view-all:hover { border-color: var(--accent); color: var(--accent-ink); }
  .gallery { display: grid; gap: 12px; grid-template-columns: repeat(2, 1fr); }
  @media (min-width: 560px) { .gallery { grid-template-columns: repeat(3, 1fr); } }
  @media (min-width: 920px) { .gallery { grid-template-columns: repeat(4, 1fr); } }
  .shot { display: block; text-align: left; padding: 0; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); overflow: hidden; box-shadow: 0 1px 2px rgba(0,0,0,.03); cursor: pointer; font-family: inherit; transition: border-color .14s ease, transform .14s ease; }
  .shot:hover { border-color: var(--accent); transform: translateY(-1px); }
  .shot:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .shot-frame { display: block; aspect-ratio: 4 / 3; background: var(--line-soft); }
  .shot-frame img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .shot-cap { display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden; padding: 8px 10px 10px; font-size: 12px; font-weight: 500; line-height: 1.3; color: var(--ink); }

  /* Component kit — styled from the captured atoms (button / input / card) */
  .kit { display: grid; gap: 24px; border: 1px solid var(--line-soft); background: var(--surface); border-radius: var(--radius); padding: 24px; box-shadow: 0 1px 2px rgba(0,0,0,.03); }
  .kit-group { display: grid; gap: 12px; }
  .kit-group.two { grid-template-columns: 1fr; }
  @media (min-width: 640px) { .kit-group.two { grid-template-columns: 1.3fr 1fr; align-items: stretch; gap: 16px; } }
  .kit-label { font-size: 11px; font-weight: 600; text-transform: uppercase; letter-spacing: .1em; color: var(--ink-faint); }
  .kit-row { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; }
  .kit-grid { display: grid; gap: 12px; grid-template-columns: 1fr; }
  @media (min-width: 560px) { .kit-grid { grid-template-columns: 1fr 1fr; } }
  .muted-s { color: var(--ink-faint); font-size: 12px; }
  /* Buttons (captured look) */
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 7px; padding: var(--btn-py) var(--btn-px); border-radius: var(--btn-radius); border: var(--btn-bw) solid transparent; font-family: var(--font-body); font-size: 13px; font-weight: var(--btn-weight); text-transform: var(--btn-transform); letter-spacing: var(--btn-ls); line-height: 1; cursor: pointer; }
  .btn.primary { background: var(--btn-bg); color: var(--btn-fg); border-color: var(--btn-bd); box-shadow: var(--btn-shadow); }
  .btn.secondary { background: var(--surface); color: var(--ink); border: var(--btn-bw) solid var(--line); }
  .btn.ghost { background: transparent; color: var(--accent-ink); }
  .btn.lg { font-size: 15px; padding: calc(var(--btn-py) + 3px) calc(var(--btn-px) + 6px); }
  .btn.sm { font-size: 12px; padding: calc(var(--btn-py) - 3px) calc(var(--btn-px) - 5px); }
  .btn.icon { padding: 0; width: 38px; height: 38px; background: var(--surface); color: var(--ink); border: var(--btn-bw) solid var(--line); }
  .btn[disabled] { opacity: .45; cursor: not-allowed; }
  .btn .ic { font-size: 13px; }
  .spin { width: 13px; height: 13px; border-radius: 50%; border: 2px solid color-mix(in srgb, var(--btn-fg) 40%, transparent); border-top-color: var(--btn-fg); animation: od-spin .7s linear infinite; display: inline-block; }
  .spin.dark { border-color: var(--line); border-top-color: var(--accent); width: 18px; height: 18px; }
  @keyframes od-spin { to { transform: rotate(360deg); } }
  /* Inputs (captured look) */
  .field-label { display: grid; gap: 5px; font-size: 12px; font-weight: 600; color: var(--ink-mute); }
  .input { width: 100%; padding: var(--inp-py) var(--inp-px); border: var(--inp-bw) solid var(--inp-bd); border-radius: var(--inp-radius); background: var(--inp-bg); color: var(--inp-fg); box-shadow: var(--inp-shadow); font: 400 14px/1.4 var(--font-body); }
  .input:focus { outline: 2px solid color-mix(in srgb, var(--accent) 45%, transparent); outline-offset: 1px; border-color: var(--accent); }
  .input[disabled] { opacity: .55; }
  .input.textarea { min-height: 64px; resize: none; line-height: 1.5; }
  select.input { appearance: none; -webkit-appearance: none; }
  .search { position: relative; display: block; }
  .search-ic { position: absolute; left: 11px; top: 50%; transform: translateY(-50%); color: var(--ink-faint); font-size: 13px; pointer-events: none; }
  .search .input { padding-left: 30px; }
  .range { width: 100%; accent-color: var(--accent); }
  .toggles { gap: 16px; }
  .check { display: inline-flex; align-items: center; gap: 7px; font-size: 13px; color: var(--ink); cursor: pointer; }
  .check input { accent-color: var(--accent); width: 15px; height: 15px; }
  .switch { display: inline-flex; width: 38px; height: 22px; border-radius: 999px; background: var(--line); position: relative; }
  .switch.on { background: var(--accent); }
  .switch .knob { position: absolute; top: 2px; left: 2px; width: 18px; height: 18px; border-radius: 50%; background: #fff; box-shadow: 0 1px 2px rgba(0,0,0,.3); }
  .switch.on .knob { left: 18px; }
  .switch-label { font-size: 13px; color: var(--ink-mute); }
  .seg { display: inline-flex; border: 1px solid var(--line); border-radius: 9px; overflow: hidden; }
  .seg-opt { border: 0; background: var(--surface); color: var(--ink-mute); padding: 7px 14px; font: 500 12px/1 var(--font-body); cursor: pointer; }
  .seg-opt.active { background: var(--accent); color: var(--on-accent); }
  /* Badges, tags, tooltip */
  .badge { display: inline-flex; align-items: center; border-radius: 999px; padding: 3px 10px; font-size: 12px; font-weight: 600; }
  .badge.solid { background: var(--accent); color: var(--on-accent); }
  .badge.soft { background: color-mix(in srgb, var(--accent) 14%, transparent); color: var(--accent-ink); }
  .badge.outline { border: 1px solid var(--line); color: var(--ink-mute); }
  .dot-status { display: inline-flex; align-items: center; gap: 6px; font-size: 12px; color: var(--ink-mute); }
  .dot-status .dot { width: 8px; height: 8px; border-radius: 50%; background: var(--ok); }
  .tag { display: inline-flex; align-items: center; gap: 6px; border: 1px solid var(--line); border-radius: 8px; padding: 3px 8px; font-size: 12px; color: var(--ink); }
  .tag-x { color: var(--ink-faint); cursor: pointer; }
  .tip-wrap { position: relative; font-size: 12px; color: var(--ink-mute); border-bottom: 1px dotted var(--ink-faint); cursor: default; }
  .tip { position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%); background: var(--ink); color: #fff; font-size: 11px; padding: 5px 8px; border-radius: 6px; white-space: nowrap; opacity: 0; pointer-events: none; transition: opacity .14s ease; z-index: 2; }
  .tip-wrap:hover .tip { opacity: 1; }
  /* Avatars */
  .avatar { width: 34px; height: 34px; border-radius: 50%; overflow: hidden; display: inline-flex; align-items: center; justify-content: center; background: color-mix(in srgb, var(--accent) 16%, var(--surface)); color: var(--accent-ink); font-size: 12px; font-weight: 700; flex: none; }
  .avatar img { width: 100%; height: 100%; object-fit: cover; }
  .avatar.xs { width: 22px; height: 22px; font-size: 10px; }
  .avatar-group { display: inline-flex; }
  .avatar-group > * { margin-left: -8px; box-shadow: 0 0 0 2px var(--surface); }
  .avatar-group > *:first-child { margin-left: 0; }
  .avatar.more { background: var(--line-soft); color: var(--ink-mute); }
  .user { display: inline-flex; align-items: center; gap: 9px; }
  .user-meta { display: flex; flex-direction: column; }
  .user-meta b { font-size: 13px; }
  .user-cell { display: inline-flex; align-items: center; gap: 8px; }
  /* Navigation */
  .tabs { display: inline-flex; gap: 2px; border-bottom: 1px solid var(--line-soft); }
  .tab { border: 0; background: transparent; cursor: pointer; padding: 8px 12px; font: 500 13px/1 var(--font-body); color: var(--ink-mute); border-bottom: 2px solid transparent; margin-bottom: -1px; }
  .tab.active { color: var(--accent-ink); border-bottom-color: var(--accent); font-weight: 600; }
  .crumbs { display: flex; align-items: center; gap: 7px; font-size: 13px; color: var(--ink-mute); }
  .crumbs span { color: var(--ink-faint); }
  .crumbs b { color: var(--ink); font-weight: 600; }
  .steps { display: flex; align-items: center; gap: 14px; flex-wrap: wrap; }
  .step { display: inline-flex; align-items: center; gap: 7px; font-size: 12px; color: var(--ink-faint); }
  .step i { width: 22px; height: 22px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; border: 1px solid var(--line); font-style: normal; font-size: 11px; }
  .step.active { color: var(--ink); }
  .step.active i { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .step.done { color: var(--ink-mute); }
  .step.done i { background: color-mix(in srgb, var(--accent) 16%, transparent); color: var(--accent-ink); border-color: transparent; }
  .pager { display: inline-flex; gap: 4px; }
  .page { min-width: 30px; height: 30px; border: 1px solid var(--line); background: var(--surface); border-radius: 8px; color: var(--ink-mute); cursor: pointer; font: 500 12px/1 var(--font-body); }
  .page.active { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  /* Data display */
  .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
  .stat { border: var(--card-bw) solid var(--card-bd); border-radius: var(--card-radius); padding: 14px; background: var(--card-bg); }
  .stat-k { font-size: 12px; color: var(--ink-faint); }
  .stat-v { display: block; font-size: 22px; margin: 4px 0 2px; }
  .stat-d { font-size: 12px; font-weight: 600; }
  .stat-d.up { color: var(--ok); }
  .stat-d.down { color: var(--err); }
  .ui-table { width: 100%; border-collapse: collapse; font-size: 13px; }
  .ui-table th, .ui-table td { text-align: left; padding: 9px 10px; border-bottom: 1px solid var(--line-soft); }
  .ui-table th { font-size: 11px; text-transform: uppercase; letter-spacing: .06em; color: var(--ink-faint); font-weight: 600; }
  .ui-table tbody tr:last-child td { border-bottom: 0; }
  .list { list-style: none; margin: 0; padding: 0; border: var(--card-bw) solid var(--card-bd); border-radius: var(--card-radius); overflow: hidden; }
  .list-item { display: flex; align-items: center; gap: 12px; padding: 12px 14px; border-bottom: 1px solid var(--line-soft); }
  .list-item:last-child { border-bottom: 0; }
  .li-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--accent); flex: none; }
  .li-main { flex: 1; display: flex; flex-direction: column; gap: 2px; font-size: 13px; }
  .chevron { color: var(--ink-faint); }
  /* Card, alert, toast, progress */
  .ui-card { background: var(--card-bg); border: var(--card-bw) solid var(--card-bd); border-radius: var(--card-radius); box-shadow: var(--card-shadow); padding: var(--card-pad); display: grid; gap: 8px; align-content: start; }
  .ui-card-title { font-weight: 600; font-size: 14px; }
  .ui-card-body { margin: 0; font-size: 13px; color: var(--ink-mute); line-height: 1.5; }
  .alert { display: flex; gap: 10px; align-items: flex-start; border: 1px solid color-mix(in srgb, var(--accent) 30%, var(--line)); background: color-mix(in srgb, var(--accent) 8%, var(--surface)); border-radius: var(--radius); padding: 14px 16px; font-size: 13px; color: var(--ink); }
  .alert-icon { color: var(--accent-ink); font-size: 14px; line-height: 1.4; }
  .toast { display: flex; align-items: center; gap: 11px; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); padding: 12px 14px; box-shadow: 0 6px 20px rgba(0,0,0,.08); }
  .toast-dot { width: 9px; height: 9px; border-radius: 50%; background: var(--ok); flex: none; }
  .toast b { font-size: 13px; display: block; }
  .toast > span:nth-child(2) { flex: 1; display: flex; flex-direction: column; gap: 1px; }
  .toast-x { color: var(--ink-faint); cursor: pointer; font-size: 16px; }
  .progress { height: 8px; border-radius: 999px; background: var(--line-soft); overflow: hidden; display: block; }
  .progress span { display: block; height: 100%; background: var(--accent); border-radius: 999px; }
  /* Menu + dialog */
  .menu { border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); padding: 6px; box-shadow: 0 8px 26px rgba(0,0,0,.08); align-self: start; }
  .menu-item { display: flex; align-items: center; justify-content: space-between; gap: 16px; padding: 8px 10px; border-radius: 8px; font-size: 13px; cursor: default; }
  .menu-item.active { background: color-mix(in srgb, var(--accent) 12%, transparent); color: var(--accent-ink); }
  .menu-k { font-size: 11px; color: var(--ink-faint); }
  .menu-sep { height: 1px; background: var(--line-soft); margin: 6px 4px; }
  .dialog { max-width: 380px; border: 1px solid var(--line-soft); border-radius: var(--radius); background: var(--surface); box-shadow: 0 16px 50px rgba(0,0,0,.16); overflow: hidden; }
  .dialog-head { display: flex; align-items: center; justify-content: space-between; padding: 14px 16px; border-bottom: 1px solid var(--line-soft); font-size: 14px; }
  .dialog-body { margin: 0; padding: 16px; font-size: 13px; color: var(--ink-mute); line-height: 1.55; }
  .dialog-foot { display: flex; justify-content: flex-end; gap: 8px; padding: 12px 16px; border-top: 1px solid var(--line-soft); }
  /* Brand asset templates */
  .assets { display: grid; gap: 16px; grid-template-columns: 1fr; }
  @media (min-width: 620px) { .assets { grid-template-columns: 1fr 1fr; } }
  @media (min-width: 920px) { .assets { grid-template-columns: 1fr 1fr 1fr; } }
  .asset { display: block; text-align: left; padding: 0; border: 1px solid var(--line-soft); border-radius: 12px; background: var(--surface); overflow: hidden; cursor: pointer; font-family: inherit; transition: border-color .14s ease, transform .14s ease; }
  .asset:hover { border-color: var(--accent); transform: translateY(-1px); }
  .asset:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
  .asset-frame { display: block; aspect-ratio: 16 / 10; background: var(--line-soft); position: relative; overflow: hidden; }
  .asset-frame iframe { position: absolute; top: 0; left: 0; width: 200%; height: 200%; border: 0; transform: scale(.5); transform-origin: top left; pointer-events: none; background: #fff; }
  .asset-meta { display: block; padding: 11px 13px; }
  .asset-name { display: flex; align-items: center; justify-content: space-between; gap: 8px; font-size: 13px; font-weight: 600; }
  .asset-open { font-size: 11px; color: var(--accent-ink); font-weight: 500; }
  .asset-desc { display: block; font-size: 11px; color: var(--ink-faint); margin-top: 2px; }
  /* Asset preview modal */
  #ov-asset .ov-panel { top: 4vh; left: 50%; transform: translate(-50%,0) scale(.96); width: min(1120px, 94vw); height: 92vh; background: #fff; border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 16px 60px rgba(0,0,0,.42); }
  #ov-asset.in .ov-panel { transform: translate(-50%,0) scale(1); }
  .asset-bar { display: flex; align-items: center; justify-content: space-between; gap: 10px; padding: 12px 18px; border-bottom: 1px solid var(--line); background: var(--surface); }
  .asset-bar .ab-title { font-size: 14px; font-weight: 600; }
  .asset-bar .ab-sub { font-size: 12px; color: var(--ink-faint); margin-left: 8px; font-weight: 400; }
  .asset-modal-frame { flex: 1; width: 100%; border: 0; display: block; background: #fff; }

  .data-note { margin-top: 40px; color: var(--ink-faint); font-size: 12px; }
  .data-note code { font-family: var(--font-mono); }

  /* Overlays (lightbox + masonry) */
  .ov { position: fixed; inset: 0; z-index: 60; display: none; }
  .ov.open { display: block; }
  .ov-back { position: absolute; inset: 0; background: rgba(20,19,17,.74); opacity: 0; transition: opacity .14s cubic-bezier(.23,1,.32,1); }
  .ov.in .ov-back { opacity: 1; transition-duration: .2s; }
  .ov-panel { position: absolute; opacity: 0; transform: scale(.92); transition: opacity .14s cubic-bezier(.23,1,.32,1), transform .14s cubic-bezier(.23,1,.32,1); }
  .ov.in .ov-panel { opacity: 1; transform: scale(1); transition-duration: .2s; }
  .ov-close { position: absolute; top: 14px; right: 16px; z-index: 2; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center; border: 0; border-radius: 999px; background: rgba(255,255,255,.92); color: #1a1a18; font-size: 22px; line-height: 1; cursor: pointer; box-shadow: 0 2px 10px rgba(0,0,0,.22); }
  #ov-light { z-index: 70; }
  #ov-light .ov-panel { top: 50%; left: 50%; transform: translate(-50%,-50%) scale(.92); display: flex; flex-direction: column; align-items: center; }
  #ov-light.in .ov-panel { transform: translate(-50%,-50%) scale(1); }
  #ov-light img { max-width: 92vw; max-height: 82vh; object-fit: contain; border-radius: 12px; box-shadow: 0 12px 48px rgba(0,0,0,.5); background: #fff; }
  .light-cap { margin-top: 12px; color: rgba(255,255,255,.92); font-size: 13px; text-align: center; max-width: 80vw; }
  .light-nav { position: absolute; top: 50%; transform: translateY(-50%); width: 44px; height: 44px; border: 0; border-radius: 999px; background: rgba(255,255,255,.88); color: #1a1a18; font-size: 24px; cursor: pointer; display: flex; align-items: center; justify-content: center; box-shadow: 0 2px 12px rgba(0,0,0,.28); }
  .light-prev { left: 3vw; } .light-next { right: 3vw; }
  #ov-grid .ov-panel { top: 4vh; left: 50%; transform: translate(-50%,0) scale(.96); width: min(980px, 92vw); height: 92vh; background: var(--paper); border-radius: var(--radius); overflow: hidden; display: flex; flex-direction: column; box-shadow: 0 16px 60px rgba(0,0,0,.42); }
  #ov-grid.in .ov-panel { transform: translate(-50%,0) scale(1); }
  .grid-bar { display: flex; align-items: center; justify-content: space-between; padding: 14px 20px; border-bottom: 1px solid var(--line); }
  .grid-bar h3 { margin: 0; font-family: var(--font-display); font-size: 18px; }
  .grid-scroll { overflow-y: auto; padding: 16px 20px 28px; }
  .masonry { columns: 2; column-gap: 12px; }
  @media (min-width: 560px) { .masonry { columns: 3; } }
  @media (min-width: 860px) { .masonry { columns: 4; } }
  .masonry .m-item { break-inside: avoid; margin: 0 0 12px; border-radius: 10px; overflow: hidden; border: 1px solid var(--line-soft); background: var(--surface); cursor: pointer; transition: transform .2s cubic-bezier(.23,1,.32,1); }
  .masonry .m-item:hover { transform: translateY(-2px); }
  .masonry .m-item img { width: 100%; display: block; }
  .icon-x { border: 0; background: transparent; font-size: 22px; line-height: 1; cursor: pointer; color: var(--ink-mute); padding: 4px 9px; border-radius: 8px; }
  .icon-x:hover { background: var(--line-soft); color: var(--ink); }
  @media (max-width: 600px) { .wrap { padding: 28px 18px 72px; } .kit-title { font-size: 30px; } }
</style>
</head>
<body>
<div class="wrap">
  <header class="kit-head">
    <div class="kit-id">${headerMark}<div class="kit-id-text"><h1 class="kit-title">${escapeHtml(content.title)}</h1>${content.description ? `<p class="kit-tagline">${escapeHtml(content.description)}</p>` : ''}${content.url ? `<a class="kit-source" href="${escapeHtml(content.url)}" target="_blank" rel="noreferrer noopener">${escapeHtml(content.domain || content.url)} ↗</a>` : ''}</div></div>
    <span class="status-pill"><span class="dot"></span>${escapeHtml(tr('brandReady'))}</span>
  </header>
  ${heroHtml}
  <div class="sec grid-top">
    <section><h2 class="sec-title">${escapeHtml(tr('brandLogo'))}</h2>${logoBlock}</section>
    <section><h2 class="sec-title">${escapeHtml(tr('brandTypography'))}</h2>${fontTilesHtml}${typeRows}</section>
  </div>
  <section class="sec"><h2 class="sec-title">${escapeHtml(tr('brandPalette'))}</h2><div class="palette">${paletteHtml}</div></section>
  <div class="sec grid-2">
    <section><h2 class="sec-title">${escapeHtml(tr('brandVoiceTone'))}</h2>${voiceHtml}</section>
    <section><h2 class="sec-title">${escapeHtml(tr('brandImageryLayout'))}</h2>${imageryHtml}</section>
  </div>
  ${gallery}
  <section class="sec"><h2 class="sec-title">${escapeHtml(tr('brandComponentKit'))}</h2><p class="sec-sub">${escapeHtml(tr('dsKitSub'))}</p>${kit}</section>
  ${assetsSection}
  <p class="data-note">${tr('brandDataNote')}</p>
</div>
<script type="application/json" id="od-design-system-data">${json}</script>
<script>
(function () {
  var dataEl = document.getElementById('od-design-system-data');
  var DATA = {};
  try { DATA = JSON.parse(dataEl && dataEl.textContent ? dataEl.textContent : '{}'); } catch (e) {}
  var LBL = ${lbl};
  var SAMPLES = ((DATA.assets && DATA.assets.images) || []).map(function (s) { return { file: s.src, caption: s.label || '' }; });

  var logoImg = document.getElementById('od-logo-img');
  Array.prototype.forEach.call(document.querySelectorAll('.logo-thumb'), function (b) {
    b.addEventListener('click', function () {
      if (logoImg) logoImg.src = b.getAttribute('data-src');
      Array.prototype.forEach.call(document.querySelectorAll('.logo-thumb'), function (x) { x.classList.remove('active'); });
      b.classList.add('active');
    });
  });

  Array.prototype.forEach.call(document.querySelectorAll('.tabs'), function (group) {
    Array.prototype.forEach.call(group.querySelectorAll('.tab'), function (tb) {
      tb.addEventListener('click', function () {
        Array.prototype.forEach.call(group.querySelectorAll('.tab'), function (x) { x.classList.remove('active'); });
        tb.classList.add('active');
      });
    });
  });

  var stack = [];
  function mk(id) { var ov = document.createElement('div'); ov.className = 'ov'; ov.id = id; var bk = document.createElement('div'); bk.className = 'ov-back'; ov.appendChild(bk); bk.addEventListener('click', function () { closeOv(ov); }); document.body.appendChild(ov); return ov; }
  function openOv(ov) { if (stack.indexOf(ov) === -1) stack.push(ov); ov.classList.add('open'); requestAnimationFrame(function () { requestAnimationFrame(function () { ov.classList.add('in'); }); }); }
  function closeOv(ov) { ov.classList.remove('in'); var i = stack.indexOf(ov); if (i !== -1) stack.splice(i, 1); setTimeout(function () { if (!ov.classList.contains('in')) ov.classList.remove('open'); }, 170); }
  document.addEventListener('keydown', function (e) { if (e.key === 'Escape' && stack.length) closeOv(stack[stack.length - 1]); });

  var lov = null, limg = null, lcap = null, lidx = 0;
  function buildL() {
    if (lov) return;
    lov = mk('ov-light');
    var p = document.createElement('div'); p.className = 'ov-panel';
    limg = document.createElement('img'); lcap = document.createElement('div'); lcap.className = 'light-cap';
    p.appendChild(limg); p.appendChild(lcap); lov.appendChild(p);
    var c = document.createElement('button'); c.className = 'ov-close'; c.type = 'button'; c.innerHTML = '&times;'; c.setAttribute('aria-label', LBL.close);
    c.addEventListener('click', function () { closeOv(lov); }); lov.appendChild(c);
    if (SAMPLES.length > 1) {
      var pv = document.createElement('button'); pv.className = 'light-nav light-prev'; pv.type = 'button'; pv.innerHTML = '&#8249;'; pv.setAttribute('aria-label', LBL.prev);
      pv.addEventListener('click', function (e) { e.stopPropagation(); showL(lidx - 1); });
      var nx = document.createElement('button'); nx.className = 'light-nav light-next'; nx.type = 'button'; nx.innerHTML = '&#8250;'; nx.setAttribute('aria-label', LBL.next);
      nx.addEventListener('click', function (e) { e.stopPropagation(); showL(lidx + 1); });
      lov.appendChild(pv); lov.appendChild(nx);
    }
  }
  function showL(i) { if (!SAMPLES.length) return; buildL(); lidx = (i % SAMPLES.length + SAMPLES.length) % SAMPLES.length; var s = SAMPLES[lidx]; limg.src = s.file; limg.alt = s.caption; lcap.textContent = s.caption; openOv(lov); }

  var gov = null;
  function buildG() {
    if (gov) return;
    gov = mk('ov-grid');
    var p = document.createElement('div'); p.className = 'ov-panel';
    var bar = document.createElement('div'); bar.className = 'grid-bar';
    var h = document.createElement('h3'); h.textContent = LBL.all;
    var x = document.createElement('button'); x.className = 'icon-x'; x.type = 'button'; x.innerHTML = '&times;'; x.setAttribute('aria-label', LBL.close);
    x.addEventListener('click', function () { closeOv(gov); });
    bar.appendChild(h); bar.appendChild(x);
    var sc = document.createElement('div'); sc.className = 'grid-scroll';
    var ms = document.createElement('div'); ms.className = 'masonry';
    SAMPLES.forEach(function (s, i) { var it = document.createElement('div'); it.className = 'm-item'; var im = document.createElement('img'); im.src = s.file; im.alt = s.caption; im.loading = 'lazy'; it.appendChild(im); it.addEventListener('click', function () { showL(i); }); ms.appendChild(it); });
    sc.appendChild(ms); p.appendChild(bar); p.appendChild(sc); gov.appendChild(p);
  }
  function openG() { buildG(); openOv(gov); }

  Array.prototype.forEach.call(document.querySelectorAll('.shot[data-idx]'), function (el) {
    var i = Number(el.getAttribute('data-idx')) || 0;
    el.addEventListener('click', function () { showL(i); });
  });
  var va = document.getElementById('od-view-all');
  if (va) va.addEventListener('click', openG);

  // Brand-asset tiles → full-page preview modal (re-uses the tile's own srcdoc).
  var aov = null, aframe = null, atitle = null, asub = null;
  function buildA() {
    if (aov) return;
    aov = mk('ov-asset');
    var p = document.createElement('div'); p.className = 'ov-panel';
    var bar = document.createElement('div'); bar.className = 'asset-bar';
    var left = document.createElement('div');
    atitle = document.createElement('span'); atitle.className = 'ab-title';
    asub = document.createElement('span'); asub.className = 'ab-sub';
    left.appendChild(atitle); left.appendChild(asub);
    var x = document.createElement('button'); x.className = 'icon-x'; x.type = 'button'; x.innerHTML = '&times;'; x.setAttribute('aria-label', LBL.close);
    x.addEventListener('click', function () { closeOv(aov); });
    bar.appendChild(left); bar.appendChild(x);
    aframe = document.createElement('iframe'); aframe.className = 'asset-modal-frame'; aframe.setAttribute('sandbox', ''); aframe.title = 'Asset preview';
    p.appendChild(bar); p.appendChild(aframe); aov.appendChild(p);
  }
  function openA(doc, label, desc) {
    buildA();
    atitle.textContent = label || 'Preview';
    asub.textContent = desc || '';
    aframe.setAttribute('srcdoc', doc || '');
    openOv(aov);
  }
  Array.prototype.forEach.call(document.querySelectorAll('.asset'), function (el) {
    el.addEventListener('click', function () {
      var fr = el.querySelector('iframe');
      openA(fr ? fr.getAttribute('srcdoc') : '', el.getAttribute('data-label'), el.getAttribute('data-desc'));
    });
  });
})();
</script>
</body>
</html>`;
  }

  window.__odBrandCapture = function (opts) {
    setActiveLocale(opts && opts.locale);
    const resources = new Set();
    const elements = visibleElements();
    const content = collectContent();
    const palette = collectPalette(elements);
    const colors = deriveBrandColors(palette);
    const typography = collectTypography();
    const fontFaces = collectFontFaces(resources);
    const assets = collectImageAssets(elements, resources);
    const components = collectComponents();
    const layout = deriveLayout(components);
    const accent = (colors.find((c) => c.role === 'accent') || {}).hex || '#C96442';
    const data = {
      version: 2,
      kind: 'design-system',
      capturedAt: Date.now(),
      content,
      brand: { name: content.title, tagline: content.description, sourceUrl: content.url, accent, colors },
      palette,
      typography,
      assets,
      layout,
      components,
    };
    return {
      html: renderHtml(data, fontFaces),
      resources: Array.from(resources).filter(isHttp).slice(0, MAX_RESOURCES),
      title: tr('brandFileTitle', { title: content.title }),
      url: location.href,
      summary: {
        colors: colors.length,
        logos: assets.logos.length,
        images: assets.images.length,
        fonts: typography.families.length,
      },
    };
  };
})();
