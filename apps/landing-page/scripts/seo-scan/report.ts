import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Finding, SeoScanContext, SeoScanReport, Severity } from './types.ts';

function totals(findings: Finding[]): Record<Severity, number> {
  return findings.reduce<Record<Severity, number>>(
    (acc, finding) => {
      acc[finding.severity] += 1;
      return acc;
    },
    { critical: 0, warning: 0, info: 0 },
  );
}

export function makeReport(ctx: SeoScanContext, findings: Finding[]): SeoScanReport {
  return {
    scannedAt: new Date().toISOString(),
    site: ctx.site,
    outDir: path.relative(process.cwd(), ctx.outDir),
    totals: totals(findings),
    pageCount: ctx.pages.length,
    sitemapUrlCount: ctx.sitemapUrls.size,
    findings,
  };
}

export function markdownReport(report: SeoScanReport): string {
  const lines = [
    '# SEO + Funnel Health Report',
    '',
    `Generated: ${report.scannedAt}`,
    `Site: ${report.site}`,
    `Pages scanned: ${report.pageCount}`,
    `Sitemap URLs: ${report.sitemapUrlCount}`,
    '',
    '## Summary',
    '',
    `- Critical: ${report.totals.critical}`,
    `- Warning: ${report.totals.warning}`,
    `- Info: ${report.totals.info}`,
    '',
  ];

  for (const severity of ['critical', 'warning', 'info'] as const) {
    const findings = report.findings.filter((finding) => finding.severity === severity);
    lines.push(`## ${severity[0]!.toUpperCase()}${severity.slice(1)}`, '');
    if (findings.length === 0) {
      lines.push('No findings.', '');
      continue;
    }
    for (const finding of findings) {
      const scope = finding.url ?? finding.file ?? 'site';
      lines.push(`- \`${finding.code}\` ${scope}: ${finding.message}`);
      if (finding.detail) lines.push(`  Detail: \`${JSON.stringify(finding.detail)}\``);
    }
    lines.push('');
  }

  return `${lines.join('\n')}\n`;
}

export function writeReports(ctx: SeoScanContext, report: SeoScanReport): void {
  mkdirSync(ctx.reportDir, { recursive: true });
  writeFileSync(path.join(ctx.reportDir, 'seo-scan-report.json'), JSON.stringify(report, null, 2));
  writeFileSync(path.join(ctx.reportDir, 'seo-scan-report.md'), markdownReport(report));
}
