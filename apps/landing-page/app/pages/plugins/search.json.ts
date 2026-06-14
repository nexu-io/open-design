import type { APIRoute } from 'astro';
import { getPublicPlugins } from '../../plugin-registry';

export const GET: APIRoute = () => {
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
    href: plugin.detailHref,
    installCommand: plugin.installCommand,
  }));

  return new Response(JSON.stringify({ generatedAt: new Date().toISOString(), plugins }, null, 2), {
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'public, max-age=300',
    },
  });
};
