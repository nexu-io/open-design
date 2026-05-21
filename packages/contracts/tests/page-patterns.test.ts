import { describe, it, expectTypeOf } from 'vitest';
import type {
  PagePatternIO,
  PagePatternIOKind,
  PagePatternSummary,
  PagePatternListResponse,
  PagePatternResponse,
} from '../src/api/page-patterns';
import type { SkillSummary } from '../src/api/registry';

describe('PagePatternSummary', () => {
  it('extends SkillSummary with typed I/O metadata', () => {
    expectTypeOf<PagePatternSummary>().toMatchTypeOf<SkillSummary>();
    expectTypeOf<PagePatternSummary>().toHaveProperty('pageType').toEqualTypeOf<string>();
    expectTypeOf<PagePatternSummary>().toHaveProperty('pageInputs').toEqualTypeOf<PagePatternIO[]>();
    expectTypeOf<PagePatternSummary>().toHaveProperty('pageOutputs').toEqualTypeOf<PagePatternIO[]>();
  });

  it('IO kind is a closed union', () => {
    expectTypeOf<PagePatternIOKind>().toEqualTypeOf<'navigation' | 'data' | 'action'>();
  });

  it('list response wraps an array of summaries', () => {
    expectTypeOf<PagePatternListResponse>().toEqualTypeOf<{ patterns: PagePatternSummary[] }>();
  });
});
