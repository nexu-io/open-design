import { describe, expect, it } from 'vitest';

import {
  collectPreviewAssetPaths,
  htmlHasRelativeProjectAssetRefs,
  htmlHasRootRelativeProjectAssetRefs,
} from '../../src/components/file-viewer-preview-assets';

/**
 * `preview-asset-warning` — the only "your preview could not load something"
 * surface in FileViewer — is fed by `collectPreviewAssetPaths`, whose output
 * FileViewer probes one path at a time through the project raw route.
 *
 * Every path it can produce is a path *inside the project*. A reference to a
 * CDN script, a Google Fonts stylesheet, a webfont file or an external API is
 * dropped before the probe list is built, so no response from the raw route can
 * ever describe it. That means the warning is structurally incapable of firing
 * for an artifact whose resources are refused because they are externally
 * hosted — the user gets a half-rendered artifact and an empty explanation.
 *
 * These tests pin that gap down. The project-internal cases are the positive
 * control: they prove the collector is working and that a `[]` result for the
 * external cases is a real absence rather than a broken assertion.
 */

const OWNER = 'index.html';

const CDN_SCRIPT_HTML = `<!doctype html><html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
</head><body><canvas id="c"></canvas></body></html>`;

const GOOGLE_FONTS_HTML = `<!doctype html><html><head>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Playfair+Display:wght@700&display=swap" rel="stylesheet">
<style>@font-face { src: url(https://fonts.gstatic.com/s/playfairdisplay/v37/font.woff2); }</style>
</head><body><h1>Elegance in every letterform</h1></body></html>`;

const EXTERNAL_MEDIA_HTML = `<!doctype html><html><body>
<img src="https://images.example.com/hero.png" srcset="https://images.example.com/hero@2x.png 2x">
<script src="//cdn.example.com/protocol-relative.js"></script>
</body></html>`;

describe('preview asset preflight and externally-hosted resources', () => {
  it('collects nothing to probe for a CDN-scripted artifact', () => {
    expect(collectPreviewAssetPaths(CDN_SCRIPT_HTML, OWNER, null)).toEqual([]);
  });

  it('collects nothing to probe for a Google Fonts artifact', () => {
    expect(collectPreviewAssetPaths(GOOGLE_FONTS_HTML, OWNER, null)).toEqual([]);
  });

  it('collects nothing to probe for externally hosted media and protocol-relative scripts', () => {
    expect(collectPreviewAssetPaths(EXTERNAL_MEDIA_HTML, OWNER, null)).toEqual([]);
  });

  it('does not treat externally hosted references as project asset references', () => {
    for (const html of [CDN_SCRIPT_HTML, GOOGLE_FONTS_HTML, EXTERNAL_MEDIA_HTML]) {
      expect(htmlHasRootRelativeProjectAssetRefs(html, null)).toBe(false);
      expect(htmlHasRelativeProjectAssetRefs(html, OWNER, null)).toBe(false);
    }
  });

  // Positive control: the same collector does see project-internal references,
  // so the empty results above are the gap and not a dead assertion.
  it('still collects project-internal references so the empty results above are meaningful', () => {
    const internal = `<!doctype html><html><head>
<link rel="stylesheet" href="styles/main.css">
</head><body><img src="/assets/hero.png"></body></html>`;
    expect(collectPreviewAssetPaths(internal, OWNER, null).sort()).toEqual([
      'assets/hero.png',
      'styles/main.css',
    ]);
  });

  it('collects only the project-internal half of an artifact that mixes both', () => {
    const mixed = `<!doctype html><html><head>
<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js"></script>
<link href="https://fonts.googleapis.com/css2?family=Inter&display=swap" rel="stylesheet">
<link rel="stylesheet" href="styles/main.css">
</head><body><img src="assets/logo.svg"></body></html>`;
    expect(collectPreviewAssetPaths(mixed, OWNER, null).sort()).toEqual([
      'assets/logo.svg',
      'styles/main.css',
    ]);
  });
});
