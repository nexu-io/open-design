import { describe, expect, it } from 'vitest';
import { compareRecentProjects, orderProjectItems } from '../../src/lib/project-order';

const projects = [
  { id: 'a', lastUserQueryAt: 10, updatedAt: 500, name: 'Z' },
  { id: 'b', lastUserQueryAt: 20, updatedAt: 1, name: 'B' },
  { id: 'c', lastUserQueryAt: 5, updatedAt: 900, name: 'A' },
  { id: 'd', lastUserQueryAt: null, updatedAt: 1000, name: 'D' },
];

describe('project recency', () => {
  it('uses user send time, not browsing, name or content activity', () => {
    expect([...projects].sort(compareRecentProjects).map(p => p.id)).toEqual(['b', 'a', 'c', 'd']);
  });

  it('keeps equal times and unknown times in a fixed ID order', () => {
    const items = [{ id: 'z' }, { id: 'b', lastUserQueryAt: 0 }, { id: 'a', lastUserQueryAt: 0 }, { id: 'd', lastUserQueryAt: null }];
    expect(items.sort(compareRecentProjects).map(p => p.id)).toEqual(['a', 'b', 'd', 'z']);
  });

  it('keeps the same recent order regardless of the active project', () => {
    const tabs = projects.map(p => ({ id: p.id, projectId: p.id }));
    const lookup = new Map(projects.map(p => [p.id, p]));
    const projectFor = (tab: typeof tabs[number]) => lookup.get(tab.projectId);
    expect(orderProjectItems(tabs, projectFor).map(t => t.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(orderProjectItems([...tabs].reverse(), projectFor).map(t => t.id)).toEqual(['b', 'a', 'c', 'd']);
    expect(tabs.map(t => t.id)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('keeps tabs without loaded project data deterministic', () => {
    const tabs = [{ id: 'missing-z' }, { id: 'missing-a' }];
    expect(orderProjectItems(tabs, () => undefined).map(t => t.id)).toEqual(['missing-a', 'missing-z']);
  });
});
