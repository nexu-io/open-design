/*
 * inspect-urls — calls GSC URL Inspection API for each URL and writes
 * an InspectionRecord[] JSON.
 *
 *   Usage: tsx inspect-urls.ts --urls <file-or-csv> [--out file.json]
 *
 * `--urls` accepts either:
 *   - a JSON file with shape { addedUrls: string[], modifiedUrls?: string[] }
 *     OR  { urls: string[] }  OR  string[]
 *   - a comma-separated list of URLs (e.g. when called with @{job.outputs})
 *
 * Failures on individual URLs are recorded inline as `{ error: string }`
 * — one bad URL doesn't take the rest of the batch down.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import { type InspectionRecord, fileExists, inspectUrl } from './lib.ts';

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

function loadUrls(input: string): string[] {
  if (fileExists(input)) {
    const raw = JSON.parse(readFileSync(input, 'utf8'));
    if (Array.isArray(raw)) return raw as string[];
    if (Array.isArray(raw.urls)) return raw.urls as string[];
    return [...(raw.addedUrls ?? []), ...(raw.modifiedUrls ?? [])] as string[];
  }
  return input
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

async function main() {
  const { urls: urlsArg, out } = parseArgs(process.argv.slice(2));
  const urls = [...new Set(loadUrls(urlsArg))];

  const records: InspectionRecord[] = [];
  for (const url of urls) {
    const inspectedAt = new Date().toISOString();
    try {
      const result = await inspectUrl(url);
      records.push({ url, inspectedAt, result });
    } catch (err) {
      records.push({
        url,
        inspectedAt,
        result: { error: (err as Error).message },
      });
    }
  }

  const json = JSON.stringify(records, null, 2);
  if (out) writeFileSync(out, json + '\n');
  else process.stdout.write(json + '\n');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
