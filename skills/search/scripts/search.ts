#!/usr/bin/env -S node --experimental-strip-types

const BRAVE_ENDPOINT = 'https://api.search.brave.com/res/v1/web/search';
const DDG_ENDPOINT = 'https://html.duckduckgo.com/html/';

function parseArgs(argv) {
  const out = { query: '', limit: 8, engine: 'auto', json: false };
  const parts = [];
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--json') {
      out.json = true;
    } else if (arg === '--limit') {
      out.limit = Number(argv[++i] ?? out.limit);
    } else if (arg === '--engine') {
      out.engine = argv[++i] ?? out.engine;
    } else {
      parts.push(arg);
    }
  }
  out.query = parts.join(' ').trim();
  if (!out.query) {
    throw new Error('Usage: node --experimental-strip-types scripts/search.ts "query" [--limit 8] [--engine auto|brave|duckduckgo] [--json]');
  }
  if (!Number.isFinite(out.limit) || out.limit < 1) out.limit = 8;
  out.limit = Math.min(Math.floor(out.limit), 20);
  return out;
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
    if (uddg) return decodeURIComponent(uddg);
    return absolute;
  } catch {
    return decoded;
  }
}

async function braveSearch(query, limit) {
  const token = process.env.BRAVE_API_KEY;
  if (!token) throw new Error('BRAVE_API_KEY is not set');
  const url = new URL(BRAVE_ENDPOINT);
  url.searchParams.set('q', query);
  url.searchParams.set('count', String(limit));
  const response = await fetch(url, {
    headers: {
      Accept: 'application/json',
      'X-Subscription-Token': token,
    },
  });
  if (!response.ok) {
    throw new Error(`Brave Search failed: HTTP ${response.status}`);
  }
  const json = await response.json();
  const results = json?.web?.results ?? [];
  return results.slice(0, limit).map((item) => ({
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
    headers: {
      'User-Agent': 'OpenDesignSkillSearch/1.0 (+https://github.com/nexu-io/open-design)',
    },
  });
  if (!response.ok) {
    throw new Error(`DuckDuckGo search failed: HTTP ${response.status}`);
  }
  const html = await response.text();
  const blocks = html.split(/<div class="result\b/).slice(1);
  const out = [];
  for (const block of blocks) {
    const link = block.match(/<a[^>]+class="result__a"[^>]+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/);
    if (!link) continue;
    const snippet = block.match(/<a[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/a>/)
      ?? block.match(/<div[^>]+class="result__snippet"[^>]*>([\s\S]*?)<\/div>/);
    out.push({
      title: stripTags(link[2] ?? ''),
      url: normalizeDuckDuckGoUrl(link[1] ?? ''),
      snippet: snippet ? stripTags(snippet[1] ?? '') : '',
      source: 'duckduckgo',
    });
    if (out.length >= limit) break;
  }
  return out;
}

async function runSearch({ query, limit, engine }) {
  const errors = [];
  async function attempt(label, fn) {
    try {
      return await fn();
    } catch (error) {
      const message = formatError(error);
      errors.push(`${label}: ${message}`);
      console.error(`${label} unavailable: ${message}`);
      return null;
    }
  }

  if (engine === 'brave') {
    return { results: (await attempt('Brave Search', () => braveSearch(query, limit))) ?? [], errors };
  }
  if (engine === 'duckduckgo') {
    return { results: (await attempt('DuckDuckGo', () => duckDuckGoSearch(query, limit))) ?? [], errors };
  }
  if (process.env.BRAVE_API_KEY) {
    const braveResults = await attempt('Brave Search', () => braveSearch(query, limit));
    if (braveResults) return { results: braveResults, errors };
  }
  return { results: (await attempt('DuckDuckGo', () => duckDuckGoSearch(query, limit))) ?? [], errors };
}

function printMarkdown(query, results) {
  console.log(`# Search results`);
  console.log('');
  console.log(`Query: ${query}`);
  console.log('');
  if (results.length === 0) {
    console.log('No results found.');
    return;
  }
  results.forEach((result, index) => {
    console.log(`${index + 1}. [${result.title}](${result.url})`);
    if (result.snippet) console.log(`   ${result.snippet}`);
    console.log(`   Source: ${result.source}`);
  });
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
  const { results, errors } = await runSearch(options);
  if (options.json) {
    console.log(JSON.stringify({ query: options.query, results, errors }, null, 2));
  } else {
    printMarkdown(options.query, results);
    if (errors.length) {
      console.log('');
      console.log('Source errors:');
      for (const error of errors) console.log(`- ${error}`);
    }
  }
} catch (error) {
  console.error(formatError(error));
  process.exit(1);
}
