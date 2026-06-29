// Role: Braze Custom-HTML IAM 산출물 감지 — "소스 복사" 버튼 노출 게이트.
// Key Features: isBrazeIamHtml(brazeBridge 마커 감지)
// Dependencies: 없음(순수 문자열 검사)
// Notes:
//   - 복사 자체는 raw source 를 평문으로 담는다(Braze 대시보드 Custom HTML 에디터는
//     리치 텍스트가 아니라 코드 자체를 붙여넣음 — design-templates/braze-iam handoff).
//     그래서 별도 변환 없이 기존 copyToClipboard(source) 를 호출하면 된다.
//   - 감지는 `brazeBridge` 마커로 — craft/braze-custom-html.md rule 1 이 모든 Braze IAM 의
//     유일한 bridge 객체로 규정. naver 마커와 상호배타적(겹침 0).

const BRAZE_BRIDGE_RE = /brazeBridge/;

/** 미리보기 HTML 이 Braze Custom-HTML IAM 산출물인지 감지. */
export function isBrazeIamHtml(source: string | null | undefined): boolean {
  if (typeof source !== 'string' || source.length === 0) return false;
  return BRAZE_BRIDGE_RE.test(source);
}
