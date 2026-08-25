/*
 * `/codex-plugin/` has two audiences:
 *
 * - real browser navigations and search/social crawlers receive the static
 *   Astro landing page;
 * - agents and command-line readers receive the canonical plain-text install
 *   guide from the public plugin-distribution repository.
 *
 * Keep the response split explicit and vary the cache key so an agent response
 * can never replace the indexed landing page at the edge.
 */
type PagesFunctionContext = {
  request: Request;
  next: () => Promise<Response>;
};

type PagesFunction = (
  context: PagesFunctionContext,
) => Response | Promise<Response>;

type Fetcher = typeof fetch;

export const AGENT_INSTALL_GUIDE_URL =
  'https://raw.githubusercontent.com/nexu-io/open-design-agent-plugins/main/AGENTS.md';

const HTML_CRAWLER_USER_AGENT =
  /(?:Googlebot|bingbot|DuckDuckBot|Baiduspider|YandexBot|Applebot|facebookexternalhit|Twitterbot|LinkedInBot|Slackbot|Discordbot)/iu;

const VARY_HEADERS = ['User-Agent', 'Sec-Fetch-Mode', 'Sec-Fetch-Dest'] as const;

function appendVary(headers: Headers): void {
  const values = new Set(
    (headers.get('Vary') ?? '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean),
  );
  for (const header of VARY_HEADERS) values.add(header);
  headers.set('Vary', [...values].join(', '));
}

export function shouldServeLandingHtml(request: Request): boolean {
  const mode = request.headers.get('Sec-Fetch-Mode')?.toLowerCase();
  const destination = request.headers.get('Sec-Fetch-Dest')?.toLowerCase();
  if (mode === 'navigate' && destination === 'document') return true;

  return HTML_CRAWLER_USER_AGENT.test(request.headers.get('User-Agent') ?? '');
}

export async function handleCodexPluginRequest(
  context: PagesFunctionContext,
  fetcher: Fetcher = fetch,
): Promise<Response> {
  if (context.request.method !== 'GET' && context.request.method !== 'HEAD') {
    return context.next();
  }

  if (shouldServeLandingHtml(context.request)) {
    const response = await context.next();
    const headers = new Headers(response.headers);
    appendVary(headers);
    return new Response(context.request.method === 'HEAD' ? null : response.body, {
      status: response.status,
      statusText: response.statusText,
      headers,
    });
  }

  const headers = new Headers({
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'X-Content-Type-Options': 'nosniff',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  appendVary(headers);

  const unavailableResponse = () =>
    new Response(
      `OpenDesign plugin installation guide is temporarily unavailable.\n\nRead ${AGENT_INSTALL_GUIDE_URL} and follow the Install into Codex lane. Do not change unrelated configuration.\n`,
      { status: 502, headers },
    );

  let guide: string;
  try {
    const upstream = await fetcher(AGENT_INSTALL_GUIDE_URL, {
      headers: {
        Accept: 'text/plain, text/markdown;q=0.9, */*;q=0.1',
        'User-Agent': 'open-design.ai/codex-plugin agent entrypoint',
      },
    });
    if (!upstream.ok) return unavailableResponse();
    guide = await upstream.text();
  } catch {
    return unavailableResponse();
  }
  const body = [
    '# OpenDesign for Codex — agent installation entrypoint',
    '',
    'The user asked you to install OpenDesign for Codex. Read this entire response, follow the Install into Codex lane, verify the plugin and local MCP, then complete the handoff exactly as instructed.',
    '',
    `Canonical guide: ${AGENT_INSTALL_GUIDE_URL}`,
    '',
    guide.trim(),
    '',
  ].join('\n');

  return new Response(context.request.method === 'HEAD' ? null : body, {
    status: 200,
    headers,
  });
}

export const onRequest: PagesFunction = (context) =>
  handleCodexPluginRequest(context);
