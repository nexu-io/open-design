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
