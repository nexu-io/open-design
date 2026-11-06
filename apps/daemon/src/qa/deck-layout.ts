// Post-generation static QA pass for brand deck layout robustness.
//
// Background: the generated brand deck (`system/artifacts/deck.html`) lays
// its content on fixed-size 16:9 slides. When a slide's content is taller or
// wider than that frame, the surrounding `overflow:hidden` clips it — the
// hero headline loses its last line, the problem paragraph is cut mid
// sentence, a market funnel label overflows its pill. Brand-derived copy has
// variable length, so the only durable fix is a template that is robust by
// construction: a `container-type: size` frame plus a runtime shrink-to-fit
// layer (`.f-fit`) that scales each slide down until it fits, and no
// destructive `-webkit-line-clamp` truncation on the headline/lede slots.
//
// `analyseDeckLayout` parses the rendered deck and asserts the structural
// invariants that keep those guarantees in place. It is deterministic and
// side-effect free — there is no browser layout engine in the daemon, so the
// pass verifies that the no-clip *mechanism* is present and not the pixel
// result (the actual fit runs in the artifact's own browser context). It runs
// as a hard guard inside the brand-system rebuild so a regressed template can
// never ship a clipping deck.

import { type CheerioAPI, load } from 'cheerio';

/** Severity of a finding. `error` blocks the brand-system rebuild. */
export type DeckLayoutSeverity = 'error' | 'warning';

export interface DeckLayoutIssue {
  /** Stable machine code for the finding. */
  code:
    | 'no-slides'
    | 'frame-not-size-container'
    | 'fit-runtime-missing'
    | 'fit-layer-missing'
    | 'headline-truncation'
    | 'funnel-label-clipped';
  severity: DeckLayoutSeverity;
  /** One-sentence English description, suitable for a build error / warning UI. */
  message: string;
}

export interface DeckLayoutReport {
  issues: DeckLayoutIssue[];
  /** Number of `.slide` sections found. */
  slideCount: number;
}

/** Class names that truncate text to a fixed line count and therefore cut
 *  variable-length brand copy. They are safe on uniform card tiles but never
 *  on the headline / lede slots that carry the slide's primary message. */
const TRUNCATION_CLASSES = ['clamp-1', 'clamp-2', 'clamp-3'];

/** Headline / lede slots whose copy must never be silently truncated. */
const MESSAGE_SLOT_CLASSES = ['s-mega', 's-title', 's-lede'];

/**
 * Parse a rendered deck artifact and return layout-robustness findings.
 *
 * Deterministic and side-effect free. An empty (no-slide) document yields a
 * single `no-slides` error so a malformed deck cannot pass silently.
 */
export function analyseDeckLayout(html: string): DeckLayoutReport {
  const $ = load(html);
  const issues: DeckLayoutIssue[] = [];

  const slideCount = $('.slide').length;
  if (slideCount === 0) {
    issues.push({
      code: 'no-slides',
      severity: 'error',
      message: 'Deck has no `.slide` sections — the document is not a renderable deck.',
    });
    return { issues, slideCount };
  }

  const styleText = $('style').text();
  const scriptText = $('script').text();

  // 1. The frame must be a *size* container so type can scale against the
  //    fixed height, not only the width.
  if (!/container-type:\s*size/.test(styleText)) {
    issues.push({
      code: 'frame-not-size-container',
      severity: 'error',
      message:
        'Slide frame is not a `container-type: size` container; height-aware scaling is unavailable so tall slides can overflow.',
    });
  }

  // 2. The shrink-to-fit runtime must be shipped (marker emitted by the deck
  //    script). Without it nothing keeps oversized content inside the frame.
  if (!scriptText.includes('od-deck-fit')) {
    issues.push({
      code: 'fit-runtime-missing',
      severity: 'error',
      message:
        'Shrink-to-fit runtime (`od-deck-fit`) is missing; slides taller than the frame would be clipped instead of scaled.',
    });
  }

  // 3. Every slide body must wrap its content in a `.f-fit` layer the runtime
  //    can scale. A body without one is unprotected.
  const unprotected = countBodiesWithoutFitLayer($);
  if (unprotected > 0) {
    issues.push({
      code: 'fit-layer-missing',
      severity: 'error',
      message: `${unprotected} slide ${plural(unprotected, 'body', 'bodies')} lack a \`.f-fit\` shrink-to-fit layer; their content is not protected from clipping.`,
    });
  }

  // 4. No headline / lede slot may carry a fixed line-clamp truncation class —
  //    that silently cuts brand copy (the "problem paragraph cut mid-sentence"
  //    defect). The runtime fit replaces clamping.
  for (const selector of truncatedMessageSlots($)) {
    issues.push({
      code: 'headline-truncation',
      severity: 'error',
      message: `Message slot \`${selector}\` uses a line-clamp truncation class; headline/lede copy must scale to fit, not be cut.`,
    });
  }

  // 5. A market funnel value label must not live inside the fixed-height
  //    `.track` pill, where a long label wraps and is clipped. It must sit in
  //    its own column (the `.val` element).
  if (funnelTracksCarryText($)) {
    issues.push({
      code: 'funnel-label-clipped',
      severity: 'error',
      message:
        'A funnel `.track` pill carries its value text inline; long labels wrap and clip. Render the value in a sibling `.val` element instead.',
    });
  }

  return { issues, slideCount };
}

/**
 * Throw when the deck has any blocking (`error`) layout issue. Used as a hard
 * guard in the brand-system rebuild so a clipping deck cannot be written.
 */
export function assertDeckLayoutSafe(html: string): void {
  const { issues } = analyseDeckLayout(html);
  const blocking = issues.filter((issue) => issue.severity === 'error');
  if (blocking.length === 0) return;
  const detail = blocking.map((issue) => `  - [${issue.code}] ${issue.message}`).join('\n');
  throw new Error(`Generated brand deck failed layout validation:\n${detail}`);
}

// ---------- internals --------------------------------------------------------

function countBodiesWithoutFitLayer($: CheerioAPI): number {
  let count = 0;
  $('.f-body').each((_, node) => {
    if ($(node).find('.f-fit').length === 0) count += 1;
  });
  return count;
}

function truncatedMessageSlots($: CheerioAPI): string[] {
  const found: string[] = [];
  for (const slot of MESSAGE_SLOT_CLASSES) {
    $(`.${slot}`).each((_, node) => {
      const classes = parseClasses($(node).attr('class'));
      if (classes.some((c) => TRUNCATION_CLASSES.includes(c))) {
        found.push(classes.join('.'));
      }
    });
  }
  return found;
}

function funnelTracksCarryText($: CheerioAPI): boolean {
  let clipped = false;
  $('.s-bar .track').each((_, node) => {
    if ($(node).text().trim().length > 0) clipped = true;
  });
  return clipped;
}

function parseClasses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

function plural(n: number, singular: string, plural: string): string {
  return n === 1 ? singular : plural;
}
