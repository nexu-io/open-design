#!/usr/bin/env node
/**
 * bird-search.mjs - Vendored Bird CLI search wrapper for /last30days.
 * Subset of @steipete/bird v0.8.0 (MIT License, Peter Steinberger).
 *
 * Usage:
 *   node bird-search.mjs <query> [--count N] [--json]
 *   node bird-search.mjs --whoami
 *   node bird-search.mjs --check
 */

import { resolveCredentials } from './lib/cookies.js';
import { TwitterClientBase } from './lib/twitter-client-base.js';
import { withSearch } from './lib/twitter-client-search.js';

// Build a search-only client (no posting, bookmarks, etc.)
const SearchClient = withSearch(TwitterClientBase);

const args = process.argv.slice(2);

function writeStdout(text) {
  if (text) process.stdout.write(text);
}

function writeStderr(text) {
  if (text) process.stderr.write(text);
}

async function main() {
  // --check: verify that credentials can be resolved
  if (args.includes('--check')) {
    try {
      const { cookies, warnings } = await resolveCredentials({});
      if (cookies.authToken && cookies.ct0) {
        writeStdout(JSON.stringify({ authenticated: true, source: cookies.source }));
        return 0;
      }
      writeStdout(JSON.stringify({ authenticated: false, warnings }));
      return 1;
    } catch (err) {
      writeStdout(JSON.stringify({ authenticated: false, error: err.message }));
      return 1;
    }
  }

  // --whoami: check auth and output source
  if (args.includes('--whoami')) {
    try {
      const { cookies } = await resolveCredentials({});
      if (cookies.authToken && cookies.ct0) {
        writeStdout(cookies.source || 'authenticated');
        return 0;
      }
      writeStderr('Not authenticated\n');
      return 1;
    } catch (err) {
      writeStderr(`Auth check failed: ${err.message}\n`);
      return 1;
    }
  }

  // Parse search args
  let query = null;
  let count = 20;
  let jsonOutput = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--count' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '-n' && args[i + 1]) {
      count = parseInt(args[i + 1], 10);
      i++;
    } else if (args[i] === '--json') {
      jsonOutput = true;
    } else if (!args[i].startsWith('-')) {
      query = args[i];
    }
  }

  if (!query) {
    writeStderr('Usage: node bird-search.mjs <query> [--count N] [--json]\n');
    return 1;
  }

  try {
    // Resolve credentials (env vars, then browser cookies)
    const { cookies, warnings } = await resolveCredentials({});

    if (!cookies.authToken || !cookies.ct0) {
      const msg = warnings.length > 0 ? warnings.join('; ') : 'No Twitter credentials found';
      if (jsonOutput) {
        writeStdout(JSON.stringify({ error: msg, items: [] }));
      } else {
        writeStderr(`Error: ${msg}\n`);
      }
      return 1;
    }

    const client = new SearchClient({
      cookies: {
        authToken: cookies.authToken,
        ct0: cookies.ct0,
        cookieHeader: cookies.cookieHeader,
      },
      timeoutMs: 30000,
    });

    const result = await client.search(query, count);

    if (!result.success) {
      if (jsonOutput) {
        writeStdout(JSON.stringify({ error: result.error, items: [] }));
      } else {
        writeStderr(`Search failed: ${result.error}\n`);
      }
      return 1;
    }

    const tweets = result.tweets || [];
    if (jsonOutput) {
      writeStdout(JSON.stringify(tweets));
    } else {
      for (const tweet of tweets) {
        const author = tweet.author?.username || 'unknown';
        writeStdout(`@${author}: ${tweet.text?.slice(0, 200)}\n\n`);
      }
    }

    return 0;
  } catch (err) {
    if (jsonOutput) {
      writeStdout(JSON.stringify({ error: err.message, items: [] }));
    } else {
      writeStderr(`Error: ${err.message}\n`);
    }
    return 1;
  }
}

try {
  const code = await main();
  process.exitCode = Number.isInteger(code) ? code : 1;
} catch (err) {
  writeStderr(`Fatal error: ${err?.message || err}\n`);
  process.exitCode = 1;
}
