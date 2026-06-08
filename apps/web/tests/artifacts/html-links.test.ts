import { describe, expect, it } from 'vitest';

import {
  canOverwriteHtmlArtifactEntry,
  resolveHtmlArtifactFileName,
  rewriteHtmlLinksToCurrentProjectFiles,
} from '../../src/artifacts/html-links';

describe('resolveHtmlArtifactFileName', () => {
  it('keeps index.html as the stable entry point when the saved artifact already owns it', () => {
    expect(
      resolveHtmlArtifactFileName({
        baseName: 'index',
        ext: '.html',
        existingFileNames: new Set(['index.html']),
        savedArtifactName: 'index.html',
      }),
    ).toBe('index.html');
  });

  it('uses a suffix for index.html when the existing file is unrelated', () => {
    expect(
      resolveHtmlArtifactFileName({
        baseName: 'index',
        ext: '.html',
        existingFileNames: new Set(['index.html']),
      }),
    ).toBe('index-2.html');
  });

  it('keeps index.html when overwrite ownership is proven by the caller', () => {
    expect(
      resolveHtmlArtifactFileName({
        baseName: 'index',
        ext: '.html',
        existingFileNames: new Set(['index.html']),
        canOverwriteExistingEntry: true,
      }),
    ).toBe('index.html');
  });

  it('keeps numbered collision names for non-entry html artifacts', () => {
    expect(
      resolveHtmlArtifactFileName({
        baseName: 'about',
        ext: '.html',
        existingFileNames: new Set(['about.html', 'about-2.html']),
      }),
    ).toBe('about-3.html');
  });
});

describe('canOverwriteHtmlArtifactEntry', () => {
  it('allows index.html overwrite when the saved artifact already owns it', () => {
    expect(
      canOverwriteHtmlArtifactEntry({
        baseName: 'index',
        ext: '.html',
        projectFiles: [
          htmlFile('index.html', 10, { artifactIdentifier: 'index' }),
        ],
        savedArtifactName: 'index.html',
      }),
    ).toBe(true);
  });

  it('rejects index.html overwrite when only the shared manifest identifier matches', () => {
    expect(
      canOverwriteHtmlArtifactEntry({
        baseName: 'index',
        ext: '.html',
        projectFiles: [
          htmlFile('index.html', 10, {
            artifactIdentifier: 'index',
            artifactGroupIdentifier: 'site-a',
          }),
        ],
      }),
    ).toBe(false);
  });
});

