import type { HighlighterGeneric } from 'shiki';

let highlighterPromise: Promise<HighlighterGeneric<any, any>> | null = null;

const cache = new Map<string, string>();
const CACHE_MAX = 128;

function getHighlighter(): Promise<HighlighterGeneric<any, any>> {
  if (!highlighterPromise) {
    highlighterPromise = import('shiki/bundle/web').then(({ createHighlighter }) =>
      createHighlighter({
        themes: ['github-light-default', 'github-dark-default'],
        langs: [
          'javascript', 'typescript', 'tsx', 'jsx', 'html', 'css', 'json',
          'python', 'bash', 'shell', 'markdown', 'yaml', 'sql', 'rust',
          'go', 'java', 'c', 'cpp', 'swift', 'ruby', 'php', 'diff',
          'toml', 'xml', 'graphql', 'dockerfile',
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

export async function highlightCode(code: string, lang: string): Promise<string> {
  const dark = isDarkMode();
  const cacheKey = `${dark ? 'd' : 'l'}:${lang}:${code}`;
  const cached = cache.get(cacheKey);
  if (cached) return cached;

  const highlighter = await getHighlighter();
  const loadedLangs = highlighter.getLoadedLanguages();
  if (!loadedLangs.includes(lang as any)) {
    return '';
  }

  const html = highlighter.codeToHtml(code, {
    lang,
    theme: dark ? 'github-dark-default' : 'github-light-default',
  });

  if (cache.size >= CACHE_MAX) {
    const first = cache.keys().next().value;
    if (first !== undefined) cache.delete(first);
  }
  cache.set(cacheKey, html);
  return html;
}
