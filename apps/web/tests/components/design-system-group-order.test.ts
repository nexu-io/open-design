import { describe, expect, it } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';

import { orderDesignSystemGroups } from '../../src/components/design-system-group-order';

function ds(id: string, partial: Partial<DesignSystemSummary> = {}): DesignSystemSummary {
  return {
    id,
    title: id,
    category: 'Misc',
    summary: '',
    surface: 'web',
    source: 'built-in',
    status: 'published',
    isEditable: false,
    ...partial,
  } as DesignSystemSummary;
}

type Entry = [string, DesignSystemSummary[]];

describe('orderDesignSystemGroups (issue #2813)', () => {
  it('pins a group with editable systems above built-in groups', () => {
    const entries: Entry[] = [
      ['Productivity', [ds('airbnb')]],
      ['Custom', [ds('user:acme', { source: 'user', isEditable: true })]],
    ];
    expect(orderDesignSystemGroups(entries).map(([cat]) => cat)).toEqual([
      'Custom',
      'Productivity',
    ]);
  });

  it('keeps the built-in groups in their original order (stable sort)', () => {
    const entries: Entry[] = [
      ['B', [ds('b')]],
      ['A', [ds('a')]],
      ['Custom', [ds('user:x', { isEditable: true })]],
    ];
    expect(orderDesignSystemGroups(entries).map(([cat]) => cat)).toEqual(['Custom', 'B', 'A']);
  });

  it('treats source "user" as editable even without isEditable', () => {
    const entries: Entry[] = [
      ['Built', [ds('x')]],
      ['Mine', [ds('y', { source: 'user' })]],
    ];
    expect(orderDesignSystemGroups(entries).map(([cat]) => cat)).toEqual(['Mine', 'Built']);
  });

  it('leaves an all-built-in list unchanged', () => {
    const entries: Entry[] = [
      ['A', [ds('a')]],
      ['B', [ds('b')]],
    ];
    expect(orderDesignSystemGroups(entries).map(([cat]) => cat)).toEqual(['A', 'B']);
  });

  it('floats an editable system above built-ins inside a shared category', () => {
    const entries: Entry[] = [
      ['Productivity', [ds('apple'), ds('airbnb'), ds('user:acme', { source: 'user', isEditable: true })]],
    ];
    const items = orderDesignSystemGroups(entries)[0]![1];
    expect(items.map((system) => system.id)).toEqual(['user:acme', 'apple', 'airbnb']);
  });

  it('keeps built-ins in their incoming order within a group (stable item sort)', () => {
    const entries: Entry[] = [
      ['Productivity', [ds('b'), ds('user:x', { isEditable: true }), ds('a')]],
    ];
    const items = orderDesignSystemGroups(entries)[0]![1];
    expect(items.map((system) => system.id)).toEqual(['user:x', 'b', 'a']);
  });
});
