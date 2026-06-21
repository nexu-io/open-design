import type { APIRoute } from 'astro';
import { getPublicPlugins } from '../../../plugin-registry';
import {
  DEFAULT_LOCALE,
  LANDING_LOCALES,
  isLandingLocale,
  localePath,
  type LandingLocaleCode,
} from '../../../i18n';

// Localized plugin search endpoints are generated for the canonical
// LANDING_LOCALES only (not the legacy `_lib/i18n` alias table). This keeps
// every emitted `/<locale>/plugins/search.json` aligned with the localized
// plugin detail routes under `[locale]/plugins/[slug]/`, so the `href`s it
// lists resolve to pages that actually exist in the build.
export function getStaticPaths() {
  return LANDING_LOCALES.filter((locale) => locale.code !== DEFAULT_LOCALE).map(
    (locale) => ({ params: { locale: locale.code } }),
  );
}

export const GET: APIRoute = ({ params }) => {
  const locale: LandingLocaleCode = isLandingLocale(params.locale)
    ? params.locale
    : DEFAULT_LOCALE;
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
    href: localePath(locale, plugin.detailHref),
    installCommand: plugin.installCommand,
  }));

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), locale, plugins }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
