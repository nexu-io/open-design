// Role: 디자인 카드 태그의 순수 파생 헬퍼 — RecentProjectsStrip과 DesignsTab
//       양쪽에서 공유한다. metadata.badge가 존재하면 해당 배지가 우선(manifest 선언
//       wins); 없으면 프로젝트 kind/intent로 카테고리를 추론한다.
// Key Features: resolveProjectBadge, projectCategory, TONE_CLASS 룩업
// Dependencies: @marketing-ax/contracts (타입만)
import type { Project, BadgeTone } from '@marketing-ax/contracts';

export type ProjectCategory = 'prototype' | 'live-artifact' | 'slide' | 'media';

// 프로젝트 kind/intent에서 카테고리를 추론 — manifest badge가 없는 경우의 폴백
export function projectCategory(project: Project): ProjectCategory {
  const meta = project.metadata;
  if (meta?.intent === 'live-artifact' || project.skillId === 'live-artifact') {
    return 'live-artifact';
  }
  if (meta?.kind === 'deck') return 'slide';
  if (meta?.kind === 'image' || meta?.kind === 'video' || meta?.kind === 'audio') {
    return 'media';
  }
  return 'prototype';
}

// Tone → CSS 클래스 폐쇄형 룩업.
// 원시 tone 문자열을 className에 직접 보간하지 않으므로 악의적인 manifest가
// 임의 클래스를 주입할 수 없다(CSS 클래스 인젝션 방지).
export const TONE_CLASS: Record<BadgeTone, string> = {
  blue: 'badge-tone-blue',
  purple: 'badge-tone-purple',
  amber: 'badge-tone-amber',
  teal: 'badge-tone-teal',
  red: 'badge-tone-red',
  pink: 'badge-tone-pink',
  neutral: 'badge-tone-neutral',
  green: 'badge-tone-green',
};

// manifest에 badge가 선언된 경우 label + toneClass를 반환한다.
// tone이 없거나 알 수 없는 값이면 neutral로 폴백 — null은 badge 없음
export function resolveProjectBadge(
  project: Project,
): { label: string; toneClass: string } | null {
  const badge = project.metadata?.badge;
  if (!badge?.label) return null;
  const toneClass =
    (badge.tone && TONE_CLASS[badge.tone]) || TONE_CLASS.neutral;
  return { label: badge.label, toneClass };
}

// 프로젝트의 브랜드 바인딩 배지 — plugin 배지와 별개로 브랜드 소속 표시
export function resolveProjectBrandLabel(project: Project): string | null {
  return typeof project.brandId === 'string' && project.brandId ? project.brandId : null;
}
