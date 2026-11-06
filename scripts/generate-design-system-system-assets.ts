import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";

type Manifest = {
  id?: string;
  name?: string;
  category?: string;
  description?: string;
  files?: {
    design?: string;
    tokens?: string;
    designTokens?: string;
  };
};

type TokenMap = Map<string, string>;

type AssetSpec = {
  file: string;
  label: string;
  title: string;
  eyebrow: string;
  body: string;
};

const repoRoot = path.resolve(import.meta.dirname, "..");
const designSystemsRoot = path.join(repoRoot, "design-systems");

const assetSpecs: AssetSpec[] = [
  {
    file: "landing.html",
    label: "Landing page",
    title: "Launch narrative",
    eyebrow: "Landing",
    body: "Hero, proof points, and conversion actions composed from the design system tokens.",
  },
  {
    file: "deck.html",
    label: "Pitch deck",
    title: "Executive deck",
    eyebrow: "Deck",
    body: "Slide-scale title, metric, and section patterns for presentation work.",
  },
  {
    file: "poster.html",
    label: "Poster",
    title: "Campaign poster",
    eyebrow: "Poster",
    body: "High-impact display composition using the system color, type, and spacing rhythm.",
  },
  {
    file: "email.html",
    label: "Email",
    title: "Email module",
    eyebrow: "Email",
    body: "Transactional header, body copy, and primary call-to-action treatment.",
  },
  {
    file: "newsletter.html",
    label: "Newsletter",
    title: "Editorial issue",
    eyebrow: "Newsletter",
    body: "Readable long-form layout with heading hierarchy and compact story modules.",
  },
  {
    file: "form.html",
    label: "Form page",
    title: "Capture form",
    eyebrow: "Form",
    body: "Input, selection, helper text, and submission states in one focused page.",
  },
];

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function token(tokens: TokenMap, names: string[], fallback: string): string {
  for (const name of names) {
    const value = tokens.get(name);
    if (value) return value;
  }
  return fallback;
}

function tokenNumber(tokens: TokenMap, names: string[], fallback: number): number {
  const raw = token(tokens, names, "");
  const match = raw.match(/-?\d+(?:\.\d+)?/);
  if (!match) return fallback;
  return Number(match[0]);
}

function firstHex(tokens: TokenMap, fallback: string): string {
  for (const value of tokens.values()) {
    const match = value.match(/#[0-9a-fA-F]{6}\b/);
    if (match) return match[0];
  }
  return fallback;
}

function parseCssTokens(css: string): TokenMap {
  const out = new Map<string, string>();
  const re = /(--[a-zA-Z0-9_-]+)\s*:\s*([^;]+);/g;
  for (const match of css.matchAll(re)) {
    out.set(match[1]!, match[2]!.trim());
  }
  return out;
}

function parseDesignTokensJson(raw: string): TokenMap {
  const out = new Map<string, string>();
  try {
    const parsed = JSON.parse(raw) as { tokens?: Array<{ name?: unknown; value?: unknown }> };
    for (const item of parsed.tokens ?? []) {
      if (typeof item.name === "string" && typeof item.value === "string") {
        out.set(item.name, item.value);
      }
    }
  } catch {
    return out;
  }
  return out;
}

function mergeTokens(primary: TokenMap, fallback: TokenMap): TokenMap {
  const out = new Map(fallback);
  for (const [key, value] of primary) out.set(key, value);
  return out;
}

function tokenSubset(tokens: TokenMap): Record<string, string | number> {
  const primary = token(tokens, ["--accent", "--primary", "--color-primary"], firstHex(tokens, "#2563eb"));
  return {
    colorPrimary: primary,
    colorPrimaryBg: token(tokens, ["--accent-bg", "--surface-warm", "--surface"], "#f8fafc"),
    colorPrimaryHover: token(tokens, ["--accent-hover", "--accent"], primary),
    colorPrimaryActive: token(tokens, ["--accent-active", "--accent"], primary),
    fontSize: tokenNumber(tokens, ["--text-base", "--font-size-base"], 14),
    borderRadius: tokenNumber(tokens, ["--radius-md", "--radius", "--border-radius"], 8),
  };
}

function cssVars(tokens: TokenMap): string {
  const lines = Array.from(tokens.entries())
    .filter(([name]) => /^--[a-zA-Z0-9_-]+$/.test(name))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([name, value]) => `    ${name}: ${value};`);
  return [":root {", ...lines, "}"].join("\n");
}

