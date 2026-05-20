import { describe, expect, it } from 'vitest';
import { validateManifest } from '../src/validate';

describe('validateManifest', () => {
  it('flags repeat=true without an until expression', () => {
    const result = validateManifest({
      name: 'x',
      version: '1.0.0',
      od: {
        pipeline: { stages: [{ id: 'critique', atoms: ['critique-theater'], repeat: true }] },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/until/);
  });

  it('warns on unknown capability strings but stays ok', () => {
    const result = validateManifest({
      name: 'x',
      version: '1.0.0',
      od: { capabilities: ['prompt:inject', 'made-up'] },
    });
    expect(result.ok).toBe(true);
    expect(result.warnings.some((w) => w.includes('made-up'))).toBe(true);
  });

  it('rejects an oauth surface that points at an undeclared connector', () => {
    const result = validateManifest({
      name: 'x',
      version: '1.0.0',
      od: {
        connectors: { required: [{ id: 'slack', tools: [] }] },
        genui: {
          surfaces: [
            {
              id: 's1',
              kind: 'oauth-prompt',
              persist: 'project',
              oauth: { route: 'connector', connectorId: 'notion' },
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(false);
  });

  it('accepts repeat=true together with an until expression', () => {
    const result = validateManifest({
      name: 'x',
      version: '1.0.0',
      od: {
        pipeline: {
          stages: [{ id: 'loop', atoms: ['critique-theater'], repeat: true, until: 'done' }],
        },
      },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('does not flag until without repeat', () => {
    const result = validateManifest({
      name: 'x',
      version: '1.0.0',
      od: { pipeline: { stages: [{ id: 's1', atoms: ['a'], until: 'never' }] } },
    });
    expect(result.ok).toBe(true);
    expect(result.errors).toEqual([]);
  });

  it('skips the connector cross-check when no connectors are declared', () => {
    const result = validateManifest({
      name: 'x',
      version: '1.0.0',
      od: {
        genui: {
          surfaces: [
            {
              id: 's1',
              kind: 'oauth-prompt',
              persist: 'project',
              oauth: { route: 'connector', connectorId: 'any-id' },
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(true);
  });

  it('rejects an oauth surface that points at an undeclared mcp server', () => {
    const result = validateManifest({
      name: 'x',
      version: '1.0.0',
      od: {
        context: { mcp: [{ name: 'declared-server' }] },
        genui: {
          surfaces: [
            {
              id: 's1',
              kind: 'oauth-prompt',
              persist: 'project',
              oauth: { route: 'mcp', mcpServerId: 'other-server' },
            },
          ],
        },
      },
    });
    expect(result.ok).toBe(false);
    expect(result.errors.join(' ')).toMatch(/other-server/);
  });
});
