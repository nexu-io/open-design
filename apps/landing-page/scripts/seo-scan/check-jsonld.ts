import path from 'node:path';
import { jsonLdBlocks } from './html.ts';
import type { Finding, SeoScanContext } from './types.ts';

function asObjects(value: unknown): Record<string, unknown>[] {
  if (Array.isArray(value)) return value.filter((item): item is Record<string, unknown> => item !== null && typeof item === 'object');
  return value !== null && typeof value === 'object' ? [value as Record<string, unknown>] : [];
}

export function checkJsonLd(ctx: SeoScanContext): Finding[] {
  const findings: Finding[] = [];
  for (const page of ctx.pages) {
    for (const block of jsonLdBlocks(page.html)) {
      let parsed: unknown;
      try {
        parsed = JSON.parse(block);
      } catch (error) {
        findings.push({
          severity: 'critical',
          code: 'jsonld-parse',
          message: `JSON-LD is not parseable: ${error instanceof Error ? error.message : String(error)}`,
          url: page.url,
          file: path.relative(process.cwd(), page.file),
        });
        continue;
      }

      for (const object of asObjects(parsed)) {
        if (object['@context'] !== 'https://schema.org') {
          findings.push({
            severity: 'warning',
            code: 'jsonld-context',
            message: 'JSON-LD block does not use https://schema.org context.',
            url: page.url,
            file: path.relative(process.cwd(), page.file),
          });
        }
        const type = object['@type'];
        if (typeof type !== 'string' || type.length === 0) {
          findings.push({
            severity: 'critical',
            code: 'jsonld-type',
            message: 'JSON-LD block is missing @type.',
            url: page.url,
            file: path.relative(process.cwd(), page.file),
          });
        }
        if (type === 'Article' && typeof object.datePublished !== 'string') {
          findings.push({
            severity: 'critical',
            code: 'jsonld-article-date',
            message: 'Article JSON-LD is missing datePublished.',
            url: page.url,
            file: path.relative(process.cwd(), page.file),
          });
        }
      }
    }
  }
  return findings;
}
