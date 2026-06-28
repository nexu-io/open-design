#!/usr/bin/env -S node --experimental-strip-types

const DAY_MS = 24 * 60 * 60 * 1000;
const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';
const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';

function parseArgs(argv) {
  const options = { topic: '', limit: 8, json: false };
  const topic = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--limit') options.limit = Number(argv[++i] ?? options.limit);
    else if (arg === '--json') options.json = true;
    else topic.push(arg);
  }
  options.topic = topic.join(' ').trim();
  if (!options.topic) throw new Error('Usage: node --experimental-strip-types scripts/last30days-lite.ts "topic" [--limit 8] [--json]');
  options.limit = Math.min(Math.max(Math.floor(options.limit) || 8, 3), 12);
  return options;
}

function isoDate(date) {
  return date.toISOString().slice(0, 10);
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

async function braveSearch(query, limit) {
  if (!process.env.BRAVE_API_KEY) throw new Error('BRAVE_API_KEY is not set');
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(limit));
  url.searchParams.set('freshness', 'pm');
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
    headers: { 'User-Agent': 'OpenDesignLast30Days/1.0 (+https://github.com/nexu-io/open-design)' },
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

async function webSearch(query, limit) {
  if (process.env.BRAVE_API_KEY) {
    try {
      return await braveSearch(query, limit);
    } catch (error) {
      console.error(`Brave unavailable for "${query}", using DuckDuckGo: ${error.message}`);
    }
  }
  return duckDuckGoSearch(query, limit);
}

async function hnSearch(topic, sinceUnix, limit) {
  const url = new URL('https://hn.algolia.com/api/v1/search_by_date');
  url.searchParams.set('query', topic);
  url.searchParams.set('tags', 'story,comment');
  url.searchParams.set('numericFilters', `created_at_i>${sinceUnix}`);
  url.searchParams.set('hitsPerPage', String(limit));
  const response = await fetch(url);
  if (!response.ok) return [];
  const json = await response.json();
  return (json.hits ?? []).map((hit) => ({
    title: hit.title ?? hit.story_title ?? hit.comment_text?.replace(/<[^>]+>/g, ' ').slice(0, 90) ?? 'HN mention',
    url: hit.url ?? `https://news.ycombinator.com/item?id=${hit.objectID}`,
    snippet: stripTags(hit.comment_text ?? hit.story_text ?? ''),
    source: 'hacker-news',
    date: hit.created_at,
  })).filter((item) => item.url).slice(0, limit);
}

async function githubSearch(topic, sinceDate, limit) {
  const url = new URL('https://api.github.com/search/repositories');
  url.searchParams.set('q', `${topic} pushed:>${sinceDate}`);
  url.searchParams.set('sort', 'updated');
  url.searchParams.set('order', 'desc');
  url.searchParams.set('per_page', String(limit));
  const headers = { Accept: 'application/vnd.github+json' };
  if (process.env.GITHUB_TOKEN) headers.Authorization = `Bearer ${process.env.GITHUB_TOKEN}`;
  const response = await fetch(url, { headers });
  if (!response.ok) return [];
  const json = await response.json();
  return (json.items ?? []).map((repo) => ({
    title: repo.full_name,
    url: repo.html_url,
    snippet: repo.description ?? '',
    source: 'github',
    date: repo.updated_at,
    stars: repo.stargazers_count,
  })).slice(0, limit);
}

function queries(topic, sinceDate) {
  return [
    { label: 'web', query: `${topic} after:${sinceDate}` },
    { label: 'reddit', query: `site:reddit.com ${topic} after:${sinceDate}` },
    { label: 'youtube', query: `site:youtube.com ${topic} after:${sinceDate}` },
    { label: 'tiktok', query: `site:tiktok.com ${topic} after:${sinceDate}` },
    { label: 'x', query: `site:x.com OR site:twitter.com ${topic} after:${sinceDate}` },
  ];
}

function dedupe(results) {
  const seen = new Set();
  const out = [];
  for (const result of results) {
    if (!result.url || seen.has(result.url)) continue;
    seen.add(result.url);
    out.push(result);
  }
  return out;
}

async function collectGroup(label, fn) {
  try {
    return { label, results: await fn() };
  } catch (error) {
    const message = formatError(error);
    console.error(`${label} unavailable: ${message}`);
    return { label, results: [], error: message };
  }
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
  const now = new Date();
  const since = new Date(now.getTime() - 30 * DAY_MS);
  const sinceDate = isoDate(since);
  const sinceUnix = Math.floor(since.getTime() / 1000);
  const groups = [];
  groups.push(await collectGroup('hacker-news', () => hnSearch(options.topic, sinceUnix, options.limit)));
  groups.push(await collectGroup('github', () => githubSearch(options.topic, sinceDate, options.limit)));
  for (const item of queries(options.topic, sinceDate)) {
    groups.push(await collectGroup(item.label, () => webSearch(item.query, options.limit)));
  }
  const flat = dedupe(groups.flatMap((group) => group.results.map((result) => ({ ...result, group: group.label }))));
  const errors = groups
    .filter((group) => group.error)
    .map((group) => `${group.label}: ${group.error}`);
  if (options.json) {
    console.log(JSON.stringify({ topic: options.topic, window: { from: sinceDate, to: isoDate(now) }, groups, results: flat, errors }, null, 2));
  } else {
    console.log(`# Last 30 days packet`);
    console.log('');
    console.log(`Topic: ${options.topic}`);
    console.log(`Window: ${sinceDate} to ${isoDate(now)}`);
    console.log('');
    for (const group of groups) {
      console.log(`## ${group.label} (${group.results.length})`);
      for (const result of group.results.slice(0, options.limit)) {
        console.log(`- [${result.title}](${result.url})`);
        const meta = [result.date, result.stars !== undefined ? `${result.stars} stars` : null, result.source].filter(Boolean).join(' · ');
        if (meta) console.log(`  ${meta}`);
      if (result.snippet) console.log(`  ${result.snippet}`);
      }
      console.log('');
    }
    if (errors.length) {
      console.log('Source errors:');
      for (const error of errors) console.log(`- ${error}`);
      console.log('');
    }
    console.log('Next: open/read the strongest items. Treat search results as leads, not measured sentiment.');
  }
} catch (error) {
  console.error(formatError(error));
  process.exit(1);
}
