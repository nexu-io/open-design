import path from 'node:path';
import { attr, h1Texts, linkHref, metaContent, title as getTitle } from './html.ts';
import type { Finding, SeoScanContext } from './types.ts';

const REQUIRED_OG = ['og:type', 'og:site_name', 'og:title', 'og:description', 'og:url', 'og:image'];
const REQUIRED_TWITTER = ['twitter:card', 'twitter:title', 'twitter:description', 'twitter:image'];

function finding(
  severity: Finding['severity'],
  code: string,
  message: string,
  url: string,
  file: string,
  detail?: Record<string, unknown>,
): Finding {
  return { severity, code, message, url, file: path.relative(process.cwd(), file), detail };
}

export function checkHead(ctx: SeoScanContext): Finding[] {
  const findings: Finding[] = [];
  const titleSeen = new Map<string, string[]>();
  const descriptionSeen = new Map<string, string[]>();
  const canonicalSeen = new Map<string, string[]>();

  for (const page of ctx.pages) {
    const pageTitle = getTitle(page.html);
    const description = metaContent(page.html, 'name', 'description');
    const canonical = linkHref(page.html, 'canonical');
    const headings = h1Texts(page.html);

    if (!pageTitle) {
      findings.push(finding('critical', 'missing-title', 'Missing <title>.', page.url, page.file));
    } else {
      if (pageTitle.length < 30 || pageTitle.length > 60) {
        findings.push(
          finding('warning', 'title-length', `Title length is ${pageTitle.length}; target is 30-60.`, page.url, page.file),
        );
      }
      titleSeen.set(pageTitle, [...(titleSeen.get(pageTitle) ?? []), page.url]);
    }

    if (!description) {
      findings.push(finding('critical', 'missing-description', 'Missing meta description.', page.url, page.file));
    } else {
      if (description.length < 110 || description.length > 160) {
        findings.push(
          finding('warning', 'description-length', `Description length is ${description.length}; target is 110-160.`, page.url, page.file),
        );
      }
      descriptionSeen.set(description, [...(descriptionSeen.get(description) ?? []), page.url]);
    }

    if (!canonical) {
      findings.push(finding('critical', 'missing-canonical', 'Missing canonical link.', page.url, page.file));
    } else {
      canonicalSeen.set(canonical, [...(canonicalSeen.get(canonical) ?? []), page.url]);
      if (!canonical.startsWith(ctx.site)) {
        findings.push(finding('critical', 'canonical-host', `Canonical is outside ${ctx.site}.`, page.url, page.file, { canonical }));
      }
      if (canonical !== page.url) {
        findings.push(finding('critical', 'canonical-self', 'Canonical does not match the generated route URL.', page.url, page.file, { canonical }));
      }
      if (!ctx.sitemapUrls.has(canonical) && !page.routePath.startsWith('/og/')) {
        findings.push(finding('critical', 'canonical-not-in-sitemap', 'Canonical is not present in the sitemap.', page.url, page.file, { canonical }));
      }
    }

    for (const property of REQUIRED_OG) {
      if (!metaContent(page.html, 'property', property)) {
        findings.push(finding('warning', 'missing-og', `Missing Open Graph tag ${property}.`, page.url, page.file));
      }
    }
    for (const name of REQUIRED_TWITTER) {
      if (!metaContent(page.html, 'name', name)) {
        findings.push(finding('warning', 'missing-twitter', `Missing Twitter card tag ${name}.`, page.url, page.file));
      }
    }
    if (!metaContent(page.html, 'name', 'viewport')) {
      findings.push(finding('critical', 'missing-viewport', 'Missing viewport meta tag.', page.url, page.file));
    }
    if (!metaContent(page.html, 'name', 'theme-color')) {
      findings.push(finding('warning', 'missing-theme-color', 'Missing theme-color meta tag.', page.url, page.file));
    }

    if (headings.length !== 1) {
      findings.push(finding('critical', 'h1-count', `Expected exactly one <h1>; found ${headings.length}.`, page.url, page.file));
    } else {
      const slug = page.routePath.split('/').filter(Boolean).at(-1)?.replaceAll('-', ' ').toLowerCase();
      if (slug && headings[0]?.trim().toLowerCase() === slug) {
        findings.push(finding('warning', 'h1-slug', 'H1 is identical to the route slug.', page.url, page.file, { h1: headings[0] }));
      }
    }

    for (const tag of page.html.matchAll(/<img\b[^>]*>/gi)) {
      const alt = attr(tag[0], 'alt');
      if (alt === null) {
        findings.push(finding('warning', 'missing-img-alt', 'Image is missing an alt attribute.', page.url, page.file));
      }
    }
  }

  for (const [duplicateTitle, urls] of titleSeen) {
    if (urls.length > 1) {
      findings.push({ severity: 'warning', code: 'duplicate-title', message: 'Duplicate title across pages.', detail: { title: duplicateTitle, urls } });
    }
  }
  for (const [duplicateDescription, urls] of descriptionSeen) {
    if (urls.length > 1) {
      findings.push({ severity: 'warning', code: 'duplicate-description', message: 'Duplicate meta description across pages.', detail: { description: duplicateDescription, urls } });
    }
  }
  for (const [canonical, urls] of canonicalSeen) {
    if (urls.length > 1) {
      findings.push({ severity: 'critical', code: 'duplicate-canonical', message: 'Duplicate canonical across pages.', detail: { canonical, urls } });
    }
  }

  return findings;
}
