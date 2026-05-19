import path from 'node:path';
import { closeSync, existsSync, openSync, readSync } from 'node:fs';
import { anchors, attr, metaContent, tags } from './html.ts';
import type { Finding, SeoScanContext } from './types.ts';

function fileForPath(outDir: string, pathname: string): string {
  const clean = decodeURIComponent(pathname).replace(/^\/+/, '');
  if (!clean || pathname.endsWith('/')) return path.join(outDir, clean, 'index.html');
  return path.join(outDir, clean);
}

function imageDimensions(file: string): { width: number; height: number } | null {
  if (!existsSync(file)) return null;
  const buffer = Buffer.alloc(32);
  const fd = openSync(file, 'r');
  try {
    readSync(fd, buffer, 0, 32, 0);
  } finally {
    closeSync(fd);
  }
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) {
    return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
  }
  if (buffer[0] === 0xff && buffer[1] === 0xd8) return null;
  return null;
}

export function checkLinks(ctx: SeoScanContext): Finding[] {
  const findings: Finding[] = [];
  for (const page of ctx.pages) {
    for (const anchor of anchors(page.html)) {
      if (anchor.href.startsWith('#') || anchor.href.startsWith('mailto:') || anchor.href.startsWith('tel:')) continue;
      let url: URL;
      try {
        url = new URL(anchor.href, page.url);
      } catch {
        findings.push({
          severity: 'critical',
          code: 'invalid-link',
          message: 'Anchor href is not a valid URL.',
          url: page.url,
          file: path.relative(process.cwd(), page.file),
          detail: { href: anchor.href, text: anchor.text },
        });
        continue;
      }
      if (url.origin !== ctx.site) continue;
      const target = fileForPath(ctx.outDir, url.pathname);
      if (!existsSync(target)) {
        findings.push({
          severity: 'critical',
          code: 'broken-internal-link',
          message: 'Internal link does not resolve to a generated asset.',
          url: page.url,
          file: path.relative(process.cwd(), page.file),
          detail: { href: anchor.href, target: path.relative(process.cwd(), target), text: anchor.text },
        });
      }
    }

    const ogImage = metaContent(page.html, 'property', 'og:image');
    if (ogImage) {
      const url = new URL(ogImage, page.url);
      if (url.origin === ctx.site) {
        const imageFile = fileForPath(ctx.outDir, url.pathname);
        if (!existsSync(imageFile)) {
          findings.push({
            severity: 'warning',
            code: 'og-image-missing',
            message: 'OG image URL is not present in the generated output.',
            url: page.url,
            file: path.relative(process.cwd(), page.file),
            detail: { ogImage },
          });
        } else {
          const size = imageDimensions(imageFile);
          if (size && (Math.abs(size.width - 1200) > 80 || Math.abs(size.height - 630) > 80)) {
            findings.push({
              severity: 'warning',
              code: 'og-image-size',
              message: `OG image is ${size.width}x${size.height}; target is 1200x630.`,
              url: page.url,
              file: path.relative(process.cwd(), page.file),
              detail: { ogImage, ...size },
            });
          }
        }
      }
    }

    for (const tag of tags(page.html, 'img')) {
      const src = attr(tag, 'src');
      if (!src || /^(https?:)?\/\//.test(src) || src.startsWith('data:')) continue;
      const target = fileForPath(ctx.outDir, new URL(src, page.url).pathname);
      if (!existsSync(target)) {
        findings.push({
          severity: 'critical',
          code: 'missing-image-asset',
          message: 'Image source does not resolve to a generated asset.',
          url: page.url,
          file: path.relative(process.cwd(), page.file),
          detail: { src },
        });
      }
    }
  }
  return findings;
}
