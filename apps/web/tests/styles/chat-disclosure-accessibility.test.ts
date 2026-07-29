import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

const toolsCss = readFileSync(new URL('../../src/styles/viewer/tools.css', import.meta.url), 'utf8');
const composioCss = readFileSync(new URL('../../src/styles/viewer/composio.css', import.meta.url), 'utf8');
const routinesCss = readFileSync(new URL('../../src/styles/viewer/routines.css', import.meta.url), 'utf8');

function declarations(css: string, selector: string): string {
  const match = css.match(new RegExp(`${selector.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}\\s*\\{([^}]*)\\}`));
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

describe('chat disclosure accessibility styles', () => {
  it('lets a running category badge retain the running state color', () => {
    expect(declarations(toolsCss, '.op-status-running')).toContain('color: var(--purple)');
    expect(declarations(toolsCss, '.op-status-category')).not.toMatch(/(?:^|\n)\s*color\s*:/);
  });

  it('keeps completed assistant controls discoverable without hover', () => {
    expect(composioCss).toContain('@media (hover: none) {\n  .assistant-footer { opacity: 1; }\n}');
    expect(routinesCss).toContain('@media (hover: none) {\n  .app .assistant-footer { opacity: 1; }\n}');
  });
});
