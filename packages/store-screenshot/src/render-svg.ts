import type { DerivedStoreScreenshotPage } from './derive.js';
import { placeDerivedStoreScreenshotAsset } from './placement.js';

export function compileStoreScreenshotSvg(page: DerivedStoreScreenshotPage): string {
  const { width, height } = page.size;
  const { background, accent, text } = page.colors;
  const headlineX = page.template.headlineAlign === 'center' ? width / 2 : width * 0.1;
  const headlineAnchor = page.template.headlineAlign === 'center' ? 'middle' : 'start';
  const headlineSize = page.template.headlineScale === 'display' ? width * 0.105 : width * 0.072;
  const screenshot = screenshotSvg(page, width, height, accent);
  const backgroundSvg = backgroundSvgFor(page, width, height, background, accent);
  const bodySvg = page.body === undefined
    ? ''
    : `<text x="${number(headlineX)}" y="${number(height * 0.24)}" fill="${escapeXml(text)}" font-size="${number(width * 0.033)}" text-anchor="${headlineAnchor}">${escapeXml(page.body)}</text>`;
  const labelSvg = page.template.accentLabel
    ? `<rect x="${number(width * 0.1)}" y="${number(height * 0.07)}" width="${number(width * 0.2)}" height="${number(height * 0.035)}" fill="${escapeXml(accent)}" rx="${number(width * 0.0175)}"/>`
    : '';

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${backgroundSvg}${labelSvg}<text x="${number(headlineX)}" y="${number(height * 0.17)}" fill="${escapeXml(text)}" font-size="${number(headlineSize)}" text-anchor="${headlineAnchor}">${escapeXml(page.headline)}</text>${bodySvg}${screenshot}</svg>`;
}

function backgroundSvgFor(page: DerivedStoreScreenshotPage, width: number, height: number, background: string, accent: string): string {
  if (page.template.background === 'gradient') {
    return `<defs><linearGradient id="background" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${escapeXml(background)}"/><stop offset="1" stop-color="${escapeXml(accent)}"/></linearGradient></defs><rect x="0" y="0" width="${width}" height="${height}" fill="url(#background)"/>`;
  }
  if (page.template.background === 'split') {
    return `<rect x="0" y="0" width="${width}" height="${number(height * 0.4)}" fill="${escapeXml(accent)}"/><rect x="0" y="${number(height * 0.4)}" width="${width}" height="${number(height * 0.6)}" fill="${escapeXml(background)}"/>`;
  }
  return `<rect x="0" y="0" width="${width}" height="${height}" fill="${escapeXml(background)}"/>`;
}

function screenshotSvg(page: DerivedStoreScreenshotPage, width: number, height: number, fallbackColor: string): string {
  const placement = placeDerivedStoreScreenshotAsset(page);
  if (!placement || page.screenshotAsset === undefined) return '';
  const color = page.screenshotAsset.color ?? fallbackColor;
  return `<rect x="${number(placement.left)}" y="${number(placement.top)}" width="${number(placement.width)}" height="${number(placement.height)}" fill="${escapeXml(color)}" rx="${number(placement.radius)}"/>`;
}

function number(value: number): string {
  return value.toFixed(2);
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}
