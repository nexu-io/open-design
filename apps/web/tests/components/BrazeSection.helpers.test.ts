// @vitest-environment node
// Role: braze-helpers 의 순수 함수 TDD 검증
// Key Features: statusToBadge, variantStatusToBadge, isAwaitingAnswer, isVariantOpenable
// Dependencies: vitest, braze-helpers

import { describe, expect, it } from 'vitest';
import type { BrazeMessageStatus, BrazeVariantStatus } from '@marketing-ax/contracts';
import {
  statusToBadge,
  variantStatusToBadge,
  isAwaitingAnswer,
  isVariantOpenable,
  statusI18nKey,
} from '../../src/components/braze-helpers';

// --- statusToBadge (BrazeMessageStatus → badge) ---
describe('statusToBadge', () => {
  // 모든 BrazeMessageStatus 값을 정확한 배지로 변환해야 함
  it.each([
    ['interviewing', 'interviewing'],
    ['plan_draft', 'draft'],
    ['plan_confirmed', 'confirmed'],
    ['producing', 'producing'],
    ['produced', 'produced'],
    ['editing', 'editing'],
    ['done', 'done'],
  ] as [BrazeMessageStatus, string][])(
    'status %s → badge %s',
    (status, expected) => {
      expect(statusToBadge(status)).toBe(expected);
    },
  );

  // 알 수 없는 상태 값은 'draft' 로 안전하게 폴백해야 함
  it('unknown status falls back to draft', () => {
    expect(statusToBadge('totally_unknown' as BrazeMessageStatus)).toBe('draft');
  });
});

// --- variantStatusToBadge (BrazeVariantStatus → badge) ---
// Fix 1 회귀 방지: pending 이 BrazeMessageStatus 에 없어서 as 캐스팅하면
// STATUS_I18N_KEY['pending'] === undefined → t(undefined) 가 'undefined' 렌더.
// variantStatusToBadge 는 BrazeVariantStatus 를 직접 받아 이 문제를 방지한다.
describe('variantStatusToBadge', () => {
  it.each([
    ['pending', 'pending'],
    ['produced', 'produced'],
    ['editing', 'editing'],
    ['done', 'done'],
  ] as [BrazeVariantStatus, string][])(
    'variant status %s → badge %s',
    (status, expected) => {
      expect(variantStatusToBadge(status)).toBe(expected);
    },
  );

  // pending 은 반드시 'pending' 배지여야 함 — 절대 'undefined' 나 'draft' 가 아님
  it('pending variant maps to pending badge (not draft or undefined)', () => {
    const result = variantStatusToBadge('pending');
    expect(result).toBe('pending');
    expect(result).not.toBe('draft');
  });

  // 알 수 없는 variant 상태는 'pending' 폴백
  it('unknown variant status falls back to pending', () => {
    expect(variantStatusToBadge('unknown' as BrazeVariantStatus)).toBe('pending');
  });
});

// --- isAwaitingAnswer ---
describe('isAwaitingAnswer', () => {
  // 질문폼 응답 대기 상태 = interviewing 과 plan_draft 만
  it('returns true for interviewing', () => {
    expect(isAwaitingAnswer('interviewing')).toBe(true);
  });

  it('returns true for plan_draft', () => {
    expect(isAwaitingAnswer('plan_draft')).toBe(true);
  });

  it.each(['plan_confirmed', 'producing', 'produced', 'editing', 'done'] as BrazeMessageStatus[])(
    'returns false for %s',
    (status) => {
      expect(isAwaitingAnswer(status)).toBe(false);
    },
  );
});

// --- isVariantOpenable ---
describe('isVariantOpenable', () => {
  // artifactPath 가 null 이면 열람 불가
  it('returns false when artifactPath is null', () => {
    expect(isVariantOpenable({ artifactPath: null })).toBe(false);
  });

  // artifactPath 가 빈 문자열이면 열람 불가
  it('returns false when artifactPath is empty string', () => {
    expect(isVariantOpenable({ artifactPath: '' })).toBe(false);
  });

  // artifactPath 가 실제 경로면 열람 가능
  it('returns true when artifactPath is a non-empty string', () => {
    expect(isVariantOpenable({ artifactPath: 'output/variant-a.html' })).toBe(true);
  });
});

// --- statusI18nKey ---
describe('statusI18nKey', () => {
  // 반환값은 항상 'braze.status.<status>' 형태
  it('produces the correct i18n key format', () => {
    expect(statusI18nKey('done')).toBe('braze.status.done');
    expect(statusI18nKey('interviewing')).toBe('braze.status.interviewing');
    expect(statusI18nKey('plan_draft')).toBe('braze.status.plan_draft');
  });
});
