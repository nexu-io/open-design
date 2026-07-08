// Role: cardnews 갤러리 산출물의 캡션 추출 — 툴바 "캡션 복사" 버튼 게이트 겸 복사 소스.
// Key Features: extractCardnewsCaption(캡션 전문 + 해시태그 줄을 평문으로)
// Dependencies: DOMParser (브라우저/jsdom)
// Notes:
//   - 감지와 추출이 한 함수 — null 이면 cardnews 갤러리가 아니므로 버튼 숨김.
//     generic 한 `.caption` 클래스 충돌을 피하려고 캡션 본문 `<pre>` 존재까지 요구
//     (design-templates/cardnews-instagram 5e 갤러리 계약 마크업).
//   - 해시태그(.tags)는 인스타그램 캡션에 함께 붙여넣는 대상이라 빈 줄 하나로 이어붙인다.

/** cardnews 갤러리 HTML 에서 캡션 전문(+해시태그)을 뽑는다. 아니면 null. */
export function extractCardnewsCaption(source: string | null | undefined): string | null {
  if (typeof source !== 'string' || source.length === 0) return null;
  // DOMParser 파싱 전 저렴한 프리게이트 — 대다수 비 cardnews HTML 을 조기 탈락.
  if (!source.includes('class="caption"')) return null;
  let doc: Document;
  try {
    doc = new DOMParser().parseFromString(source, 'text/html');
  } catch {
    return null;
  }
  const section = doc.querySelector('.caption');
  const pre = section?.querySelector('pre');
  const body = pre?.textContent?.trim();
  if (!body) return null;
  const tags = section?.querySelector('.tags')?.textContent?.trim();
  return tags ? `${body}\n\n${tags}` : body;
}
