/*
 * submit-indexnow — submits canonical blog URLs to IndexNow-compatible
 * engines (Bing, Yandex, and partners).
 *
 * Usage:
 *   tsx submit-indexnow.ts --urls <file-or-csv> [--out file.json]
 *
 * Input accepts the same shapes as inspect-urls:
 *   { addedUrls: string[], modifiedUrls?: string[] } OR { urls: string[] }
 *   OR string[] OR comma-separated URLs.
 */
import { writeFileSync } from 'node:fs';
import {
  INDEXNOW_KEY,
  INDEXNOW_KEY_LOCATION,
  SITE,
  fetchWithRetry,
  loadUrlInput,
} from './lib.ts';

interface Args {
  urls: string;
  out?: string;
}

interface IndexNowResult {
  submittedAt: string;
  endpoint: string;
  urls: string[];
  status: number;
  ok: boolean;
  body: string;
}

function parseArgs(argv: string[]): Args {
  const args: Partial<Args> = {};
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--urls') args.urls = argv[++i];
    else if (argv[i] === '--out') args.out = argv[++i];
  }
  if (!args.urls) throw new Error('--urls is required');
  return args as Args;
}

async function submitChunk(urls: string[]): Promise<IndexNowResult> {
  const endpoint = 'https://api.indexnow.org/indexnow';
  const res = await fetchWithRetry(endpoint, {
    method: 'POST',
    headers: { 'content-type': 'application/json; charset=utf-8' },
    body: JSON.stringify({
      host: 'open-design.ai',
      key: INDEXNOW_KEY,
      keyLocation: INDEXNOW_KEY_LOCATION,
      urlList: urls,
    }),
  });
  return {
    submittedAt: new Date().toISOString(),
    endpoint,
    urls,
    status: res.status,
    ok: res.ok,
    body: await res.text(),
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = [...new Set(loadUrlInput(args.urls))].filter((url) =>
    url.startsWith(`${SITE}/blog/`),
  );
  if (urls.length === 0) {
    const empty: IndexNowResult[] = [];
    if (args.out) writeFileSync(args.out, JSON.stringify(empty, null, 2) + '\n');
    else process.stdout.write('[]\n');
    return;
  }

  const results: IndexNowResult[] = [];
  for (let i = 0; i < urls.length; i += 10_000) {
    results.push(await submitChunk(urls.slice(i, i + 10_000)));
  }
  const json = JSON.stringify(results, null, 2);
  if (args.out) writeFileSync(args.out, json + '\n');
  else process.stdout.write(json + '\n');

  const failed = results.filter((r) => !r.ok);
  if (failed.length > 0) {
    console.error(`IndexNow rejected ${failed.length}/${results.length} batch(es).`);
    process.exitCode = 1;
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
