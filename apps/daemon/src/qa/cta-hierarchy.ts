// Post-generation static QA pass for CTA (call-to-action) hierarchy.
//
// Background: Open Design's generated HTML/CSS prototypes are sometimes
// "functionally correct but feel unfinished" — a primary commerce action
// renders as a neutral button, two equally-styled CTAs compete for the
// same conversion slot, or a "Learn more" link is styled like the buy
// button. See nexu-io/open-design#2251 for the motivating bug report.
//
// `analyseCtaHierarchy` parses the rendered HTML and returns a small set
// of conservative findings. It is intentionally precision-biased: when
// the signal is weak, the function says nothing. The output is the
// first-useful-version of the QA pass; HTTP/CLI exposure and auto-repair
// are explicit follow-ups.

import { type CheerioAPI, load } from 'cheerio';

// Cheerio 1.x doesn't re-export the underlying `AnyNode`/`Element` types
// from `domhandler`. Importing `domhandler` directly would punch through
// daemon's declared dependency boundary, so we derive a generic "node
// collection" type from the API surface we actually use.
type CheerioCollection = ReturnType<CheerioAPI>;
type CheerioNode = CheerioCollection extends ArrayLike<infer N> ? N : never;

export interface CtaHierarchyIssue {
  /** Category of the finding; the UI may surface different copy per kind. */
  kind: 'multiple-primary' | 'ambiguous-weight' | 'misleading-prominence';
  /** Short CSS-like selector for the offending element, e.g. `a.btn.btn-primary`. */
  selector: string;
  /** One-sentence English description of the issue, suitable for a warning UI. */
  message: string;
}

export interface CtaHierarchyReport {
  issues: CtaHierarchyIssue[];
  primaryCount: number;
  secondaryCount: number;
}

/**
 * Parse the rendered HTML and return CTA-hierarchy findings.
 *
 * The function is deterministic and side-effect free. Returns an empty
 * report (no issues, zero counts) when the document has no CTA-shaped
 * elements. The set of rules is intentionally narrow — see the issue list
 * in this file for the categories we currently surface.
 */
export function analyseCtaHierarchy(html: string): CtaHierarchyReport {
  const $ = load(html);
  const candidates = collectCtaCandidates($);

  if (candidates.length === 0) {
    return { issues: [], primaryCount: 0, secondaryCount: 0 };
  }

  const primaryCount = candidates.filter((cta) => cta.weight === 'primary').length;
  const secondaryCount = candidates.length - primaryCount;

  const issues: CtaHierarchyIssue[] = [
    ...detectMultiplePrimary(candidates),
    ...detectAmbiguousWeight(candidates),
    ...detectMisleadingProminence(candidates),
  ];

  return { issues, primaryCount, secondaryCount };
}

// ---------- internals --------------------------------------------------------

type Weight = 'primary' | 'secondary';

interface CtaCandidate {
  el: CheerioCollection;
  text: string;
  classes: string[];
  inlineStyle: string;
  weight: Weight;
  selector: string;
  /** Section/container key used to group multiple-primary findings. */
  containerKey: string;
}

// Conversion-oriented copy that strongly suggests the element is the page's
// commercial action. Mix of English and Simplified Chinese, matched
// case-insensitively as substrings on the element's text content.
const CTA_KEYWORDS = [
  // English
  'get started',
  'sign up',
  'sign in',
  'log in',
  'buy',
  'shop now',
  'subscribe',
  'subscribe now',
  'try it free',
  'start free trial',
  'free trial',
  'add to cart',
  'order now',
  'checkout',
  'continue',
  'submit',
  // Secondary English (still CTA-shaped — flagged separately below).
  'learn more',
  'read more',
  'more info',
  'see more',
  // Chinese
  '开始',
  '立即',
  '查看',
  '购买',
  '选购',
  '下单',
  '提交',
  '加入购物车',
  '加入询价车',
  '免费试用',
  '了解更多',
  '更多',
  '详情',
];

// Copy that signals a SECONDARY CTA. If the visual weight on these elements
// reads as primary, that's the misleading-prominence case.
const SECONDARY_KEYWORDS = [
  'learn more',
  'read more',
  'more info',
  'see more',
  '了解更多',
  '更多',
  '详情',
];

