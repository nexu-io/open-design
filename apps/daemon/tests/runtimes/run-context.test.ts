import { describe, expect, it } from 'vitest';
import {
  mergeRunContextSelections,
  normalizeRunContextSelection,
  normalizeWorkspaceContextItems,
  renderRunContextPrompt,
} from '../../src/runtimes/run-context.js';

describe('run context runtime', () => {
  it('normalizes and deduplicates selected workspace items', () => {
    expect(normalizeWorkspaceContextItems([
      { kind: ' browser ', id: ' tab-1 ', label: ' Page ', url: ' https://example.com ' },
      { kind: 'browser', id: 'tab-1', label: 'duplicate' },
      { kind: 'unknown', id: 'ignored', label: 'Ignored' },
      null,
    ])).toEqual([
      { kind: 'browser', id: 'tab-1', label: 'Page', url: 'https://example.com' },
    ]);
  });

  it('merges list selections and workspace items without duplicates', () => {
    expect(mergeRunContextSelections(
      { pluginIds: ['p1', ' p1 '], workspaceItems: [{ kind: 'file', id: 'f1', label: 'One' }] },
      { pluginIds: ['p2'], workspaceItems: [{ kind: 'file', id: 'f1', label: 'Duplicate' }, { kind: 'folder', id: 'd1', label: 'Two' }] },
    )).toEqual({
      pluginIds: ['p1', 'p2'],
      workspaceItems: [
        { kind: 'file', id: 'f1', label: 'One' },
        { kind: 'folder', id: 'd1', label: 'Two' },
      ],
    });
  });

  it('renders metadata-backed run context and focused workspace hints', () => {
    expect(renderRunContextPrompt(
      { workspaceItems: [{ kind: 'browser', id: 'tab-1', label: 'Docs', url: 'https://example.com' }], connectorIds: ['c1'] },
      { contextConnectors: [{ id: 'c1', name: 'CRM', provider: 'Acme', status: 'ready' }] },
    )).toContain('### Active workspace context');
    expect(renderRunContextPrompt(
      { workspaceItems: [{ kind: 'browser', id: 'tab-1', label: 'Docs', url: 'https://example.com' }], connectorIds: ['c1'] },
      { contextConnectors: [{ id: 'c1', name: 'CRM', provider: 'Acme', status: 'ready' }] },
    )).toContain('- CRM (`c1`) — Acme · ready');
    expect(renderRunContextPrompt(
      { workspaceItems: [{ kind: 'browser', id: 'tab-1', label: 'Docs', url: 'https://example.com' }] },
      {},
    )).toContain('Browser tabs:');
  });

  it('returns no prompt when no context is selected', () => {
    expect(normalizeRunContextSelection(null)).toEqual({});
    expect(renderRunContextPrompt({}, {})).toBe('');
  });
});