describe('rewriteHtmlLinksToCurrentProjectFiles', () => {
  it('rewrites relative html links to the newest matching project file', () => {
    const html =
      '<!doctype html><html><body>' +
      '<a href="about.html">About</a>' +
      '<a href="contact.html?tab=team#lead">Contact</a>' +
      '<a href="#local">Local</a>' +
      '<a href="https://example.com/about.html">External</a>' +
      '</body></html>';

    const out = rewriteHtmlLinksToCurrentProjectFiles(html, [
      htmlFile('about.html', 10, { artifactIdentifier: 'about', artifactGroupIdentifier: 'site-a' }),
      htmlFile('about-2.html', 30, { artifactIdentifier: 'about', artifactGroupIdentifier: 'site-a' }),
      htmlFile('contact.html', 20, { artifactIdentifier: 'contact', artifactGroupIdentifier: 'site-a' }),
      htmlFile('contact-2.html', 40, { artifactIdentifier: 'contact', artifactGroupIdentifier: 'site-a' }),
    ], { artifactGroupIdentifier: 'site-a' });

    expect(out).toContain('href="about-2.html"');
    expect(out).toContain('href="contact-2.html?tab=team#lead"');
    expect(out).toContain('href="#local"');
    expect(out).toContain('href="https://example.com/about.html"');
  });

  it('rewrites home links when the artifact entry had to move off index.html', () => {
    const html =
      '<!doctype html><html><body>' +
      '<a href="index.html">Home</a>' +
      '<a href="./index.html#top">Top</a>' +
      '</body></html>';

    const out = rewriteHtmlLinksToCurrentProjectFiles(html, [
      htmlFile('index.html', 10, { artifactIdentifier: 'index', artifactGroupIdentifier: 'site-a' }),
      htmlFile('index-2.html', 40, { artifactIdentifier: 'index', artifactGroupIdentifier: 'site-a' }),
    ], { artifactGroupIdentifier: 'site-a' });

    expect(out).toContain('href="index-2.html"');
    expect(out).toContain('href="./index-2.html#top"');
  });

  it('does not rewrite to an unrelated newer numbered html file', () => {
    const html =
      '<!doctype html><html><body>' +
      '<a href="about.html">About</a>' +
      '</body></html>';

    const out = rewriteHtmlLinksToCurrentProjectFiles(html, [
      htmlFile('about.html', 10, { artifactIdentifier: 'about', artifactGroupIdentifier: 'site-a' }),
      htmlFile('about-2.html', 40, { artifactIdentifier: 'other-about', artifactGroupIdentifier: 'site-b' }),
    ], { artifactGroupIdentifier: 'site-a' });

    expect(out).toContain('href="about.html"');
    expect(out).not.toContain('href="about-2.html"');
  });

  it('does not rewrite to another artifact group with the same page identifier', () => {
    const html =
      '<!doctype html><html><body>' +
      '<a href="about.html">About</a>' +
      '</body></html>';

    const out = rewriteHtmlLinksToCurrentProjectFiles(html, [
      htmlFile('about.html', 10, { artifactIdentifier: 'about', artifactGroupIdentifier: 'site-a' }),
      htmlFile('about-2.html', 40, { artifactIdentifier: 'about', artifactGroupIdentifier: 'site-b' }),
    ], { artifactGroupIdentifier: 'site-a' });

    expect(out).toContain('href="about.html"');
    expect(out).not.toContain('href="about-2.html"');
  });

  it('falls back to legacy same-identifier files when no group-tagged candidates exist', () => {
    const html =
      '<!doctype html><html><body>' +
      '<a href="about.html">About</a>' +
      '</body></html>';

    const out = rewriteHtmlLinksToCurrentProjectFiles(html, [
      htmlFile('about.html', 10, { artifactIdentifier: 'about' }),
      htmlFile('about-2.html', 40, { artifactIdentifier: 'about' }),
    ], { artifactGroupIdentifier: 'site-a' });

    expect(out).toContain('href="about-2.html"');
  });

  it('does not fall back to legacy files when a group-tagged candidate family exists', () => {
    const html =
      '<!doctype html><html><body>' +
      '<a href="about.html">About</a>' +
      '</body></html>';

    const out = rewriteHtmlLinksToCurrentProjectFiles(html, [
      htmlFile('about.html', 10, { artifactIdentifier: 'about' }),
      htmlFile('about-2.html', 20, { artifactIdentifier: 'about' }),
      htmlFile('about-3.html', 40, {
        artifactIdentifier: 'about',
        artifactGroupIdentifier: 'site-b',
      }),
    ], { artifactGroupIdentifier: 'site-a' });

    expect(out).toContain('href="about.html"');
    expect(out).not.toContain('href="about-2.html"');
    expect(out).not.toContain('href="about-3.html"');
  });
});

function htmlFile(
  name: string,
  mtime: number,
  options: { artifactIdentifier?: string; artifactGroupIdentifier?: string } = {},
) {
  return {
    name,
    kind: 'html',
    mime: 'text/html',
    size: 1,
    mtime,
    artifactManifest: options.artifactIdentifier !== undefined
      ? {
          entry: name,
          metadata: {
            identifier: options.artifactIdentifier,
            artifactGroupIdentifier: options.artifactGroupIdentifier,
          },
        }
      : undefined,
  };
}
