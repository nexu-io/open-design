/**
 * Role: 브랜드 primaryColor 부재 시 결정적 중립 폴백색 산출
 * Key Features: id djb2 해시 → HSL 저채도 중립톤. 정체색(#1E86FA) 하드코딩 대체
 * Dependencies: 없음 (순수 함수)
 * Notes: primaryColor/palette 있으면 호출 안 됨 — 폴백 전용. 저채도(32%)라 특정 브랜드 정체색 사칭 회피
 */

// id 문자열 → 안정 해시(djb2). 같은 브랜드는 항상 같은 값 — 렌더 간 색 흔들림 방지 위해 결정적
function hashId(id: string): number {
  let h = 5381;
  for (let i = 0; i < id.length; i += 1) {
    h = ((h << 5) + h + id.charCodeAt(i)) >>> 0;
  }
  return h;
}

// 브랜드 식별색이 없을 때 쓰는 중립 폴백 — 저채도라 특정 브랜드 정체색을 사칭하지 않음
export function brandAccentFallback(id: string): string {
  const hue = hashId(id) % 360;
  return `hsl(${hue} 32% 52%)`;
}
