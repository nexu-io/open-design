import { describe, expect, it } from 'vitest';
import { PreviewVersionRemintBudget } from '../../src/runtime/preview-version-remint';

describe('PreviewVersionRemintBudget', () => {
  it('consumes one exact failed attempt once and bounds a stable content generation', () => {
    const budget = new PreviewVersionRemintBudget(2);
    const generation = ['project', 'index.html', '100:1000'].join('\0');
    const first = {
      sessionId: 'scope-one',
      documentVersion: 'version-one',
      navigationAttempt: 0,
    };

    expect(budget.consume(generation, first)).toBe('remint');
    expect(budget.consume(generation, first)).toBe('duplicate');
    expect(budget.consume(generation, {
      sessionId: 'scope-two',
      documentVersion: 'version-two',
      navigationAttempt: 0,
    })).toBe('remint');
    expect(budget.consume(generation, {
      sessionId: 'scope-three',
      documentVersion: 'version-three',
      navigationAttempt: 0,
    })).toBe('exhausted');
  });

  it('starts a fresh bounded budget when the authored file generation changes again', () => {
    const budget = new PreviewVersionRemintBudget(1);
    const firstGeneration = ['project', 'index.html', '100:1000'].join('\0');
    const secondGeneration = ['project', 'index.html', '120:2000'].join('\0');
    const failure = {
      sessionId: 'scope-one',
      documentVersion: 'version-one',
      navigationAttempt: 0,
    };
    expect(budget.consume(firstGeneration, failure)).toBe('remint');
    expect(budget.consume(firstGeneration, {
      ...failure,
      sessionId: 'scope-two',
    })).toBe('exhausted');
    expect(budget.consume(secondGeneration, {
      ...failure,
      sessionId: 'scope-three',
      documentVersion: 'version-three',
    })).toBe('remint');
  });

  it('lets an explicit user retry reset an exhausted generation', () => {
    const budget = new PreviewVersionRemintBudget(1);
    const generation = ['project', 'index.html', '100:1000'].join('\0');
    expect(budget.consume(generation, {
      sessionId: 'scope-one',
      documentVersion: 'version-one',
      navigationAttempt: 0,
    })).toBe('remint');
    expect(budget.consume(generation, {
      sessionId: 'scope-two',
      documentVersion: 'version-two',
      navigationAttempt: 0,
    })).toBe('exhausted');

    budget.reset(generation);
    expect(budget.consume(generation, {
      sessionId: 'scope-three',
      documentVersion: 'version-three',
      navigationAttempt: 0,
    })).toBe('remint');
  });
});
