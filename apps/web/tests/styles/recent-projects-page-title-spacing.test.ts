// Measurement spec for the project list page title (OPEND-3110). QA measured
// the title box 29px below the content card's top edge where the design says
// 24px (the same 24px the title sits off the left edge). The extra 5px came
// from `.recent-projects__head { align-items: center }`: the 28.8px heading
// line box was centered inside a 39px row whose height the filter pills set.
// The title block must therefore pin itself to the row's top so the heading
// box starts exactly on the 24px gutter.
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const recentProjectsCss = readFileSync(
  new URL('../../src/styles/home/recent-projects.css', import.meta.url),
  'utf8',
);
const entryLayoutCss = readFileSync(
  new URL('../../src/styles/home/entry-layout.css', import.meta.url),
  'utf8',
);

function rules(css: string): Array<{ selectors: string[]; body: string }> {
  const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');
  const rulePattern = /([^{}]+)\{([^}]*)\}/g;
  const out: Array<{ selectors: string[]; body: string }> = [];
  let match: RegExpExecArray | null;
  while ((match = rulePattern.exec(withoutComments)) !== null) {
    out.push({
      selectors: (match[1] ?? '').split(',').map((item) => item.trim()),
      body: match[2] ?? '',
    });
  }
  return out;
}

function declarations(css: string, selector: string): string {
  return rules(css)
    .filter((rule) => rule.selectors.includes(selector))
    .map((rule) => rule.body)
    .join('\n');
}

describe('project list page title — top spacing (OPEND-3110)', () => {
  it('the content gutter above the title is 24px', () => {
    // `padding: 24px 24px 48px` — top and sides 24, bottom 48.
    expect(declarations(entryLayoutCss, '.entry-main__inner')).toMatch(
      /padding:\s*24px\s+24px\s+48px\s*;/,
    );
  });

  it('the title block pins to the top of the head row instead of centering in it', () => {
    // The head row centers its children (the filter pills make it 39px tall);
    // the 28.8px heading must not inherit that centering or it lands 5px low.
    expect(declarations(recentProjectsCss, '.recent-projects__title-block')).toMatch(
      /align-self:\s*flex-start\s*;/,
    );
  });

  it('the heading adds no margin or padding of its own above the glyphs', () => {
    const heading = declarations(recentProjectsCss, '.recent-projects__heading');
    expect(heading).toMatch(/margin:\s*0\s*;/);
    expect(heading).not.toMatch(/padding-top/);
    expect(heading).not.toMatch(/margin-top/);
  });
});
