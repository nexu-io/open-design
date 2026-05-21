// Page patterns — the site-building vocabulary that the future
// diagram surface treats as typed nodes. Phase 1 (Q2 2026) only
// serves these to the gallery and CLI; the I/O fields are stored
// for forward-compatibility and not yet consumed.

import type { SkillSummary } from './registry.js';

export type PagePatternIOKind = 'navigation' | 'data' | 'action';

export interface PagePatternIO {
  /** Stable name within the pattern. */
  name: string;
  kind: PagePatternIOKind;
  /**
   * Page type (namespace.name) the link or action targets. Optional
   * because some outputs are pure events with no destination yet.
   */
  targetPageType?: string;
}

/**
 * One page-pattern entry as returned by /api/page-patterns. Extends
 * SkillSummary so the web gallery can reuse the existing preview /
 * search infrastructure.
 */
export interface PagePatternSummary extends SkillSummary {
  pageType: string;
  pageInputs: PagePatternIO[];
  pageOutputs: PagePatternIO[];
}

export interface PagePatternListResponse {
  patterns: PagePatternSummary[];
}

export interface PagePatternResponse {
  pattern: PagePatternSummary;
}
