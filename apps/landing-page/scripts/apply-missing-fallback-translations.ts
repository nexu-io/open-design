import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import translations from '../app/_data/missing-fallback-translations.json';

type Patch = { domPath: string; kind: string; translation: string };
type Frame = { tag: string; path: string; childCounts: Map<string, number>; textIndex: number };

const MARKET_TO_ROUTE_LOCALE: Record<string, string> = {
  'ja-JP': 'ja', 'ko-KR': 'ko', 'zh-CN': 'zh', 'de-DE': 'de', 'fr-FR': 'fr',
  'es-ES': 'es', 'pt-BR': 'pt-br', 'ru-RU': 'ru', 'it-IT': 'it', 'tr-TR': 'tr',
};
const EXCLUDED_ROUTES = new Set(['/privacy/', '/terms/']);
const VOID_TAGS = new Set(['area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta', 'param', 'source', 'track', 'wbr']);
const IGNORED_BLOCK = /^<(script|style|svg|template|noscript|code|pre|kbd|samp)\b/i;

export async function applyMissingFallbackTranslations(outDir: string): Promise<{ pages: number; patches: number }> {
  let pages = 0;
  let patches = 0;
  for (const [market, byRoute] of Object.entries(translations)) {
    const routeLocale = MARKET_TO_ROUTE_LOCALE[market];
    if (!routeLocale) throw new Error(`Missing route-locale mapping for ${market}`);
    for (const [route, routePatches] of Object.entries(byRoute)) {
      if (route.startsWith('/plugins/')) throw new Error(`Plugin route leaked into fallback translation manifest: ${route}`);
      if (EXCLUDED_ROUTES.has(route)) throw new Error(`Excluded legal route leaked into fallback translation manifest: ${route}`);
      if (routePatches.length === 0) continue;
      const relative = route === '/' ? 'index.html' : path.join(route.replace(/^\//, ''), 'index.html');
      const file = path.join(outDir, routeLocale, relative);
      const result = applyRenderedPatches(await readFile(file, 'utf8'), routePatches);
      if (result.applied !== routePatches.length) {
        throw new Error(`Fallback translation alignment failed for /${routeLocale}${route}: applied ${result.applied}/${routePatches.length}`);
      }
      await writeFile(file, result.html);
      pages += 1;
      patches += result.applied;
    }
  }
  return { pages, patches };
}

export function applyRenderedPatches(html: string, patches: Patch[]): { html: string; applied: number } {
  const byPath = new Map(patches.map((patch) => [patch.domPath, patch]));
  const applied = new Set<string>();
  const root: Frame = { tag: 'root', path: '', childCounts: new Map(), textIndex: 0 };
  const stack: Frame[] = [root];
  const tokens = html.match(/<(script|style|svg|template|noscript|code|pre|kbd|samp)\b[^>]*>[\s\S]*?<\/\1\s*>|<!--[\s\S]*?-->|<![^>]*>|<[^>]+>|[^<]+/gi) ?? [];
  const output = tokens.map((token) => {
    if (IGNORED_BLOCK.test(token) || token.startsWith('<!--') || token.startsWith('<!')) return token;
    if (token.startsWith('</')) {
      const closing = token.match(/^<\/\s*([a-zA-Z0-9:-]+)/)?.[1]?.toLowerCase();
      if (closing) {
        const index = stack.findLastIndex((frame) => frame.tag === closing);
        if (index > 0) stack.splice(index);
      }
      return token;
    }
    if (token.startsWith('<')) {
      const tag = token.match(/^<\s*([a-zA-Z0-9:-]+)/)?.[1]?.toLowerCase();
      if (!tag) return token;
      const parent = stack.at(-1) ?? root;
      const index = (parent.childCounts.get(tag) ?? 0) + 1;
      parent.childCounts.set(tag, index);
      const nodePath = `${parent.path}/${tag}[${index}]`;
      let patched = token;
      for (const attribute of ['content', 'alt', 'aria-label', 'placeholder', 'title']) {
        const patch = byPath.get(`${nodePath}@${attribute}`);
        if (!patch) continue;
        patched = replaceAttribute(patched, attribute, patch.translation);
        applied.add(`${nodePath}@${attribute}`);
      }
      if (!token.endsWith('/>') && !VOID_TAGS.has(tag)) stack.push({ tag, path: nodePath, childCounts: new Map(), textIndex: 0 });
      return patched;
    }
    const frame = stack.at(-1) ?? root;
    const normalized = decodeEntities(token).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    if (normalized.length < 2 || /^[\p{P}\p{S}\d\s]+$/u.test(normalized)) return token;
    frame.textIndex += 1;
    const domPath = `${frame.path}/text()[${frame.textIndex}]`;
    const patch = byPath.get(domPath);
    if (!patch) return token;
    applied.add(domPath);
    return `${token.match(/^\s*/)?.[0] ?? ''}${escapeText(patch.translation)}${token.match(/\s*$/)?.[0] ?? ''}`;
  });
  return { html: output.join(''), applied: applied.size };
}

function replaceAttribute(tag: string, name: string, value: string): string {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return tag.replace(new RegExp(`(\\s${escaped}\\s*=\\s*)(["'])([\\s\\S]*?)\\2`, 'i'), (_full, prefix: string, quote: string) => `${prefix}${quote}${escapeAttribute(value, quote)}${quote}`);
}
function escapeText(value: string): string { return value.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }
function escapeAttribute(value: string, quote: string): string {
  const escaped = escapeText(value);
  return quote === '"' ? escaped.replace(/"/g, '&quot;') : escaped.replace(/'/g, '&#39;');
}
function decodeEntities(value: string): string {
  return value.replace(/&nbsp;/gi, ' ').replace(/&amp;/gi, '&').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
}
