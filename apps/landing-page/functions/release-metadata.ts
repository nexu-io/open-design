import { RELEASE_METADATA_UPSTREAM_URL } from '../app/_lib/release-metadata';

type PagesFunctionContext<Env> = {
  request: Request;
  env: Env;
};

type PagesFunction<Env> = (context: PagesFunctionContext<Env>) => Response | Promise<Response>;

const CACHE_CONTROL = 'public, max-age=300, s-maxage=300, stale-while-revalidate=3600';

export const onRequest: PagesFunction<Record<string, never>> = async () => {
  const response = await fetch(RELEASE_METADATA_UPSTREAM_URL, {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    return new Response('Release metadata unavailable', {
      status: 502,
      headers: {
        'Cache-Control': 'no-store',
        'Content-Type': 'text/plain; charset=utf-8',
      },
    });
  }

  const headers = new Headers(response.headers);
  headers.set('Cache-Control', CACHE_CONTROL);
  headers.set('Content-Type', 'application/json; charset=utf-8');

  return new Response(response.body, {
    status: response.status,
    headers,
  });
};
