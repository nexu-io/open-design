import type { ResearchSource } from '@open-design/contracts/api/research';

const DEFAULT_BASE_URL = 'https://api.tavily.com';
const DEFAULT_TIMEOUT_MS = 30_000;
const TAVILY_MAX_RESULTS_LIMIT = 20;

export interface TavilySearchInput {
  apiKey: string;
  baseUrl?: string;
  query: string;
  searchDepth?: 'basic' | 'advanced';
  maxResults?: number;
  includeAnswer?: boolean;
  signal?: AbortSignal;
}

interface TavilyRawResult {
  title?: unknown;
  url?: unknown;
  content?: unknown;
  score?: unknown;
  published_date?: unknown;
}

interface TavilyRawResponse {
  answer?: unknown;
  results?: unknown;
}

export interface TavilySearchOutput {
  answer: string;
  sources: ResearchSource[];
}

export class TavilyError extends Error {
  constructor(
    message: string,
    public readonly status?: number,
  ) {
    super(message);
    this.name = 'TavilyError';
  }
}

export async function tavilySearch(
  input: TavilySearchInput,
): Promise<TavilySearchOutput> {
  if (!input.apiKey) {
    throw new TavilyError('Tavily API key is not configured');
  }
  const base = (input.baseUrl || DEFAULT_BASE_URL).replace(/\/+$/, '');
  const requestedMax = input.maxResults ?? 5;
  const maxResults = Math.max(
    0,
    Math.min(requestedMax, TAVILY_MAX_RESULTS_LIMIT),
  );
  const body = {
    query: input.query,
    search_depth: input.searchDepth ?? 'basic',
    max_results: maxResults,
    include_answer: input.includeAnswer ?? true,
    include_raw_content: false,
  };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), DEFAULT_TIMEOUT_MS);
  if (input.signal) {
    input.signal.addEventListener('abort', () => ctrl.abort(), { once: true });
  }
  let resp: Response;
  try {
    resp = await fetch(`${base}/search`, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${input.apiKey}`,
      },
      body: JSON.stringify(body),
      signal: ctrl.signal,
    });
  } catch (err) {
    throw new TavilyError(
      `Tavily request failed: ${(err as Error).message || String(err)}`,
    );
  } finally {
    clearTimeout(timer);
  }
  if (!resp.ok) {
    const text = await resp.text().catch(() => '');
    throw new TavilyError(
      `Tavily ${resp.status}: ${text.slice(0, 200) || 'no body'}`,
      resp.status,
    );
  }
  const json = (await resp.json()) as TavilyRawResponse;
  const answer = typeof json.answer === 'string' ? json.answer : '';
  const rawResults = Array.isArray(json.results) ? json.results : [];
  const sources: ResearchSource[] = [];
  for (const r of rawResults as TavilyRawResult[]) {
    const url = typeof r.url === 'string' ? r.url : '';
    if (!url) continue;
    const publishedAt =
      typeof r.published_date === 'string' && r.published_date.trim()
        ? r.published_date.trim()
        : null;
    sources.push({
      title:
        typeof r.title === 'string' && r.title.trim()
          ? r.title.trim()
          : url,
      url,
      snippet:
        typeof r.content === 'string'
          ? r.content.trim().slice(0, 800)
          : '',
      provider: 'tavily',
      ...(publishedAt ? { publishedAt } : {}),
    });
  }
  return { answer, sources };
}
