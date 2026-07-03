// @vitest-environment jsdom
//
// Red spec for the Naver-blog "스타일 복사" clipboard transform.
// Asserts the paste-ready HTML inlines 나눔고딕 13px per-block (NOT a wrapper
// <div>, per craft/naver-blog-html.md rule 2) and preserves the 인용구2 heading
// markup (<blockquote><strong>, rule 1) so a Naver SmartEditor paste keeps font,
// heading bars, tables, and red emphasis without the manual 30-second reformat.

import { describe, it, expect } from 'vitest';
import {
  isNaverBlogHtml,
  buildNaverClipboardHtml,
} from '../../src/runtime/naver-clipboard';

// 실제 design-templates/naver-blog/example.html 본문 구조를 축약한 픽스처.
const NAVER_SOURCE = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>도수치료</title>
<style>
  body { font-family: '나눔고딕', sans-serif; font-size: 15px; }
  blockquote { border-left: 5px solid #000; padding: 8px 0 8px 14px; margin: 24px 0 16px 0; }
  table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
  th { border: 1px solid #e5e5e5; padding: 10px; color: #333; background: #f8f9fa; }
  td { border: 1px solid #e5e5e5; padding: 10px; color: #333; }
  .small { font-size: 13px; color: #888; margin-top: 24px; }
</style></head>
<body>
<p>도수치료 실비는 가입한 실손보험 세대에 따라 보장 한도가 다릅니다.</p>
<blockquote><strong>실손 세대별 도수치료 한도 🔍</strong></blockquote>
<p>가입 시기를 먼저 확인하는 게 순서예요.</p>
<table>
  <thead><tr><th>실손 세대</th><th>도수치료 한도</th></tr></thead>
  <tbody><tr><td>1세대 (~2009)</td><td>대부분 보장</td></tr></tbody>
</table>
<hr>
<blockquote><strong>이런 경우엔 막힐 수 있어요 ⚠️</strong></blockquote>
<p>치료 목적이 아니라 <span style="color:#dc3545;font-weight:bold;">미용·체형 교정</span> 목적이면 거절될 수 있습니다.</p>
<p class="small">※ 본 콘텐츠는 일반적인 정보 제공을 목적으로 합니다.</p>
</body></html>`;

// 실제 skill 산출물 형태: <html>/<style> 없는 fragment, 제목바 border 인라인,
// 폰트는 완전히 생략(craft rule 2 — paste 후 수동 적용 전제). '나눔고딕' 문자열 없음.
const REAL_OUTPUT_FRAGMENT = `<blockquote style="border-left:5px solid #000;padding:8px 0 8px 14px;margin:24px 0 16px 0;"><strong>7월부터 보험료 오른다는데</strong></blockquote>
<p>안녕하세요, 보닥입니다!</p>
<p>특히 <span style="color:#dc3545;font-weight:bold;">최대 30%</span> 수준까지 언급됐어요.</p>
<hr style="border:0;border-top:1px solid #e5e5e5;margin:24px 0;">
<blockquote style="border-left:5px solid #000;padding:8px 0 8px 14px;margin:24px 0 16px 0;"><strong>예정이율 한 방에 정리</strong></blockquote>
<table style="border-collapse:collapse;width:100%;margin:16px 0;font-size:14px;"><tbody><tr><td>1세대</td><td>보장</td></tr></tbody></table>`;

describe('isNaverBlogHtml', () => {
  it('detects a naver-blog post (나눔고딕 + blockquote>strong)', () => {
    expect(isNaverBlogHtml(NAVER_SOURCE)).toBe(true);
  });

  it('detects the REAL skill output: no font string, inline 인용구2 border heading', () => {
    // 실파일엔 나눔고딕 문자열이 없음 — 인라인 border 제목바로 감지해야 한다.
    expect(REAL_OUTPUT_FRAGMENT.includes('나눔고딕')).toBe(false);
    expect(isNaverBlogHtml(REAL_OUTPUT_FRAGMENT)).toBe(true);
  });

  it('rejects plain HTML with neither signal', () => {
    expect(isNaverBlogHtml('<p>hello world</p>')).toBe(false);
  });

  it('rejects null / non-string', () => {
    expect(isNaverBlogHtml(null)).toBe(false);
    expect(isNaverBlogHtml(undefined)).toBe(false);
  });

  it('requires BOTH signals — font alone is not enough', () => {
    expect(isNaverBlogHtml("<p style=\"font-family:'나눔고딕'\">x</p>")).toBe(false);
  });

  it('requires BOTH signals — blockquote>strong alone is not enough', () => {
    expect(isNaverBlogHtml('<blockquote><strong>제목</strong></blockquote>')).toBe(false);
  });
});

describe('buildNaverClipboardHtml', () => {
  const { html, text } = buildNaverClipboardHtml(NAVER_SOURCE);

  it('inlines 나눔고딕 13px on paragraphs', () => {
    expect(html).toMatch(/<p[^>]*style="[^"]*나눔고딕[^"]*"/);
    expect(html).toMatch(/<p[^>]*style="[^"]*font-size:\s*13px/);
  });

  it('inlines 나눔고딕 13px on the heading <strong> and preserves blockquote>strong (인용구2)', () => {
    // 직계 <strong> 구조 유지 — <p> 래퍼 삽입 금지 (rule 1, 인용구2 매핑).
    expect(html).toMatch(/<blockquote[^>]*>\s*<strong[^>]*style="[^"]*나눔고딕/);
    expect(html).not.toMatch(/<blockquote[^>]*>\s*<p/);
  });

  it('keeps the 인용구2 short-bar via inline border on blockquote', () => {
    expect(html).toMatch(/<blockquote[^>]*style="[^"]*border-left:\s*5px solid #000/);
  });

  it('inlines font on table cells', () => {
    expect(html).toMatch(/<td[^>]*style="[^"]*나눔고딕/);
    expect(html).toMatch(/<th[^>]*style="[^"]*나눔고딕/);
  });

  it('does NOT introduce a wrapper <div> font (rule 2)', () => {
    expect(html).not.toMatch(/<div[^>]*font-family/);
  });

  it('preserves the red #dc3545 emphasis span', () => {
    expect(html).toMatch(/color:#dc3545/);
  });

  it('drops the <style> block (Naver strips it on paste anyway)', () => {
    expect(html).not.toMatch(/<style/);
  });

  it('does not add inline font-weight to block elements (rule 3)', () => {
    // <p>/<td>/<blockquote> 에 font-weight 인라인 금지 — 붙여넣기 시 본문 전체 볼드화 방지.
    expect(html).not.toMatch(/<(p|td|li|blockquote)[^>]*font-weight/);
  });

  it('provides a plain-text fallback with the post body', () => {
    expect(text).toContain('도수치료 실비는');
    expect(text).toContain('본 콘텐츠는');
  });
});

describe('buildNaverClipboardHtml on the REAL fragment (font-less, inline border)', () => {
  const { html } = buildNaverClipboardHtml(REAL_OUTPUT_FRAGMENT);

  it('adds 나눔고딕 13px to paragraphs that had no font', () => {
    expect(html).toMatch(/<p[^>]*style="[^"]*나눔고딕[^"]*font-size:\s*13px/);
  });

  it('keeps the existing inline border heading without duplicating it', () => {
    expect(html).toMatch(/<blockquote[^>]*style="[^"]*border-left:\s*5px solid #000/);
    // border-left 가 한 blockquote style 안에 두 번 박히지 않아야 한다.
    const firstBq = html.slice(html.indexOf('<blockquote'), html.indexOf('</blockquote>'));
    expect(firstBq.match(/border-left/g)?.length).toBe(1);
  });

  it('still has no wrapper <div> font (rule 2)', () => {
    expect(html).not.toMatch(/<div[^>]*font-family/);
  });
});

// 셸 산출물(D7): 프리뷰 전용 래퍼(.meta / h1.doc-title / .doc-sub) + 붙여넣기 대상 .article.
// 네이버 에디터는 제목 필드가 본문과 분리 — 리치 복사에 제목이 섞이면 안 된다.
const SHELL_SOURCE = `<!DOCTYPE html>
<html lang="ko"><head><meta charset="utf-8"><title>셸 문서 제목</title>
<style>
  body { font-family: 'Nanum Gothic', sans-serif; background: #f5f6f7; }
  .doc-title { font-size: 26px; font-weight: 800; }
  .paper { background: #fff; }
</style></head>
<body>
  <div class="wrap">
    <div class="meta">네이버 블로그 · 질병코드 · 초안</div>
    <h1 class="doc-title">셸에만 있는 문서 제목입니다</h1>
    <p class="doc-sub">아래 흰 영역이 붙여넣기용 본문입니다.</p>
    <div class="paper">
      <div class="article">
        <p>본문 도입 문단이에요.</p>
        <blockquote style="border-left:5px solid #000;padding:8px 0 8px 14px;margin:24px 0 16px 0;"><strong>섹션 제목 📋</strong></blockquote>
        <p>본문 해설 문장입니다.</p>
        <p class="small">※ 본 콘텐츠는 일반적인 정보 제공을 목적으로 합니다.</p>
      </div>
    </div>
  </div>
</body></html>`;

describe('buildNaverClipboardHtml scopes shell artifacts to .article (D7)', () => {
  const { html, text } = buildNaverClipboardHtml(SHELL_SOURCE);

  it('excludes the preview shell — doc-title/meta/doc-sub never reach the clipboard', () => {
    expect(html).not.toContain('셸에만 있는 문서 제목입니다');
    expect(html).not.toContain('네이버 블로그 · 질병코드 · 초안');
    expect(html).not.toContain('붙여넣기용 본문입니다');
    expect(html).not.toMatch(/doc-title|class="meta"|doc-sub/);
  });

  it('keeps the .article body with per-block 나눔고딕 13px inlined', () => {
    expect(html).toContain('본문 도입 문단이에요');
    expect(html).toMatch(/<p[^>]*style="[^"]*나눔고딕[^"]*font-size:\s*13px/);
    expect(html).toMatch(/<blockquote[^>]*style="[^"]*border-left:\s*5px solid #000/);
  });

  it('plain-text fallback also excludes the shell', () => {
    expect(text).toContain('본문 도입 문단이에요');
    expect(text).not.toContain('셸에만 있는 문서 제목입니다');
  });

  it('still detects the shell artifact as naver-blog html (marker lives inside .article)', () => {
    expect(isNaverBlogHtml(SHELL_SOURCE)).toBe(true);
  });
});
