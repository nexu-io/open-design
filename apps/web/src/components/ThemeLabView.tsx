import { useMemo, useState } from 'react';
import { Icon } from './Icon';
import { navigate } from '../router';

interface Swatch {
  hex: string;
  count: number;
}

interface ThemeTokens {
  name: string;
  slug: string;
  bg: string;
  surface: string;
  fg: string;
  muted: string;
  border: string;
  accent: string;
  accentOn: string;
  palette: Swatch[];
}

function slugify(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'image-theme';
}

function toHex(v: number): string {
  return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0');
}

function rgbToHex(r: number, g: number, b: number): string {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function hexToRgb(hex: string): [number, number, number] {
  const raw = hex.replace('#', '');
  return [
    parseInt(raw.slice(0, 2), 16),
    parseInt(raw.slice(2, 4), 16),
    parseInt(raw.slice(4, 6), 16),
  ];
}

function luminance(hex: string): number {
  const [rr, gg, bb] = hexToRgb(hex);
  const toLinear = (c: number) => {
    const n = c / 255;
    return n <= 0.03928 ? n / 12.92 : Math.pow((n + 0.055) / 1.055, 2.4);
  };
  const r = toLinear(rr);
  const g = toLinear(gg);
  const b = toLinear(bb);
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function mix(a: string, b: string, amount: number): string {
  const [ar0, ar1, ar2] = hexToRgb(a);
  const [br0, br1, br2] = hexToRgb(b);
  return rgbToHex(
    ar0 + (br0 - ar0) * amount,
    ar1 + (br1 - ar1) * amount,
    ar2 + (br2 - ar2) * amount,
  );
}

function saturation(hex: string): number {
  const [rr, gg, bb] = hexToRgb(hex);
  const r = rr / 255;
  const g = gg / 255;
  const b = bb / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  if (max === 0) return 0;
  return (max - min) / max;
}

async function extractThemeFromImage(file: File): Promise<ThemeTokens> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('image failed to load'));
    });
    const canvas = document.createElement('canvas');
    canvas.width = 96;
    canvas.height = 96;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('canvas unavailable');
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    const data = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
    const buckets = new Map<string, { r: number; g: number; b: number; count: number }>();
    for (let i = 0; i < data.length; i += 16) {
      const alpha = data[i + 3] ?? 0;
      if (alpha < 220) continue;
      const r = data[i] ?? 0;
      const g = data[i + 1] ?? 0;
      const b = data[i + 2] ?? 0;
      const key = `${Math.round(r / 24)}:${Math.round(g / 24)}:${Math.round(b / 24)}`;
      const curr = buckets.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
      curr.r += r;
      curr.g += g;
      curr.b += b;
      curr.count += 1;
      buckets.set(key, curr);
    }
    const palette = Array.from(buckets.values())
      .map((bucket) => ({
        hex: rgbToHex(bucket.r / bucket.count, bucket.g / bucket.count, bucket.b / bucket.count),
        count: bucket.count,
      }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
    const primary = palette[0];
    if (!primary) throw new Error('no opaque pixels found');
    const sortedByLight = [...palette].sort((a, b) => luminance(a.hex) - luminance(b.hex));
    const bg = luminance(primary.hex) > 0.58 ? mix(primary.hex, '#ffffff', 0.82) : mix(primary.hex, '#050505', 0.72);
    const fg = luminance(bg) > 0.5 ? '#111111' : '#f7f7f2';
    const saturated = [...palette].sort((a, b) => saturation(b.hex) - saturation(a.hex))[0] ?? primary;
    const median = sortedByLight[Math.floor(sortedByLight.length / 2)] ?? primary;
    const accent = saturated.hex === bg ? median.hex : saturated.hex;
    const name = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ') || 'Image Theme';
    return {
      name,
      slug: slugify(name),
      bg,
      surface: luminance(bg) > 0.5 ? mix(bg, '#000000', 0.05) : mix(bg, '#ffffff', 0.08),
      fg,
      muted: luminance(bg) > 0.5 ? '#5f6468' : '#b8b9b2',
      border: luminance(bg) > 0.5 ? mix(bg, '#000000', 0.18) : mix(bg, '#ffffff', 0.18),
      accent,
      accentOn: luminance(accent) > 0.45 ? '#111111' : '#ffffff',
      palette,
    };
  } finally {
    URL.revokeObjectURL(url);
  }
}

