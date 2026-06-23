// Role: Braze IAM 메시지·변형 상태·배지 매핑과 variant 관련 순수 헬퍼
// Key Features: 상태 → 배지 변형 매핑 (메시지/변형 분리), variant openable 판정, 날짜 포맷
// Dependencies: @open-design/contracts (BrazeMessageStatus, BrazeVariantStatus, BrazeVariant)
// Notes: 사이드이펙트 없는 순수 함수들 — 테스트가 import만으로 동작해야 함

import type { BrazeMessageStatus, BrazeVariantStatus, BrazeVariant } from '@open-design/contracts';

// ── 메시지 상태 배지 ──────────────────────────────────────────────────────────
// 총 7개 상태: interviewing/plan_draft/plan_confirmed/producing/produced/editing/done
export type BrazeBadgeVariant =
  | 'interviewing'
  | 'draft'
  | 'confirmed'
  | 'producing'
  | 'produced'
  | 'editing'
  | 'done'
  | 'pending'; // BrazeVariantStatus 에만 존재하는 상태

const STATUS_TO_BADGE: Record<BrazeMessageStatus, BrazeBadgeVariant> = {
  interviewing: 'interviewing',
  plan_draft: 'draft',
  plan_confirmed: 'confirmed',
  producing: 'producing',
  produced: 'produced',
  editing: 'editing',
  done: 'done',
};

// 메시지 상태를 CSS 배지 suffix 로 변환 (알 수 없는 상태 방어용 fallback: 'draft')
export function statusToBadge(status: BrazeMessageStatus): BrazeBadgeVariant {
  return STATUS_TO_BADGE[status] ?? 'draft';
}

// ── 변형(Variant) 상태 배지 ──────────────────────────────────────────────────
// BrazeVariantStatus = 'pending' | 'produced' | 'editing' | 'done'
// 메시지 상태와 별도로 처리해 `as` 캐스팅 없이 안전하게 매핑한다.
// pending 은 plan_confirmed 후 produce 전의 대기 상태.
const VARIANT_STATUS_TO_BADGE: Record<BrazeVariantStatus, BrazeBadgeVariant> = {
  pending: 'pending',
  produced: 'produced',
  editing: 'editing',
  done: 'done',
};

export function variantStatusToBadge(status: BrazeVariantStatus): BrazeBadgeVariant {
  return VARIANT_STATUS_TO_BADGE[status] ?? 'pending';
}

// ── 공용 유틸 ────────────────────────────────────────────────────────────────

// 사용자에게 "Questions 탭에서 응답 대기 중" 힌트를 표시해야 하는 상태인지 판정.
// interviewing 과 plan_draft 는 질문폼 응답을 기다리므로 힌트 표시.
export function isAwaitingAnswer(status: BrazeMessageStatus): boolean {
  return status === 'interviewing' || status === 'plan_draft';
}

// variant 가 열람 가능한지 (artifactPath 가 설정된 경우) 판정.
// 이 함수가 true 를 반환해야만 "Open in viewer" 버튼을 노출한다.
export function isVariantOpenable(variant: Pick<BrazeVariant, 'artifactPath'>): boolean {
  return variant.artifactPath !== null && variant.artifactPath.length > 0;
}

// ISO-8601 날짜 문자열을 현재 로케일에 맞는 짧은 표시 형식으로 변환.
export function formatBrazeDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
  } catch {
    return iso;
  }
}

// 메시지 상태 → i18n 키 변환 (테스트 목적 보조용).
// BrazeSection.tsx 에서는 별도 Record 로 keyof Dict 를 보장.
export function statusI18nKey(
  status: BrazeMessageStatus,
): `braze.status.${BrazeMessageStatus}` {
  return `braze.status.${status}`;
}
