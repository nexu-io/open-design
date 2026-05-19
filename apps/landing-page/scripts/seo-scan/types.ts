export const DEFAULT_SITE = 'https://open-design.ai';

export type Severity = 'critical' | 'warning' | 'info';

export interface Finding {
  severity: Severity;
  code: string;
  message: string;
  url?: string;
  file?: string;
  detail?: Record<string, unknown>;
}

export interface HtmlPage {
  file: string;
  routePath: string;
  url: string;
  html: string;
}

export interface SeoScanContext {
  outDir: string;
  reportDir: string;
  site: string;
  pages: HtmlPage[];
  sitemapUrls: Set<string>;
  filesystemUrls: Set<string>;
}

export interface SeoScanReport {
  scannedAt: string;
  site: string;
  outDir: string;
  totals: Record<Severity, number>;
  pageCount: number;
  sitemapUrlCount: number;
  findings: Finding[];
}