function renderTokensCss(theme: ThemeTokens): string {
  return `:root {
  --bg: ${theme.bg};
  --surface: ${theme.surface};
  --fg: ${theme.fg};
  --muted: ${theme.muted};
  --border: ${theme.border};
  --accent: ${theme.accent};
  --accent-on: ${theme.accentOn};
  --accent-hover: ${mix(theme.accent, theme.fg, 0.1)};
  --accent-active: ${mix(theme.accent, theme.fg, 0.18)};
  --success: #1f9d55;
  --warn: #c77910;
  --danger: #c9372c;
  --font-display: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-body: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-mono: "SFMono-Regular", Consolas, monospace;
  --text-xs: 12px;
  --text-sm: 14px;
  --text-base: 16px;
  --text-lg: 18px;
  --text-xl: 22px;
  --text-2xl: 28px;
  --text-3xl: 36px;
  --text-4xl: 52px;
  --leading-body: 1.55;
  --leading-tight: 1.08;
  --tracking-display: 0;
  --section-y-desktop: 96px;
  --section-y-tablet: 72px;
  --section-y-phone: 52px;
  --container-max: 1120px;
  --container-gutter-desktop: 32px;
  --container-gutter-tablet: 24px;
  --container-gutter-phone: 18px;
  --space-1: 4px;
  --space-2: 8px;
  --space-3: 12px;
  --space-4: 16px;
  --space-5: 20px;
  --space-6: 24px;
  --space-8: 32px;
  --space-12: 48px;
  --radius-sm: 6px;
  --radius-md: 8px;
  --radius-lg: 14px;
  --radius-pill: 999px;
  --elev-flat: none;
  --elev-ring: 0 0 0 1px var(--border);
  --elev-raised: 0 18px 50px color-mix(in srgb, var(--fg) 12%, transparent);
  --focus-ring: 0 0 0 3px color-mix(in srgb, var(--accent) 35%, transparent);
  --motion-fast: 140ms;
  --motion-base: 220ms;
  --ease-standard: cubic-bezier(.2,.8,.2,1);
  --surface-warm: ${mix(theme.surface, theme.accent, 0.05)};
  --fg-2: ${mix(theme.fg, theme.muted, 0.3)};
  --meta: ${theme.muted};
  --border-soft: ${mix(theme.border, theme.bg, 0.45)};
}
`;
}

function renderDesignMd(theme: ThemeTokens): string {
  return `# ${theme.name}

Visual identity: This system is extracted from an image palette and tuned for usable interface contrast. It uses ${theme.bg} as the ambient field, ${theme.fg} for readable content, and ${theme.accent} as the only loud product accent. The mood should stay anchored to the source image while keeping controls clear enough for production UI.

## Key characteristics
- Image-derived palette with one strong accent and quiet surfaces.
- System sans typography, tight headings, readable body copy.
- 8px default radius, restrained elevation, visible focus rings.
- Use the accent for primary actions, selected states, and small data highlights.

## Anti-patterns
- Do not introduce extra saturated accents.
- Do not reduce text contrast below WCAG AA.
- Do not use heavy ornamental shadows or decorative gradients.

## When to pick
Choose this system when the project should visibly inherit the uploaded image's color mood without becoming a static poster.
`;
}

function renderComponentsHtml(theme: ThemeTokens, tokensCss: string): string {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<title>${theme.name} components</title>
<style>
${tokensCss}
body{margin:0;background:var(--bg);color:var(--fg);font-family:var(--font-body);line-height:var(--leading-body);padding:32px}
.container{max-width:920px;margin:0 auto;display:grid;gap:24px}
.eyebrow{font-size:var(--text-xs);text-transform:uppercase;letter-spacing:.12em;color:var(--accent);font-weight:700}
.hero{display:grid;gap:14px;padding:36px;border:1px solid var(--border);border-radius:var(--radius-lg);background:var(--surface)}
h1{font-family:var(--font-display);font-size:var(--text-4xl);line-height:var(--leading-tight);margin:0}
.lead{font-size:var(--text-lg);color:var(--muted);max-width:62ch}
.row{display:flex;gap:12px;flex-wrap:wrap}
.btn{border:1px solid var(--border);border-radius:var(--radius-md);padding:10px 14px;background:var(--surface);color:var(--fg);font:inherit}
.btn-primary{background:var(--accent);border-color:var(--accent);color:var(--accent-on)}
.card-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px}
.card{padding:18px;border:1px solid var(--border);border-radius:var(--radius-md);background:var(--surface-warm)}
.badge{display:inline-flex;border-radius:var(--radius-pill);padding:4px 9px;background:color-mix(in srgb,var(--accent) 16%,transparent);color:var(--fg)}
.field{display:grid;gap:6px}
label{font-size:var(--text-sm);color:var(--muted)}
input{border:1px solid var(--border);border-radius:var(--radius-sm);padding:10px 12px;background:var(--bg);color:var(--fg);font:inherit}
input:focus,.btn:focus{outline:none;box-shadow:var(--focus-ring)}
@media(max-width:720px){.card-grid{grid-template-columns:1fr}h1{font-size:var(--text-3xl)}}
</style>
</head>
<body>
<main class="container">
  <section class="hero">
    <div class="eyebrow">${theme.name}</div>
    <h1>Image-derived tokens with production UI contrast.</h1>
    <p class="lead">The uploaded image sets the mood; the interface system keeps actions, forms, cards, and focus states readable.</p>
    <div class="row">
      <button class="btn btn-primary">Primary action</button>
      <button class="btn">Secondary action</button>
      <span class="badge">Extracted palette</span>
    </div>
  </section>
  <section class="card-grid">
    <article class="card"><strong>Surface</strong><p>Cards use the image mood without losing separation.</p></article>
    <article class="card"><strong>Accent</strong><p>The strongest sampled color becomes the product action.</p></article>
    <article class="card"><strong>Rhythm</strong><p>Spacing and type scale are normalized for app screens.</p></article>
  </section>
  <section class="field">
    <label for="email">Email</label>
    <input id="email" placeholder="you@example.com" />
  </section>
