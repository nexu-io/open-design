import type { HighlighterGeneric } from 'shiki';

let highlighterPromise: Promise<HighlighterGeneric<any, any>> | null = null;

const cache = new Map<string, string>();
const tokenCache = new Map<string, HighlightedCodeToken[][]>();
const languageLoadPromises = new Map<string, Promise<void>>();
const CACHE_MAX = 128;
const TOKEN_CACHE_MAX = 16;
const TOKEN_RENDER_MAX = 20_000;
const LAZY_LANGUAGE_LOADERS = {
  diff: () => import('shiki/langs/diff.mjs').then((module) => module.default),
  dockerfile: () => import('shiki/langs/dockerfile.mjs').then((module) => module.default),
  go: () => import('shiki/langs/go.mjs').then((module) => module.default),
  ruby: () => import('shiki/langs/ruby.mjs').then((module) => module.default),
  rust: () => import('shiki/langs/rust.mjs').then((module) => module.default),
  swift: () => import('shiki/langs/swift.mjs').then((module) => module.default),
  toml: () => import('shiki/langs/toml.mjs').then((module) => module.default),
};

export type HighlightedCodeToken = {
  content: string;
  color?: string;
};

function getHighlighter(): Promise<HighlighterGeneric<any, any>> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki/bundle/web').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-light-default', 'github-dark-default'],
        langs: [
          'javascript', 'typescript', 'tsx', 'jsx', 'html', 'css', 'json',
          'python', 'bash', 'shell', 'markdown', 'yaml', 'sql', 'java',
          'c', 'cpp', 'php', 'xml', 'graphql',
        ],
      }),
    );
  }
  return highlighterPromise;
}

function isDarkMode(): boolean {
  if (typeof document === 'undefined') return false;
  const theme = document.documentElement.getAttribute('data-theme');
  if (theme === 'dark') return true;
  if (theme === 'light') return false;
  return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function setBoundedCache<T>(
  target: Map<string, T>,
  key: string,
  value: T,
  maxEntries = CACHE_MAX,
): void {
  if (target.size >= maxEntries) {
    const first = target.keys().next().value;
    if (first !== undefined) target.delete(first);
  }
  target.set(key, value);
}

async function ensureLanguageLoaded(
  highlighter: HighlighterGeneric<any, any>,
  lang: string,
): Promise<boolean> {
  if (highlighter.getLoadedLanguages().includes(lang as any)) return true;
  const loader = LAZY_LANGUAGE_LOADERS[lang as keyof typeof LAZY_LANGUAGE_LOADERS];
  if (!loader) return false;

  let loadPromise = languageLoadPromises.get(lang);
  if (!loadPromise) {
    loadPromise = loader().then((registrations) => highlighter.loadLanguage(...registrations));
    languageLoadPromises.set(lang, loadPromise);
  }
  try {
    await loadPromise;
  } catch (error) {
    languageLoadPromises.delete(lang);
    throw error;
  }
  return highlighter.getLoadedLanguages().includes(lang as any);
}

export async function highlightCode(code: string, lang: string): Promise<string> {
  const dark = isDarkMode();
  const cacheKey = `${dark ? 'd' : 'l'}:${lang}:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const highlighter = await getHighlighter();
  if (!(await ensureLanguageLoaded(highlighter, lang))) return '';

  const html = highlighter.codeToHtml(code, {
    lang,
    theme: dark ? 'github-dark-default' : 'github-light-default',
  });

  setBoundedCache(cache, cacheKey, html);
  return html;
}

export async function highlightCodeTokens(
  code: string,
  lang: string,
): Promise<HighlightedCodeToken[][]> {
  const dark = isDarkMode();
  const cacheKey = `${dark ? 'd' : 'l'}:${lang}:${code}`;
  const cached = tokenCache.get(cacheKey);
  if (cached) return cached;

  const highlighter = await getHighlighter();
  if (!(await ensureLanguageLoaded(highlighter, lang))) return [];

  const result = highlighter.codeToTokens(code, {
    lang,
    theme: dark ? 'github-dark-default' : 'github-light-default',
  });
  const tokens = result.tokens.map((line) =>
    line.map(({ content, color }) => ({ content, color })),
  );
  const tokenCount = tokens.reduce((count, line) => count + line.length, 0);
  if (tokenCount > TOKEN_RENDER_MAX) return [];

  setBoundedCache(tokenCache, cacheKey, tokens, TOKEN_CACHE_MAX);
  return tokens;
}
