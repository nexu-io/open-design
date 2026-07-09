/**
 * Role: brandAccentFallback 폴백색 헬퍼 스펙
 * Key Features: 결정성(같은 id→같은 색), 하드코딩 정체색 미사칭, 유효 CSS 색
 * Notes: primaryColor/palette 부재 시에만 쓰는 폴백 — 정체색 #1E86FA 하드코딩 대체 검증
 */
import { describe, expect, it } from 'vitest';
import { brandAccentFallback } from '../src/components/brand-accent';

describe('brandAccentFallback', () => {
  // 렌더 간 색 흔들림 방지 — 같은 브랜드는 항상 같은 폴백색
  it('같은 id는 항상 같은 색을 낸다', () => {
    expect(brandAccentFallback('bodoc')).toBe(brandAccentFallback('bodoc'));
  });

  // 서로 다른 브랜드가 전부 회색 한 톤으로 뭉치지 않도록 id별 분기
  it('다른 id는 (대개) 다른 색을 낸다', () => {
    expect(brandAccentFallback('bodoc')).not.toBe(brandAccentFallback('acme'));
  });

  // 핵심: 특정 브랜드 정체색(#1E86FA)을 폴백이 사칭하면 안 됨
  it('하드코딩 정체색 #1E86FA를 반환하지 않는다', () => {
    for (const id of ['bodoc', 'acme', 'x', '', 'a-very-long-brand-id-1234567890']) {
      expect(brandAccentFallback(id).toLowerCase()).not.toContain('#1e86fa');
    }
  });

  // 인라인 style background로 바로 쓸 수 있는 유효 CSS 색 문자열
  it('유효한 CSS 색 문자열을 낸다', () => {
    expect(brandAccentFallback('bodoc')).toMatch(/^hsl\(\d{1,3} \d{1,3}% \d{1,3}%\)$/);
  });
});
