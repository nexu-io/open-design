// Role: 자유입력 프롬프트 → 시나리오 플러그인 라우팅 결정 (스펙 §4.1 ②③④) + 라우터 재매칭 핸드오프 (스펙 §4.2)
// Key Features: resolveRoutedPluginId, resolveRouterRematchPluginId
// Dependencies: @marketing-ax/contracts (matchPluginByTriggers, FORM_ANSWERS_MARKER, defaultScenarioPluginIdForProjectMetadata)
// Notes: 순수 함수 — DB 접근 없음. 호출부가 listInstalledPlugins(db) 결과를 넘긴다.

import {
  FORM_ANSWERS_MARKER,
  defaultScenarioPluginIdForProjectMetadata,
  matchPluginByTriggers,
  type ProjectMetadata,
  type TriggerCandidate,
} from '@marketing-ax/contracts';

export interface RoutablePluginRecord {
  id: string;
  manifest?: unknown;
}

interface RoutingManifestView {
  triggers?: unknown;
  router?: unknown;
  fallbackRoute?: unknown;
}

// installed 레코드에서 od.routing을 방어적으로 읽는다 — 매니페스트는 passthrough라 형태 보장 없음.
function routingOf(record: RoutablePluginRecord | undefined): RoutingManifestView {
  const od = (record?.manifest as { od?: { routing?: RoutingManifestView } } | null | undefined)?.od;
  return od?.routing ?? {};
}

function candidatesFrom(installed: readonly RoutablePluginRecord[]): TriggerCandidate[] {
  const out: TriggerCandidate[] = [];
  for (const record of installed) {
    const triggers = routingOf(record).triggers;
    if (Array.isArray(triggers) && triggers.length > 0) {
      out.push({ pluginId: record.id, triggers: triggers.filter((t): t is string => typeof t === 'string') });
    }
  }
  return out;
}

function isInstalled(installed: readonly RoutablePluginRecord[], id: string): boolean {
  return installed.some((record) => record.id === id);
}

// 트리거 라우팅 게이트 (스펙 §4.1 M1): 진짜 자유입력에만 — design 모드, kind가 'other'거나
// 미지정, live-artifact intent 아님. 그 외는 기존 kind 폴백으로 직행.
// 프롬프트 존재는 조건이 아니다: 첨부만 있는 빈 프롬프트 제출도 자유입력이며, 매칭 none →
// 라우터 폴백(od-default)으로 흘러 현행 task-type 폼 UX를 보존한다 (정정 메모 9).
function isFreeFormEligible(args: {
  sessionMode: string | null | undefined;
  metadata: Pick<ProjectMetadata, 'kind' | 'intent'> | null | undefined;
}): boolean {
  if (args.sessionMode !== 'design') return false;
  if (args.metadata?.intent === 'live-artifact') return false;
  const kind = args.metadata?.kind;
  return kind === undefined || kind === null || kind === 'other';
}

// 스펙 §4.1 우선순위 ②③④. ①(명시 pluginId)은 호출부가 이 함수 호출 전에 걸러낸다.
export function resolveRoutedPluginId(args: {
  prompt: string | null | undefined;
  metadata: Pick<ProjectMetadata, 'kind' | 'intent'> | null | undefined;
  sessionMode: string | null | undefined;
  installed: readonly RoutablePluginRecord[];
  defaultRouterPluginId: string | null | undefined;
}): string | null {
  if (isFreeFormEligible(args)) {
    const result = matchPluginByTriggers(args.prompt, candidatesFrom(args.installed));
    if (result.kind === 'match') return result.pluginId;
    // 모호/무매칭 → 설정 라우터 → od-default → (아래) kind 폴백
    const configured = args.defaultRouterPluginId;
    if (typeof configured === 'string' && configured.length > 0) {
      if (isInstalled(args.installed, configured)) return configured;
      console.warn(`[plugins] defaultRouterPluginId ${configured} is not installed; falling back to od-default`);
    }
    if (isInstalled(args.installed, 'od-default')) return 'od-default';
  }
  return defaultScenarioPluginIdForProjectMetadata(args.metadata ?? undefined) ?? null;
}

// 스펙 §4.2 라우터 재매칭: pin이 router:true일 때만. match → 전환.
// fallbackRoute는 폼 답변(FORM_ANSWERS_MARKER 포함)에만 적용 — 원 프롬프트/일반 대화의
// 무매칭·모호는 라우터 유지(null). 없으면 최초 run이 원래 모호 프롬프트로 재매칭돼
// 폼이 뜨기 전에 od-default로 새는 버그가 된다.
export function resolveRouterRematchPluginId(args: {
  currentPrompt: string | null | undefined;
  pinnedPluginId: string | null | undefined;
  installed: readonly RoutablePluginRecord[];
}): string | null {
  if (!args.pinnedPluginId) return null;
  const pinned = args.installed.find((record) => record.id === args.pinnedPluginId);
  const routing = routingOf(pinned);
  if (routing.router !== true) return null;

  const prompt = typeof args.currentPrompt === 'string' ? args.currentPrompt : '';
  const candidates = candidatesFrom(args.installed).filter((c) => c.pluginId !== args.pinnedPluginId);
  const result = matchPluginByTriggers(prompt, candidates);
  if (result.kind === 'match') return result.pluginId;

  if (!prompt.includes(FORM_ANSWERS_MARKER)) return null;
  const fallback = typeof routing.fallbackRoute === 'string' ? routing.fallbackRoute : null;
  if (!fallback || !isInstalled(args.installed, fallback)) return null;
  const fallbackRecord = args.installed.find((record) => record.id === fallback);
  // 라우터→라우터 전환 금지 (무한 폼 루프 가드)
  if (routingOf(fallbackRecord).router === true) return null;
  return fallback;
}