</main>
</body>
</html>`;
}

export function ThemeLabView() {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [theme, setTheme] = useState<ThemeTokens | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [savedSlug, setSavedSlug] = useState<string | null>(null);

  const tokensCss = useMemo(() => (theme ? renderTokensCss(theme) : ''), [theme]);
  const designMd = useMemo(() => (theme ? renderDesignMd(theme) : ''), [theme]);
  const componentsHtml = useMemo(
    () => (theme ? renderComponentsHtml(theme, tokensCss) : ''),
    [theme, tokensCss],
  );

  const handleFile = async (file: File) => {
    setError(null);
    setSavedSlug(null);
    if (imageUrl) URL.revokeObjectURL(imageUrl);
    setImageUrl(URL.createObjectURL(file));
    try {
      setTheme(await extractThemeFromImage(file));
    } catch (err) {
      setTheme(null);
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const saveTheme = async () => {
    if (!theme) return;
    setSaving(true);
    try {
      const res = await fetch('/api/design-systems/save-from-extraction', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({
          slug: theme.slug,
          name: theme.name,
          tokensCss,
          designMd,
          componentsHtml,
        }),
      });
      if (!res.ok) throw new Error(`save failed: ${res.status}`);
      setSavedSlug(theme.slug);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="theme-lab-view">
      <header className="theme-lab-view__head">
        <div>
          <h1 className="theme-lab-view__title">Image to theme</h1>
          <p className="theme-lab-view__lede">
            Drop a reference image, sample its palette locally, then save a real design-system folder.
          </p>
        </div>
        {savedSlug ? (
          <button
            type="button"
            className="theme-lab-view__save"
            onClick={() => navigate({ kind: 'home', view: 'components' })}
          >
            <Icon name="grid" size={13} />
            <span>Open Components</span>
          </button>
        ) : null}
      </header>

      <section className="theme-lab-drop">
        <label className="theme-lab-drop__target">
          <Icon name="image" size={20} />
          <span>Choose image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.currentTarget.files?.[0];
              if (file) void handleFile(file);
            }}
          />
        </label>
        <p>No upload to an AI service. Sampling runs in this browser tab.</p>
      </section>

      {error ? <div className="theme-lab-error">{error}</div> : null}

      {theme ? (
        <div className="theme-lab-grid">
          <section className="theme-lab-preview">
            {imageUrl ? <img src={imageUrl} alt="" /> : null}
            <div className="theme-lab-swatches">
              {theme.palette.map((swatch) => (
                <span
                  key={swatch.hex}
                  className="theme-lab-swatch"
                  style={{ background: swatch.hex }}
                  title={`${swatch.hex} · ${swatch.count}`}
                />
              ))}
            </div>
          </section>
          <section
            className="theme-lab-card"
            style={{
              background: theme.bg,
              color: theme.fg,
              borderColor: theme.border,
            }}
          >
            <div className="theme-lab-card__eyebrow" style={{ color: theme.accent }}>
              {theme.slug}
            </div>
            <h2>{theme.name}</h2>
            <p style={{ color: theme.muted }}>
              Extracted tokens are normalized into readable app primitives, not just copied swatches.
            </p>
            <div className="theme-lab-card__actions">
              <button
                type="button"
                style={{ background: theme.accent, color: theme.accentOn, borderColor: theme.accent }}
              >
                Primary
              </button>
              <button
                type="button"
                style={{ background: theme.surface, color: theme.fg, borderColor: theme.border }}
              >
                Secondary
              </button>
            </div>
          </section>
          <section className="theme-lab-code">
            <div className="theme-lab-code__head">
              <span>tokens.css</span>
              <button
                type="button"
                onClick={() => void navigator.clipboard?.writeText(tokensCss)}
              >
                Copy
              </button>
            </div>
            <pre>{tokensCss}</pre>
          </section>
          <section className="theme-lab-save-panel">
            <h2>Save as design system</h2>
            <p>
              Writes <code>tokens.css</code>, <code>DESIGN.md</code>, and <code>components.html</code>
              through the daemon so it appears in Components and project brand pickers.
            </p>
            <button
              type="button"
              className="theme-lab-view__save"
              disabled={saving}
              onClick={() => void saveTheme()}
            >
              {saving ? <Icon name="spinner" size={13} /> : <Icon name="check" size={13} />}
              <span>{savedSlug ? `Saved ${savedSlug}` : 'Save theme'}</span>
            </button>
          </section>
        </div>
      ) : null}
    </div>
  );
}
