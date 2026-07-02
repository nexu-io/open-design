// Role: 네이버 블로그 산출물 HTML을 "붙여넣기 즉시 서식 유지" 리치 클립보드로 변환·복사.
// Key Features: isNaverBlogHtml(감지), buildNaverClipboardHtml(블록별 인라인 서식 주입), copyNaverStyledHtml(text/html ClipboardItem 쓰기)
// Dependencies: DOMParser(브라우저), ClipboardItem
// Notes:
//   - craft/naver-blog-html.md 기준. 네이버 SmartEditor 는 래퍼 <div> 의 font 선언을
//     무시·제거하므로(rule 2) 폰트를 "블록 요소마다 인라인"으로 주입해야 붙여넣기 후에도
//     나눔고딕 13px 가 유지된다. <style> 블록도 paste 시 사라지므로 craft 의 표준 인라인
//     서식(테이블/제목바/면책)을 요소별로 직접 박는다.
//   - 제목바(인용구2)는 <blockquote><strong> 직계 구조를 보존해야 매핑됨(rule 1). <p> 래퍼 금지.
//   - 블록 요소(p/li/td/blockquote)에 inline font-weight 금지(rule 3) — 볼드는 <strong> 태그로만.

const NAVER_FONT_FAMILY = "'나눔고딕', sans-serif";
const NAVER_FONT_SIZE = '13px';
const FONT: Readonly<Record<string, string>> = {
  'font-family': NAVER_FONT_FAMILY,
  'font-size': NAVER_FONT_SIZE,
};

// 인용구2(짧은 바)를 직계 <strong> 자식과 함께 트리거하는 구조 마커.
const BLOCKQUOTE_STRONG_RE = /<blockquote\b[^>]*>\s*<strong\b/i;
// craft rule 1 의 인용구2 제목바 — 실제 산출물에 인라인으로 박히는 시그니처.
// (#000 기본, 일부 보조 소스 #333). 폰트가 생략돼도 이 마커는 항상 존재한다.
const QUOTE2_BORDER_RE = /border-left:\s*5px solid #(?:000|333)\b/i;

/**
 * 미리보기 중인 HTML 이 네이버 블로그 산출물인지 감지.
 * 인용구2 구조(<blockquote><strong>)를 필수로, 채널 시그니처 한 개를 AND —
 * 인용구2 제목바 인라인 border(실제 산출물) 또는 '나눔고딕'(example.html 류 <style> 형태).
 * 실제 skill 출력은 폰트를 통째로 생략하므로(craft rule 2) border 마커로 잡는다.
 * 임의의 blockquote 사용 HTML 을 오탐하지 않도록 두 신호를 결합한다.
 */
export function isNaverBlogHtml(source: string | null | undefined): boolean {
  if (typeof source !== 'string' || source.length === 0) return false;
  if (!BLOCKQUOTE_STRONG_RE.test(source)) return false;
  return QUOTE2_BORDER_RE.test(source) || source.includes('나눔고딕');
}

// 기존 inline style 값은 보존하고, 빠진 속성만 추가 — 산출물이 이미 인라인이면 그대로 두고
// example.html 처럼 <style> 로 호이스팅된 경우엔 요소별로 채운다.
function parseStyle(raw: string): Map<string, string> {
  const out = new Map<string, string>();
  for (const decl of raw.split(';')) {
    const i = decl.indexOf(':');
    if (i < 0) continue;
    const prop = decl.slice(0, i).trim().toLowerCase();
    const val = decl.slice(i + 1).trim();
    if (prop && val) out.set(prop, val);
  }
  return out;
}

function addMissingStyles(el: Element, additions: Record<string, string>): void {
  const m = parseStyle(el.getAttribute('style') ?? '');
  for (const [prop, val] of Object.entries(additions)) {
    if (!m.has(prop)) m.set(prop, val);
  }
  const serialized = Array.from(m, ([p, v]) => `${p}:${v}`).join(';');
  el.setAttribute('style', serialized ? `${serialized};` : '');
}

