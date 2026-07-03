// Role: 자유입력 프롬프트 ↔ 플러그인 트리거 매칭 순수 헬퍼 (웹·데몬 공유, 스펙 §5)
// Key Features: matchPluginByTriggers, normalizeTriggerText, FORM_ANSWERS_MARKER
// Dependencies: 없음 (순수 TS — contracts 순수성 유지)
// Notes: 매치/모호 판정은 플러그인 단위 — 같은 플러그인의 복수 트리거 적중은 단일 매치.

// web `formatFormAnswers`(apps/web/src/artifacts/question-form.ts)가 만드는 폼 답변
// 메시지의 접두 — 데몬 재매칭이 "폼 답변인가"를 이 마커로 판별한다. web도 이 상수를
// import해 포맷 드리프트를 방지한다.
export const FORM_ANSWERS_MARKER = '[form answers — ';

export interface TriggerCandidate {
  pluginId: string;
  triggers: readonly string[];
}

export type TriggerMatchResult =
  | { kind: 'match'; pluginId: string }
  | { kind: 'ambiguous'; pluginIds: string[] }
  | { kind: 'none' };

// lowercase + 연속 공백 collapse — CJK에는 대소문자 차원이 없으므로 실질은 공백 정규화
export function normalizeTriggerText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

// 프롬프트에 트리거가 부분 문자열로 포함된 플러그인을 찾는다.
// 정확히 1개 플러그인 → match / 2개+ → ambiguous / 0개 → none
export function matchPluginByTriggers(
  prompt: string | null | undefined,
  candidates: readonly TriggerCandidate[],
): TriggerMatchResult {
  const haystack = normalizeTriggerText(prompt ?? '');
  if (haystack.length === 0) return { kind: 'none' };
  const matched: string[] = [];
  for (const candidate of candidates) {
    const hit = candidate.triggers.some((trigger) => {
      const needle = normalizeTriggerText(trigger);
      return needle.length > 0 && haystack.includes(needle);
    });
    if (hit) matched.push(candidate.pluginId);
  }
  if (matched.length === 1) return { kind: 'match', pluginId: matched[0]! };
  if (matched.length > 1) return { kind: 'ambiguous', pluginIds: matched };
  return { kind: 'none' };
}