function baseStyle(tokens: TokenMap, mode: "light" | "dark"): string {
  const bg = mode === "dark" ? "#0f1115" : token(tokens, ["--bg", "--surface"], "#ffffff");
  const surface = mode === "dark" ? "#171a21" : token(tokens, ["--surface", "--bg"], "#ffffff");
  const fg = mode === "dark" ? "#f8fafc" : token(tokens, ["--fg", "--text"], "#111827");
  const muted = mode === "dark" ? "#a7adba" : token(tokens, ["--muted", "--fg-2"], "#6b7280");
  const border = mode === "dark" ? "#2a2f3a" : token(tokens, ["--border"], "#e5e7eb");
  const accent = token(tokens, ["--accent", "--primary"], firstHex(tokens, "#2563eb"));
  const fontBody = token(tokens, ["--font-body", "--font-display"], "Inter, system-ui, sans-serif");
  const fontDisplay = token(tokens, ["--font-display", "--font-body"], fontBody);
  const radius = token(tokens, ["--radius-md", "--radius"], "12px");
  return `
${cssVars(tokens)}
:root {
  --od-page-bg: ${bg};
  --od-surface: ${surface};
  --od-text: ${fg};
  --od-muted: ${muted};
  --od-border: ${border};
  --od-accent: ${accent};
  --od-radius: ${radius};
  --od-font-body: ${fontBody};
  --od-font-display: ${fontDisplay};
}
* { box-sizing: border-box; }
body {
  margin: 0;
  min-height: 100vh;
  background: var(--od-page-bg);
  color: var(--od-text);
  font-family: var(--od-font-body);
  -webkit-font-smoothing: antialiased;
}
a { color: inherit; }
.page { width: min(1100px, calc(100vw - 48px)); margin: 0 auto; padding: 72px 0; }
.eyebrow { color: var(--od-accent); font-size: 12px; font-weight: 750; letter-spacing: 0; text-transform: uppercase; }
.hero { display: grid; grid-template-columns: 1.05fr .95fr; gap: 32px; align-items: center; }
h1, h2, h3, p { margin: 0; }
h1, h2, h3 { font-family: var(--od-font-display); letter-spacing: 0; line-height: 1.05; }
h1 { margin-top: 12px; font-size: 64px; }
h2 { font-size: 40px; }
h3 { font-size: 22px; }
.lead { margin-top: 18px; color: var(--od-muted); font-size: 20px; line-height: 1.55; }
.actions { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 28px; }
.button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; border-radius: var(--od-radius); padding: 0 18px; font-weight: 750; text-decoration: none; border: 1px solid var(--od-border); }
.button.primary { background: var(--od-accent); border-color: var(--od-accent); color: ${mode === "dark" ? "#0b0b0b" : "#ffffff"}; }
.button.secondary { background: var(--od-surface); }
.panel, .card, .field, .slide, .email, .poster { border: 1px solid var(--od-border); border-radius: var(--od-radius); background: var(--od-surface); }
.panel { padding: 24px; box-shadow: 0 24px 80px rgba(15, 17, 23, ${mode === "dark" ? "0.32" : "0.08"}); }
.metric-grid, .card-grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 14px; margin-top: 22px; }
.metric, .card { padding: 18px; }
.metric strong { display: block; font-size: 30px; line-height: 1; }
.metric span, .card p, .field span { color: var(--od-muted); font-size: 14px; line-height: 1.5; }
.chip-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 18px; }
.chip { border: 1px solid var(--od-border); border-radius: 999px; padding: 8px 12px; color: var(--od-muted); }
input, textarea, select { width: 100%; min-height: 44px; border: 1px solid var(--od-border); border-radius: var(--od-radius); background: var(--od-page-bg); color: var(--od-text); font: inherit; padding: 10px 12px; }
label { display: grid; gap: 8px; color: var(--od-muted); font-size: 13px; font-weight: 700; }
@media (max-width: 820px) { .hero, .metric-grid, .card-grid { grid-template-columns: 1fr; } .page { width: min(100vw - 28px, 1100px); padding: 40px 0; } h1 { font-size: 42px; } h2 { font-size: 30px; } }
`;
}

function renderKitHtml(manifest: Required<Pick<Manifest, "id" | "name" | "category">> & Manifest, tokens: TokenMap, mode: "light" | "dark"): string {
  const name = escapeHtml(manifest.name);
  const description = escapeHtml(manifest.description ?? `${manifest.name} reference component kit.`);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} - ${mode === "dark" ? "dark " : ""}component kit</title>
  <style>${baseStyle(tokens, mode)}</style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div>
        <p class="eyebrow">${escapeHtml(manifest.category)} system</p>
        <h1>${name} component kit</h1>
        <p class="lead">${description}</p>
        <div class="actions">
          <a class="button primary" href="#">Primary</a>
          <a class="button secondary" href="#">Default</a>
          <a class="button secondary" href="#">Dashed</a>
        </div>
      </div>
      <article class="panel">
        <p class="eyebrow">Reference module</p>
        <h3>Token-driven surface</h3>
        <div class="metric-grid">
          <div class="metric"><strong>12</strong><span>Components</span></div>
          <div class="metric"><strong>4</strong><span>States</span></div>
          <div class="metric"><strong>1</strong><span>Token contract</span></div>
        </div>
        <div class="chip-row">
          <span class="chip">Hover</span>
          <span class="chip">Focus</span>
          <span class="chip">Active</span>
          <span class="chip">Disabled</span>
        </div>
      </article>
    </section>
    <section class="card-grid" aria-label="Component examples">
      <article class="card"><h3>Buttons</h3><p>Primary, secondary, text, and destructive treatments resolve through shared color tokens.</p></article>
      <article class="card"><h3>Inputs</h3><p>Labels, helper text, and focus state use the same spacing and radius scale.</p></article>
      <article class="card"><h3>Cards</h3><p>Information modules keep elevation, border, and padding consistent across breakpoints.</p></article>
    </section>
  </main>
