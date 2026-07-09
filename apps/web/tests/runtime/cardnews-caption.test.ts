// @vitest-environment jsdom

// cardnews 갤러리 캡션 추출 — 툴바 "캡션 복사" 버튼 게이트.
// 감지·추출이 한 함수: extractCardnewsCaption 이 null 이면 버튼 숨김.

import { describe, expect, it } from 'vitest';
import { extractCardnewsCaption } from '../../src/runtime/cardnews-caption';

const GALLERY = `<!doctype html><html><body>
<section class="cards"><figure class="card"><img src="a-01.png"></figure></section>
<section class="caption">
  <h2>캡션 (복사용)</h2>
  <pre>"SPF 50 발랐으니 하루 종일 안전할까?"
한 번 바르고 온종일 방심했다면, 오늘 다시 볼 이야기예요.</pre>
  <div class="tags">#자외선차단제 #선크림</div>
</section>
</body></html>`;

// 신규 계약 마크업 — 헤더 행 + 인라인 복사 버튼이 끼어도 추출은 동일해야 한다.
const GALLERY_WITH_BUTTON = GALLERY.replace(
  '<h2>캡션 (복사용)</h2>',
  '<div class="caption-head"><h2>캡션 (복사용)</h2><button type="button" class="caption-copy">캡션 복사</button></div>',
);

describe('extractCardnewsCaption', () => {
  it('joins the caption body and hashtag line with a blank line', () => {
    const caption = extractCardnewsCaption(GALLERY);
    expect(caption).toContain('SPF 50 발랐으니');
    expect(caption).toContain('#자외선차단제 #선크림');
    expect(caption?.endsWith('#자외선차단제 #선크림')).toBe(true);
    expect(caption).not.toContain('캡션 (복사용)');
  });

  it('extracts the same caption from the new markup with an inline copy button', () => {
    expect(extractCardnewsCaption(GALLERY_WITH_BUTTON)).toBe(
      extractCardnewsCaption(GALLERY),
    );
    expect(extractCardnewsCaption(GALLERY_WITH_BUTTON)).not.toContain('캡션 복사');
  });

  it('returns null for non-cardnews HTML and empty input', () => {
    expect(extractCardnewsCaption('<html><body><p>hello</p></body></html>')).toBeNull();
    expect(
      extractCardnewsCaption('<div class="caption">generic caption class</div>'),
    ).toBeNull();
    expect(extractCardnewsCaption('')).toBeNull();
    expect(extractCardnewsCaption(null)).toBeNull();
  });

  it('tolerates a missing hashtag line', () => {
    const noTags = GALLERY.replace('<div class="tags">#자외선차단제 #선크림</div>', '');
    const caption = extractCardnewsCaption(noTags);
    expect(caption).toContain('SPF 50 발랐으니');
    expect(caption).not.toContain('#자외선차단제');
  });
});
