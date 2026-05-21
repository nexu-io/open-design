import type { APIRoute } from 'astro';
import { getPublicPlugins } from '../../../plugin-registry';
import { PREFIXED_LOCALES, isLocale, localePath } from '../../../_lib/i18n';

export function getStaticPaths() {
  return PREFIXED_LOCALES.map((locale) => ({
    params: { locale },
  }));
}

export const GET: APIRoute = ({ params }) => {
  const locale = isLocale(params.locale) ? params.locale : 'en';
  const plugins = getPublicPlugins().map((plugin) => ({
    id: plugin.id,
    title: plugin.title,
    description: plugin.description,
    registryId: plugin.registryId,
    trust: plugin.trust,
    version: plugin.version,
    mode: plugin.mode,
    surface: plugin.surface,
    visualKind: plugin.visualKind,
    preview: plugin.preview
      ? {
          type: plugin.preview.type,
          label: plugin.preview.label,
          poster: plugin.preview.poster,
          frameHref: plugin.preview.frameHref,
        }
      : undefined,
    tags: plugin.tags,
    capabilities: plugin.capabilities,
    href: localePath(plugin.detailHref, locale, { prefixDefault: true }),
    installCommand: plugin.installCommand,
  }));

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), locale, plugins }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