// 요소 종류별 표준 네이버 인라인 서식(craft/naver-blog-html.md 기준).
function styleNaverElement(el: Element): void {
  switch (el.tagName.toLowerCase()) {
    case 'p':
      // 면책 단락(.small)은 13px 회색 — 그 외 본문 단락은 폰트만.
      addMissingStyles(
        el,
        el.classList.contains('small')
          ? { ...FONT, color: '#888', 'margin-top': '24px' }
          : FONT,
      );
      break;
    case 'li':
    case 'span':
    case 'strong':
      addMissingStyles(el, FONT);
      break;
    case 'blockquote':
      // 인용구2 짧은 바 — 인라인 border 로 paste 후에도 시각 유지.
      addMissingStyles(el, {
        ...FONT,
        'border-left': '5px solid #000',
        padding: '8px 0 8px 14px',
        margin: '24px 0 16px 0',
      });
      break;
    case 'table':
      addMissingStyles(el, {
        'border-collapse': 'collapse',
        width: '100%',
        margin: '16px 0',
        'font-size': '14px',
      });
      break;
    case 'th':
      addMissingStyles(el, {
        ...FONT,
        border: '1px solid #e5e5e5',
        padding: '10px',
        'text-align': 'left',
        color: '#333',
        background: '#f8f9fa',
      });
      break;
    case 'td':
      addMissingStyles(el, {
        ...FONT,
        border: '1px solid #e5e5e5',
        padding: '10px',
        color: '#333',
      });
      break;
    case 'hr':
      addMissingStyles(el, {
        border: '0',
        'border-top': '1px solid #e5e5e5',
        margin: '24px 0',
      });
      break;
  }
}

/**
 * 네이버 산출물 HTML → 붙여넣기용 리치 HTML + 평문 fallback.
 * <body> 내용만 추출(헤드/<style> 제거)하고 블록 요소마다 표준 인라인 서식을 주입한다.
 */
export function buildNaverClipboardHtml(source: string): { html: string; text: string } {
  const doc = new DOMParser().parseFromString(source, 'text/html');
  const body = doc.body;
  for (const el of Array.from(body.querySelectorAll('*'))) {
    styleNaverElement(el);
  }
  const html = body.innerHTML.trim();
  const text = (body.textContent ?? '').replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  return { html, text };
}

type ClipboardItemCtor = new (
  items: Record<string, Blob | Promise<Blob>>,
) => ClipboardItem;

/**
 * 변환된 네이버 서식 HTML 을 시스템 클립보드에 text/html(+text/plain) 으로 쓴다.
 * 'copied' 성공 / 'denied' 클립보드 API 부재·권한 거부 / 'failed' 그 외.
 * copyImageDataUrlToClipboard(runtime/exports.ts) 와 동일한 gesture-safe 패턴.
 */
export async function copyNaverStyledHtml(
  source: string,
): Promise<'copied' | 'denied' | 'failed'> {
  const clipboard = navigator.clipboard;
  const ClipboardItemRef = (globalThis as { ClipboardItem?: ClipboardItemCtor })
    .ClipboardItem;
  if (!clipboard || typeof clipboard.write !== 'function' || !ClipboardItemRef) {
    return 'denied';
  }
  try {
    const { html, text } = buildNaverClipboardHtml(source);
    const htmlBlob = new Blob([html], { type: 'text/html' });
    const textBlob = new Blob([text], { type: 'text/plain' });
    // Safari 는 user gesture 안에서만 clipboard.write 를 허용 — Promise<Blob> 형태를
    // 우선 시도해 blob 을 lazy 하게 풀어도 gesture context 를 잃지 않게 한다.
    let item: ClipboardItem;
    try {
      item = new ClipboardItemRef({
        'text/html': Promise.resolve(htmlBlob),
        'text/plain': Promise.resolve(textBlob),
      });
    } catch {
      item = new ClipboardItemRef({ 'text/html': htmlBlob, 'text/plain': textBlob });
    }
    await clipboard.write([item]);
    return 'copied';
  } catch (err) {
    const name = (err as { name?: string } | null)?.name;
    if (name === 'NotAllowedError' || name === 'SecurityError') {
      return 'denied';
    }
    return 'failed';
  }
}