</body>
</html>
`;
}

function renderIndexHtml(manifest: Required<Pick<Manifest, "id" | "name" | "category">> & Manifest, tokens: TokenMap): string {
  const name = escapeHtml(manifest.name);
  const links = [
    ["kit.html", "Component kit"],
    ["kit.dark.html", "Dark component kit"],
    ["artifacts/landing.html", "Landing page"],
    ["artifacts/deck.html", "Pitch deck"],
    ["artifacts/poster.html", "Poster"],
    ["artifacts/email.html", "Email"],
    ["artifacts/newsletter.html", "Newsletter"],
    ["artifacts/form.html", "Form page"],
  ].map(([href, label]) => `<a class="card" href="${href}"><h3>${label}</h3><p>${href}</p></a>`).join("\n");
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} - system assets</title>
  <style>${baseStyle(tokens, "light")}</style>
</head>
<body>
  <main class="page">
    <p class="eyebrow">${escapeHtml(manifest.category)}</p>
    <h1>${name} system assets</h1>
    <p class="lead">Generated preview modules for bundled official presets.</p>
    <section class="card-grid">${links}</section>
  </main>
</body>
</html>
`;
}

function renderAssetHtml(manifest: Required<Pick<Manifest, "id" | "name" | "category">> & Manifest, tokens: TokenMap, spec: AssetSpec): string {
  const name = escapeHtml(manifest.name);
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${name} - ${escapeHtml(spec.label)}</title>
  <style>${baseStyle(tokens, "light")}</style>
</head>
<body>
  <main class="page">
    <section class="hero">
      <div>
        <p class="eyebrow">${escapeHtml(spec.eyebrow)} module</p>
        <h1>${name} ${escapeHtml(spec.title)}</h1>
        <p class="lead">${escapeHtml(spec.body)}</p>
        <div class="actions">
          <a class="button primary" href="#">Continue</a>
          <a class="button secondary" href="#">View details</a>
        </div>
      </div>
      <article class="panel">
        <p class="eyebrow">Preview</p>
        <h3>${escapeHtml(spec.label)}</h3>
        <p class="lead" style="font-size:16px">${escapeHtml(manifest.description ?? `${manifest.name} official preset module.`)}</p>
        <div class="card-grid" style="grid-template-columns:1fr 1fr">
          <div class="field"><label>Primary input<input value="${name}" /></label></div>
          <div class="field"><label>Status<select><option>Ready</option><option>Draft</option></select></label></div>
        </div>
      </article>
    </section>
  </main>
</body>
</html>
`;
}

async function readTokens(systemDir: string, manifest: Manifest): Promise<TokenMap> {
  const tokensCssPath = manifest.files?.tokens ?? "tokens.css";
  const designTokensPath = manifest.files?.designTokens ?? "design-tokens.json";
  const [cssRaw, jsonRaw] = await Promise.all([
    readFile(path.join(systemDir, tokensCssPath), "utf8").catch(() => ""),
    readFile(path.join(systemDir, designTokensPath), "utf8").catch(() => ""),
  ]);
  return mergeTokens(parseDesignTokensJson(jsonRaw), parseCssTokens(cssRaw));
}

async function generateForDir(systemDir: string): Promise<boolean> {
  const manifestPath = path.join(systemDir, "manifest.json");
  const raw = await readFile(manifestPath, "utf8").catch(() => null);
  if (!raw) return false;
  const parsed = JSON.parse(raw) as Manifest;
  if (!parsed.id || !parsed.name || !parsed.category) return false;

  const manifest = parsed as Required<Pick<Manifest, "id" | "name" | "category">> & Manifest;
  const tokens = await readTokens(systemDir, manifest);
  const outDir = path.join(systemDir, "system");
  const artifactsDir = path.join(outDir, "artifacts");
  await mkdir(artifactsDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(outDir, "kit.html"), renderKitHtml(manifest, tokens, "light"), "utf8"),
    writeFile(path.join(outDir, "kit.dark.html"), renderKitHtml(manifest, tokens, "dark"), "utf8"),
    writeFile(path.join(outDir, "index.html"), renderIndexHtml(manifest, tokens), "utf8"),
    writeFile(path.join(outDir, "tokens.default.json"), `${JSON.stringify(tokenSubset(tokens), null, 2)}\n`, "utf8"),
    ...assetSpecs.map((spec) => writeFile(path.join(artifactsDir, spec.file), renderAssetHtml(manifest, tokens, spec), "utf8")),
  ]);
  return true;
}

async function main(): Promise<void> {
  const entries = await readdir(designSystemsRoot, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name === "_schema") continue;
    if (await generateForDir(path.join(designSystemsRoot, entry.name))) count++;
  }
  console.log(`Generated system assets for ${count} design systems.`);
}

await main();
