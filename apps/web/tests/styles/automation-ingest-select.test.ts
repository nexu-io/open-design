import { readFileSync } from 'node:fs';

import postcss, { type Declaration, type Root, type Rule } from 'postcss';
import { describe, expect, it } from 'vitest';

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const tasksCss = readFileSync(
  new URL('../../src/styles/home/tasks.css', import.meta.url),
  'utf8',
);

const indexRoot = postcss.parse(indexCss, { from: 'src/index.css' });
const tasksRoot = postcss.parse(tasksCss, { from: 'src/styles/home/tasks.css' });

function ruleFor(root: Root, selector: string): Rule {
  let found: Rule | null = null;

  root.walkRules((rule) => {
    const selectors = rule.selector.split(',').map((item) => item.trim());
    if (selectors.includes(selector)) found ??= rule;
  });

  if (!found) throw new Error(`Missing CSS block for ${selector}`);
  return found;
}

function declaration(rule: Rule, property: string): Declaration | null {
  const declarations: Declaration[] = [];

  rule.walkDecls(property, (decl) => {
    declarations.push(decl);
  });

  return declarations.at(-1) ?? null;
}

function value(rule: Rule, property: string): string {
  const decl = declaration(rule, property);
  if (!decl) throw new Error(`Missing CSS property ${property}`);
  return decl.value;
}

describe('automation ingest select styles', () => {
  it('preserves custom select chevrons while tinting ingest fields', () => {
    const ingestSelect = ruleFor(tasksRoot, '.automation-ingest-field select');

    expect(value(ingestSelect, 'background-color')).toBe('var(--bg-subtle)');
    expect(declaration(ingestSelect, 'background')).toBeNull();

    for (const selector of ["[data-theme='dark'] select", 'html:not([data-theme]) select']) {
      const select = ruleFor(indexRoot, selector);

      expect(value(select, 'background-repeat')).toBe('no-repeat');
      expect(value(select, 'background-position')).toBe('right 10px center');
      expect(value(select, 'background-size')).toBe('12px 12px');
    }
  });
});
