/*
 * query-search-analytics — fetches GSC Search Analytics metrics for
 * canonical blog URLs over 7d and 28d windows.
 *
 * Usage:
 *   tsx query-search-analytics.ts --urls <file-or-csv> [--out file.json]
 */
import { writeFileSync } from 'node:fs';
import {
  type SearchAnalyticsRecord,
  SITE,
  loadUrlInput,
  querySearchAnalytics,
} from './lib.ts';

interface Args {
  urls: string;
  out?: string;
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const urls = [...new Set(loadUrlInput(args.urls))].filter((url) =>
    url.startsWith(`${SITE}/blog/`),
  );
  const records: SearchAnalyticsRecord[] = [];
  for (const url of urls) {
    records.push(await querySearchAnalytics(url, 7));
    records.push(await querySearchAnalytics(url, 28));
  }
  const json = JSON.stringify(records, null, 2);
  if (args.out) writeFileSync(args.out, json + '\n');
  else process.stdout.write(json + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
