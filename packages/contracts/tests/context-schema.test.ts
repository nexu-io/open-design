import { describe, expect, it } from 'vitest';
import {
  ContextItemSchema,
  ResolvedContextSchema,
} from '../src/plugins/context.js';

describe('ContextItemSchema', () => {
  it('parses each discriminated kind with its required fields', () => {
    expect(ContextItemSchema.parse({ kind: 'skill', id: 's1', label: 'Skill' })).toEqual({
      kind: 'skill',
      id: 's1',
      label: 'Skill',
    });
    expect(
      ContextItemSchema.parse({
        kind: 'design-system',
        id: 'ds1',
        label: 'DS',
        primary: true,
      }),
    ).toMatchObject({ kind: 'design-system', primary: true });
    expect(
      ContextItemSchema.parse({
        kind: 'asset',
        path: '/p/a.png',
        label: 'asset',
        mime: 'image/png',
      }),
    ).toMatchObject({ kind: 'asset', path: '/p/a.png', mime: 'image/png' });
    expect(
      ContextItemSchema.parse({ kind: 'mcp', name: 'figma', label: 'Figma' }),
    ).toMatchObject({ kind: 'mcp', name: 'figma' });
  });

  it('rejects an unknown discriminator', () => {
    const result = ContextItemSchema.safeParse({ kind: 'mystery', id: 'x', label: 'y' });
    expect(result.success).toBe(false);
  });

  it('rejects an asset item missing its path', () => {
    const result = ContextItemSchema.safeParse({ kind: 'asset', label: 'no-path' });
    expect(result.success).toBe(false);
  });

  it('rejects a skill item missing its label', () => {
    const result = ContextItemSchema.safeParse({ kind: 'skill', id: 's1' });
    expect(result.success).toBe(false);
  });
});

describe('ResolvedContextSchema', () => {
  it('accepts the minimal { items: [] } shape', () => {
    expect(ResolvedContextSchema.parse({ items: [] })).toEqual({ items: [] });
  });

  it('round-trips items, promptFragments, and atoms', () => {
    const value = {
      items: [
        { kind: 'skill', id: 's1', label: 'Skill 1' },
        { kind: 'atom', id: 'todo-write', label: 'TodoWrite' },
      ],
      promptFragments: { 's1': 'Use skill 1 first.' },
      atoms: ['todo-write', 'direction-picker'],
    };
    expect(ResolvedContextSchema.parse(value)).toEqual(value);
  });

  it('rejects a missing items array', () => {
    const result = ResolvedContextSchema.safeParse({ atoms: ['x'] });
    expect(result.success).toBe(false);
  });

  it('rejects atoms that are not strings', () => {
    const result = ResolvedContextSchema.safeParse({ items: [], atoms: [42] });
    expect(result.success).toBe(false);
  });
});