function collectCtaCandidates($: CheerioAPI): CtaCandidate[] {
  const candidates: CtaCandidate[] = [];

  // 1. Every <button>, every <a>, and anything with role="button" is a
  //    structural candidate. We then filter on copy + class signals.
  const selector = 'button, a, [role="button"]';
  $(selector).each((_, node) => {
    const el = $(node);
    const text = normaliseText(el.text());
    const classes = parseClasses(el.attr('class'));
    const role = el.attr('role') ?? '';
    const tag = (node as { tagName?: string; name?: string }).tagName ?? (node as { name?: string }).name ?? '';

    // A button-shaped element is a CTA candidate when EITHER:
    //   (a) its class list contains a btn/button/cta marker, OR
    //   (b) its tag is <button> AND the copy matches a CTA keyword, OR
    //   (c) it carries role="button".
    // Plain anchors without any of these signals are skipped — there are
    // usually many of them in nav menus and they'd produce noise.
    const hasButtonClass = classes.some((c) => /(^|-)btn$|(^|-)button$|(^|-)cta$|^btn(-|$)|^button(-|$)|^cta(-|$)/i.test(c));
    const isButtonTag = tag.toLowerCase() === 'button';
    const isRoleButton = role.toLowerCase() === 'button';
    const hasCtaCopy = matchesAnyKeyword(text, CTA_KEYWORDS);

    if (!hasButtonClass && !isRoleButton && !(isButtonTag && hasCtaCopy)) {
      return;
    }

    // Even after the structural filter, drop elements whose copy is not
    // CTA-shaped at all (e.g. icon toggles like "+" / "−"). Anchors with a
    // .btn class but no actionable copy frequently appear as inert chips.
    if (!hasCtaCopy) {
      return;
    }

    const inlineStyle = normaliseStyle(el.attr('style'));
    const weight = classifyWeight(classes, inlineStyle);
    const containerKey = computeContainerKey($, el);

    candidates.push({
      el,
      text,
      classes,
      inlineStyle,
      weight,
      selector: buildSelector(tag, classes, role),
      containerKey,
    });
  });

  return candidates;
}

function classifyWeight(classes: string[], inlineStyle: string): Weight {
  // Class-name signals are the strongest tell — design systems almost
  // always tag the primary variant with one of these tokens.
  const PRIMARY_CLASS_TOKENS = /(^|[-_])(primary|solid|filled|accent|cta)([-_]|$)/i;
  if (classes.some((c) => PRIMARY_CLASS_TOKENS.test(c))) {
    return 'primary';
  }

  // Otherwise infer from inline style: a non-transparent background colour
  // is the dominant visual signal users read as "this is the main button".
  // We don't try to evaluate computed CSS — that would require a full
  // rendering layer; inline style is enough for the precision-biased pass.
  if (hasNonTransparentBackground(inlineStyle)) {
    return 'primary';
  }

  return 'secondary';
}

function hasNonTransparentBackground(inlineStyle: string): boolean {
  const bg = extractStyleValue(inlineStyle, 'background-color') ?? extractStyleValue(inlineStyle, 'background');
  if (!bg) return false;
  const value = bg.toLowerCase().trim();
  if (!value) return false;
  if (value === 'transparent' || value === 'none' || value === 'inherit' || value === 'initial') return false;
  if (/^rgba\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*,\s*0(?:\.0+)?\s*\)$/.test(value)) return false;
  return true;
}

function extractStyleValue(inlineStyle: string, property: string): string | null {
  if (!inlineStyle) return null;
  // Tolerant declaration parser — we don't need full CSS fidelity here.
  const declarations = inlineStyle.split(';');
  for (const decl of declarations) {
    const colon = decl.indexOf(':');
    if (colon < 0) continue;
    const name = decl.slice(0, colon).trim().toLowerCase();
    if (name === property.toLowerCase()) {
      return decl.slice(colon + 1).trim();
    }
  }
  return null;
}

function computeContainerKey($: CheerioAPI, el: CheerioCollection): string {
  // Group CTAs by their nearest landmark/section ancestor. Falls back to
  // the direct parent so that a flat document (no <section>) still gives
  // us a meaningful grouping for the multiple-primary rule.
  const landmarks = ['section', 'header', 'footer', 'nav', 'main', 'aside', 'article'];
  for (const tag of landmarks) {
    const ancestor = el.closest(tag);
    if (ancestor.length > 0) {
      const node = ancestor[0];
      if (node) {
        // The DOM identity of the ancestor is stable within one parse, so
        // we can use a positional index to differentiate two <section>s.
        const all = $(tag).toArray();
        const index = all.indexOf(node);
        return `${tag}:${index}`;
      }
    }
  }
  // Keyed by parent-node identity, not just tag name: two sibling <div>s
  // each holding one .btn-primary CTA must NOT collapse into the same
  // bucket, otherwise detectMultiplePrimary() reports a shared-section
  // conflict on a flat layout where each card has only one CTA.
  const parent = el.parent();
  if (parent.length > 0) {
    const parentNode = parent[0];
    if (parentNode) {
      const parentTag =
        (parentNode as { tagName?: string }).tagName ?? (parentNode as { name?: string }).name ?? 'root';
      const all = $(parentTag).toArray();
      const index = all.indexOf(parentNode);
      return `parent:${parentTag}:${index}`;
    }
  }
  return 'parent:root';
}

