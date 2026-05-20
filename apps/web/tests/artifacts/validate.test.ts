import { describe, expect, it } from 'vitest';

import { validateHtmlArtifact } from '../../src/artifacts/validate';

describe('validateHtmlArtifact', () => {
  it('rejects an empty string', () => {
    const result = validateHtmlArtifact('');
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/empty/i);
  });

  it('rejects whitespace-only content', () => {
    const result = validateHtmlArtifact('   \n\t  ');
    expect(result.ok).toBe(false);
  });

  it('rejects a one-line prose summary (the #50 phantom-artifact case)', () => {
    const prose = '查看 `html-ppt-xhs-white-editorial/index.html` — 已删第 2 页（章节分隔）和第 8 页（致谢），剩余 6 张移除顶部 chrome，仅保留右下角 `01/06`–`06/06` 页码。';
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/html/i);
  });

  it('rejects content shorter than the minimum threshold even if it contains angle brackets', () => {
    const result = validateHtmlArtifact('<p>hi</p>');
    expect(result.ok).toBe(false);
  });

  it('rejects a long prose blob that lacks any HTML structural markers', () => {
    const prose = '这是一段很长的中文总结，'.repeat(20);
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
  });

  it('rejects long prose that mentions an inline <html ...> tag mid-sentence (mrcfps finding)', () => {
    const prose = 'Updated the <html lang> attribute and cleaned up the footer layout for mobile previews.';
    expect(prose.length).toBeGreaterThan(64);
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
  });

  it('rejects long prose that mentions <!doctype html> mid-sentence', () => {
    const prose = 'I added a <!doctype html> declaration at the top and rewrote the body section to match the brief.';
    expect(prose.length).toBeGreaterThan(64);
    const result = validateHtmlArtifact(prose);
    expect(result.ok).toBe(false);
  });

  it('rejects content where the first non-whitespace token is a non-document tag like <p>', () => {
    const fragment = '<p>This is a paragraph that happens to contain enough chars and a stray <html> mention.</p>';
    const result = validateHtmlArtifact(fragment);
    expect(result.ok).toBe(false);
  });

  it('rejects links to reserved project storage paths', () => {
    const html = '<!doctype html><html><body><iframe src=".live-artifacts/artifact-1/index.html"></iframe><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/internal project storage path/i);
  });

  it('rejects root reserved project storage paths in URL attributes', () => {
    const html = '<!doctype html><html><body><a href="/.live-artifacts">Preview</a><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/internal project storage path/i);
  });

  it('rejects unquoted URL attributes that reference reserved storage', () => {
    const html = '<!doctype html><html><body><img src=./.od/thumb.png alt="Preview"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects CSS url references to reserved storage', () => {
    const html = '<!doctype html><html><head><style>.card{background-image:url("/.tmp/preview.png")}</style></head><body><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects CSS import references to reserved storage', () => {
    const html = '<!doctype html><html><head><style>@import "/.od/foo.css";@import url(./.tmp/theme.css);</style></head><body><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects inline style url references to reserved storage', () => {
    const html = '<!doctype html><html><body><div style="background-image:url(./.tmp/preview.png)">Preview</div><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('rejects srcset candidates that reference reserved storage', () => {
    const html = '<!doctype html><html><body><img srcset="assets/preview.png 1x, /.live-artifacts/artifact-1/preview.png 2x" alt="Preview"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(false);
  });

  it('accepts plain text mentions of reserved directory names', () => {
    const html = '<!doctype html><html><body><p>The .od folder and .tmp files are mentioned as documentation text only, not linked paths.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts external URLs with reserved-looking path segments', () => {
    const html = '<!doctype html><html><body><a href="https://example.test/.od/reference.html">External docs</a><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts local URLs that only mention reserved paths in query or hash', () => {
    const html = '<!doctype html><html><head><style>.card{background-image:url("/docs?example=/.od/ref")}</style></head><body><a href="/docs?example=/.od/ref">Query docs</a><a href="/docs#/.tmp/ref">Hash docs</a><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts text-node mentions of CSS url syntax for reserved names', () => {
    const html = '<!doctype html><html><body><p>Documentation can mention CSS examples like url("/.tmp/foo.png") without linking to project storage.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts text-node mentions of HTML attribute syntax for reserved names', () => {
    const html = '<!doctype html><html><body><p>Documentation can mention examples like href="/.od/reference.html" without linking to project storage.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts data URLs with reserved-looking payload text', () => {
    const html = '<!doctype html><html><body><img src="data:text/plain,/.od/foo" alt="Inline payload"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts data URLs with reserved-looking payload text in srcset', () => {
    const html = '<!doctype html><html><body><img srcset="data:text/plain,/.od/foo 1x" alt="Inline payload"><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts the supported live artifact preview API route', () => {
    const html = '<!doctype html><html><body><iframe src="/api/live-artifacts/artifact-1/preview"></iframe><p>Enough content to look like a real document.</p></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts a complete <!doctype html> document', () => {
    const html = '<!doctype html><html><head><title>x</title></head><body><h1>hello</h1></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('accepts content with a leading <html> tag (no doctype)', () => {
    const html = '<html><head><title>x</title></head><body><div>content here long enough</div></body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('is case-insensitive on the doctype / html tag check', () => {
    const html = '<!DOCTYPE HTML><HTML><BODY><DIV>hello world content</DIV></BODY></HTML>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });

  it('tolerates leading whitespace and BOM before the doctype', () => {
    const html = '﻿\n  <!doctype html>\n<html><body>real document body content</body></html>';
    const result = validateHtmlArtifact(html);
    expect(result.ok).toBe(true);
  });
});
