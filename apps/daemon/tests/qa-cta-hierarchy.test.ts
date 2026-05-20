import { describe, expect, it } from 'vitest';

import { analyseCtaHierarchy } from '../src/qa/cta-hierarchy.js';

// These tests pin down the first-useful-version contract for the CTA hierarchy
// static QA pass. The function is intentionally conservative: precision > recall.
// Adding new heuristics is fine, but they must not regress any case here.

describe('analyseCtaHierarchy', () => {
  it('returns an empty report when the document has no buttons or anchors', () => {
    const report = analyseCtaHierarchy('<main><p>Welcome to the site</p></main>');
    expect(report.issues).toEqual([]);
    expect(report.primaryCount).toBe(0);
    expect(report.secondaryCount).toBe(0);
  });

  it('does not flag a single clear primary CTA paired with a secondary CTA', () => {
    const html = `
      <section>
        <a class="btn btn-primary" href="/signup">Get started</a>
        <a class="btn" href="/learn-more">Learn more</a>
      </section>
    `;
    const report = analyseCtaHierarchy(html);
    expect(report.issues).toEqual([]);
    expect(report.primaryCount).toBe(1);
    expect(report.secondaryCount).toBe(1);
  });

  it('flags two primary CTAs sharing the same section as multiple-primary', () => {
    const html = `
      <section>
        <a class="btn btn-primary" href="/signup">Sign up</a>
        <a class="btn btn-primary" href="/buy">Buy now</a>
      </section>
    `;
    const report = analyseCtaHierarchy(html);
    const kinds = report.issues.map((issue) => issue.kind);
    expect(kinds).toContain('multiple-primary');
    expect(report.primaryCount).toBe(2);
    // The selector should be short enough to surface in a one-line UI hint.
    const offender = report.issues.find((issue) => issue.kind === 'multiple-primary');
    expect(offender?.selector.length ?? 0).toBeLessThan(80);
  });

  it('flags ambiguous-weight when every CTA is rendered with identical class and inline style', () => {
    const html = `
      <header>
        <a class="btn" href="/a">Get started</a>
        <a class="btn" href="/b">Subscribe</a>
        <a class="btn" href="/c">Buy</a>
      </header>
    `;
    const report = analyseCtaHierarchy(html);
    const kinds = report.issues.map((issue) => issue.kind);
    expect(kinds).toContain('ambiguous-weight');
    // None of these were tagged primary, so primaryCount stays at zero.
    expect(report.primaryCount).toBe(0);
    expect(report.secondaryCount).toBe(3);
  });

  it('flags misleading-prominence when secondary-coded copy uses solid primary styling', () => {
    const html = `
      <section>
        <a class="btn btn-primary" href="/buy">Buy now</a>
        <a class="btn" style="background-color: #1d4ed8; color: white; font-size: 20px" href="/learn-more">Learn more</a>
      </section>
    `;
    const report = analyseCtaHierarchy(html);
    const misleading = report.issues.find((issue) => issue.kind === 'misleading-prominence');
    expect(misleading).toBeDefined();
    expect(misleading?.message.toLowerCase()).toContain('learn more');
  });

  it('detects Chinese CTA copy such as "立即购买" and applies the same heuristics', () => {
    const html = `
      <section>
        <button class="btn btn-primary">立即购买</button>
        <button class="btn btn-primary">立即下单</button>
      </section>
    `;
    const report = analyseCtaHierarchy(html);
    const kinds = report.issues.map((issue) => issue.kind);
    expect(kinds).toContain('multiple-primary');
    expect(report.primaryCount).toBe(2);
  });

  it('treats inline background-color as a primary-weight signal even without a primary class', () => {
    // Mirrors the issue #2251 inverse: a "btn" element styled with a solid
    // accent color is still effectively a primary CTA in the rendered page.
    const html = `
      <section>
        <a class="btn" style="background-color: #1d4ed8; color: white">查看到港货盘</a>
        <a class="btn btn-primary" href="/checkout">立即下单</a>
      </section>
    `;
    const report = analyseCtaHierarchy(html);
    expect(report.primaryCount).toBe(2);
    expect(report.issues.map((issue) => issue.kind)).toContain('multiple-primary');
  });

  it('ignores non-CTA buttons such as icon toggles with no actionable copy', () => {
    // Buttons without CTA-style copy (e.g. a "+" toggle) should not be picked
    // up as CTA candidates; otherwise the hierarchy checks become noisy.
    const html = `
      <section>
        <button class="btn">+</button>
        <button class="btn">−</button>
      </section>
    `;
    const report = analyseCtaHierarchy(html);
    expect(report.issues).toEqual([]);
    expect(report.primaryCount).toBe(0);
    expect(report.secondaryCount).toBe(0);
  });

  it('does not collapse sibling <div> wrappers without a landmark ancestor', () => {
    // Flat card-grid layout with no landmark ancestor: two sibling
    // <div>s each carry one primary CTA. With a tag-only parent
    // fallback ("parent:div") both CTAs land in the same bucket and
    // detectMultiplePrimary() reports a fake shared-section conflict.
    // The container key must include the parent's identity, not just
    // its tag name.
    const html = `
      <div>
        <div><a class="btn btn-primary" href="/a">Get started</a></div>
        <div><a class="btn btn-primary" href="/b">Sign up</a></div>
      </div>
    `;
    const report = analyseCtaHierarchy(html);
    const kinds = report.issues.map((issue) => issue.kind);
    expect(kinds).not.toContain('multiple-primary');
    expect(report.primaryCount).toBe(2);
  });

  it('does not flag ambiguous-weight when two unrelated sections each contain a single .btn CTA', () => {
    // Cross-section signature coincidence should not be a hierarchy
    // warning: each section has only one CTA, so there is no
    // "everything in this container looks the same" condition to
    // satisfy. The rule must respect container boundaries.
    const html = `
      <article>
        <section><a class="btn" href="/a">Get started</a></section>
        <section><a class="btn" href="/b">Subscribe</a></section>
      </article>
    `;
    const report = analyseCtaHierarchy(html);
    const kinds = report.issues.map((issue) => issue.kind);
    expect(kinds).not.toContain('ambiguous-weight');
  });
});