function detectMultiplePrimary(candidates: CtaCandidate[]): CtaHierarchyIssue[] {
  const byContainer = new Map<string, CtaCandidate[]>();
  for (const cta of candidates) {
    if (cta.weight !== 'primary') continue;
    const bucket = byContainer.get(cta.containerKey) ?? [];
    bucket.push(cta);
    byContainer.set(cta.containerKey, bucket);
  }

  const issues: CtaHierarchyIssue[] = [];
  for (const bucket of byContainer.values()) {
    if (bucket.length < 2) continue;
    // Report the SECOND+ primary CTA in each container as the offender:
    // the first one is the legitimate primary, the rest dilute it.
    for (let i = 1; i < bucket.length; i += 1) {
      const cta = bucket[i];
      if (!cta) continue;
      issues.push({
        kind: 'multiple-primary',
        selector: cta.selector,
        message: `Multiple primary CTAs share the same section; "${truncate(cta.text)}" competes with the section's main action.`,
      });
    }
  }
  return issues;
}

function detectAmbiguousWeight(candidates: CtaCandidate[]): CtaHierarchyIssue[] {
  if (candidates.length < 2) return [];
  // Bucket by containerKey first: comparing signatures across the
  // entire document yields false positives when two unrelated sections
  // happen to share the same `.btn` styling but each holds only one
  // CTA. The rule is "every CTA in a container shares the same class +
  // inline style", so the container boundary must hold.
  const byContainer = new Map<string, CtaCandidate[]>();
  for (const cta of candidates) {
    const bucket = byContainer.get(cta.containerKey) ?? [];
    bucket.push(cta);
    byContainer.set(cta.containerKey, bucket);
  }
  const issues: CtaHierarchyIssue[] = [];
  for (const bucket of byContainer.values()) {
    if (bucket.length < 2) continue;
    const first = bucket[0];
    if (!first) continue;
    const reference = signature(first);
    if (!bucket.every((cta) => signature(cta) === reference)) continue;
    // Report the second one (the first is the natural anchor; subsequent
    // identical CTAs are the ones a reviewer would diff against).
    const cta = bucket[1];
    if (!cta) continue;
    issues.push({
      kind: 'ambiguous-weight',
      selector: cta.selector,
      message: `All CTAs share identical class and inline style; the visual hierarchy is ambiguous.`,
    });
  }
  return issues;
}

function detectMisleadingProminence(candidates: CtaCandidate[]): CtaHierarchyIssue[] {
  const issues: CtaHierarchyIssue[] = [];
  for (const cta of candidates) {
    if (cta.weight !== 'primary') continue;
    if (!matchesAnyKeyword(cta.text, SECONDARY_KEYWORDS)) continue;
    issues.push({
      kind: 'misleading-prominence',
      selector: cta.selector,
      message: `"${truncate(cta.text)}" reads as a secondary action but is styled with primary-weight visuals.`,
    });
  }
  return issues;
}

function signature(cta: CtaCandidate): string {
  const classes = [...cta.classes].sort().join('.');
  return `${classes}|${cta.inlineStyle}`;
}

function buildSelector(tag: string, classes: string[], role: string): string {
  const tagPart = tag.toLowerCase() || 'element';
  const classPart = classes.length > 0 ? `.${classes.join('.')}` : '';
  const rolePart = role && tagPart !== 'button' ? `[role="${role.toLowerCase()}"]` : '';
  return `${tagPart}${classPart}${rolePart}`;
}

function parseClasses(raw: string | undefined): string[] {
  if (!raw) return [];
  return raw.split(/\s+/).filter(Boolean);
}

function normaliseText(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim();
}

function normaliseStyle(raw: string | undefined): string {
  if (!raw) return '';
  return raw.replace(/\s+/g, ' ').trim();
}

function matchesAnyKeyword(text: string, keywords: readonly string[]): boolean {
  if (!text) return false;
  const lower = text.toLowerCase();
  return keywords.some((kw) => lower.includes(kw.toLowerCase()));
}

function truncate(text: string, max = 40): string {
  if (text.length <= max) return text;
  return `${text.slice(0, max - 1)}…`;
}
