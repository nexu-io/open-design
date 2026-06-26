import { describe, it, expect } from 'vitest';
import { projectCategory, resolveProjectBadge, TONE_CLASS } from '../../src/runtime/project-card-tag';

const proj = (metadata: any, extra: any = {}): any => ({
  id: 'p', name: 'n', skillId: null, designSystemId: null,
  createdAt: 0, updatedAt: 0, metadata, ...extra,
});

describe('resolveProjectBadge', () => {
  it('returns label + tone class for a badged project', () => {
    expect(resolveProjectBadge(proj({ kind: 'prototype', badge: { label: 'In-App Message', tone: 'pink' } })))
      .toEqual({ label: 'In-App Message', toneClass: TONE_CLASS.pink });
  });
  it('returns null when no badge', () => {
    expect(resolveProjectBadge(proj({ kind: 'prototype' }))).toBeNull();
  });
  it('falls back to neutral class for an unknown tone', () => {
    expect(resolveProjectBadge(proj({ kind: 'prototype', badge: { label: 'X', tone: 'bogus' } })))
      .toEqual({ label: 'X', toneClass: TONE_CLASS.neutral });
  });
  it('defaults to neutral when tone omitted', () => {
    expect(resolveProjectBadge(proj({ kind: 'prototype', badge: { label: 'X' } })))
      .toEqual({ label: 'X', toneClass: TONE_CLASS.neutral });
  });
});

describe('projectCategory', () => {
  it('live-artifact intent wins', () => {
    expect(projectCategory(proj({ kind: 'prototype', intent: 'live-artifact' }))).toBe('live-artifact');
  });
  it('deck → slide', () => { expect(projectCategory(proj({ kind: 'deck' }))).toBe('slide'); });
  it('image → media', () => { expect(projectCategory(proj({ kind: 'image' }))).toBe('media'); });
  it('default → prototype', () => { expect(projectCategory(proj({ kind: 'prototype' }))).toBe('prototype'); });
});
