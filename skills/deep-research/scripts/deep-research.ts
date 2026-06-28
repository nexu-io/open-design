#!/usr/bin/env -S node --experimental-strip-types

const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

function parseArgs(argv) {
  const options = { topic: '', rounds: 3, perQuery: 5, json: false };
  const topic = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--rounds') options.rounds = Number(argv[++i] ?? options.rounds);
    else if (arg === '--per-query') options.perQuery = Number(argv[++i] ?? options.perQuery);
    else if (arg === '--json') options.json = true;
    else topic.push(arg);
  }
  options.topic = topic.join(' ').trim();
  if (!options.topic) throw new Error('Usage: node --experimental-strip-types scripts/deep-research.ts "topic" [--rounds 3] [--per-query 5] [--json]');
  options.rounds = Math.min(Math.max(Math.floor(options.rounds) || 3, 1), 5);
  options.perQuery = Math.min(Math.max(Math.floor(options.perQuery) || 5, 2), 10);
  return options;
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#x2F;/g, '/')
    .replace(/&#x27;/g, "'");
}

function stripTags(value) {
  return decodeHtml(value.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim());
}

function normalizeDuckDuckGoUrl(raw) {
  const decoded = decodeHtml(raw);
  const absolute = decoded.startsWith('//') ? `https:${decoded}` : decoded;
  try {
    const url = new URL(absolute);
    const uddg = url.searchParams.get('uddg');
    return uddg ? decodeURIComponent(uddg) : absolute;
  } catch {
    return decoded;
  }
}

function buildQueries(topic, rounds) {
  const base = [
    topic,
    `${topic} official documentation source`,
    `${topic} GitHub implementation examples`,
    `${topic} comparison alternatives`,
    `${topic} limitations risks criticism`,
  ];
  if (rounds >= 2) {
    base.push(
      `${topic} latest update release notes`,
      `${topic} case study production use`,
      `${topic} benchmark evaluation`,
    );
  }
  if (rounds >= 3) {
    base.push(
      `${topic} site:github.com`,
      `${topic} site:arxiv.org OR site:paperswithcode.com`,
      `${topic} site:news.ycombinator.com OR site:reddit.com`,
    );
  }
  return Array.from(new Set(base)).slice(0, rounds * 4);
}

async function braveSearch(query, limit) {
  if (!process.env.BRAVE_API_KEY) throw new Error('BRAVE_API_KEY is not set');
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(limit));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': process.env.BRAVE_API_KEY,
    },
  });
  if (!response.ok) throw new Error(`Brave Search failed: HTTP ${response.status}`);
  const json = await response.json();
  return (json?.web?.results ?? []).slice(0, limit).map((item) => ({
    title: String(item.title ?? '').trim(),
    url: String(item.url ?? '').trim(),
    snippet: stripTags(String(item.description ?? '')),
    source: 'brave',
  })).filter((item) => item.title && item.url);
}

async function duckDuckGoSearch(query, limit) {
  const url = new URL(DDG_ENDPOINT);
  url.searchParams.set('q', query);
  const response = await fetch(url, {
    headers: { 'User-Agent': 'OpenDesignDeepResearch/1.0 (+https://github.com/nexu-io/open-design)' },
  });
  if (!response.ok) throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
  const html = await response.text();
  const blocks = html.split(/<div class="result\b/).slice(1);
  const results = [];
  for (const block of blocks) {
    const link = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const snippet = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      ?? block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);
    results.push({
      title: stripTags(link[2] ?? ''),
      url: normalizeDuckDuckGoUrl(link[1] ?? ''),
      snippet: snippet ? stripTags(snippet[1] ?? '') : '',
      source: 'duckduckgo',
    });
    if (results.length >= limit) break;
  }
  return results;
}

async function search(query, limit) {
  if (process.env.BRAVE_API_KEY) {
    try {
      return await braveSearch(query, limit);
    } catch (error) {
      console.error(`Brave unavailable for "${query}", using DuckDuckGo: ${error.message}`);
    }
  }
  return duckDuckGoSearch(query, limit);
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

function sourceKind(url) {
  const host = hostOf(url);
  if (host.includes('github.com')) return 'source-code';
  if (host.includes('arxiv.org') || host.includes('paperswithcode.com')) return 'paper';
  if (host.includes('docs.') || host.includes('developer.') || host.includes('wikipedia.org')) return 'reference';
  if (host.includes('reddit.com') || host.includes('news.ycombinator.com')) return 'community';
  return 'web';
}

function formatError(error) {
  const message = error instanceof Error ? error.message : String(error);
  const cause = error instanceof Error ? error.cause : undefined;
  if (cause instanceof Error) {
    const code = 'code' in cause ? ` (${String(cause.code)})` : '';
    return `${message}: ${cause.message}${code}`;
  }
  return message;
}

try {
  const options = parseArgs(process.argv.slice(2));
  const queries = buildQueries(options.topic, options.rounds);
  const byUrl = new Map();
  const queryResults = [];
  const errors = [];
  for (const query of queries) {
    let results = [];
    try {
      results = await search(query, options.perQuery);
    } catch (error) {
      const message = formatError(error);
      errors.push(`${query}: ${message}`);
      console.error(`Search unavailable for "${query}": ${message}`);
    }
    queryResults.push({ query, count: results.length });
    for (const result of results) {
      if (!result.url || byUrl.has(result.url)) continue;
      byUrl.set(result.url, { ...result, kind: sourceKind(result.url), queries: [query] });
    }
  }
  const results = Array.from(byUrl.values());
  if (options.json) {
    console.log(JSON.stringify({ topic: options.topic, queries: queryResults, results, errors }, null, 2));
  } else {
    console.log(`# Deep research packet`);
    console.log('');
    console.log(`Topic: ${options.topic}`);
    console.log('');
    console.log(`Queries run: ${queryResults.length}`);
    for (const item of queryResults) console.log(`- ${item.query} (${item.count} results)`);
    console.log('');
    console.log(`Deduped sources: ${results.length}`);
    console.log('');
    results.forEach((result, index) => {
      console.log(`${index + 1}. [${result.title}](${result.url})`);
      console.log(`   Kind: ${result.kind} · Host: ${hostOf(result.url)} · Search: ${result.source}`);
      if (result.snippet) console.log(`   ${result.snippet}`);
    });
    if (errors.length) {
      console.log('');
      console.log('Source errors:');
      for (const error of errors) console.log(`- ${error}`);
    }
    console.log('');
    console.log('Next: open/read the strongest primary sources, then synthesize with citations, contradictions, confidence, and recommended action.');
  }
} catch (error) {
  console.error(formatError(error));
  process.exit(1);
}
