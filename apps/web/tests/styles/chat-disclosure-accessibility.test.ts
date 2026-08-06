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

  it('keeps the thinking accordion expandable in the compact current activity row', () => {
    // The compact running row strips tool-card disclosures, but the thinking
    // block's accordion must stay displayable so streamed reasoning can be
    // expanded mid-run (incident recvqgLmAkUM6G). Hiding every
    // .accordion-collapsible under the row regresses that.
    expect(routinesCss).not.toMatch(/task-activity-current-row \.accordion-collapsible/);
    expect(routinesCss).toContain('.app .task-activity-current-row .op-card .accordion-collapsible');
  });

  it('keeps completed assistant controls discoverable without hover', () => {
    expect(composioCss).toContain('@media (hover: none) {\n  .assistant-footer { opacity: 1; }\n}');
    expect(routinesCss).toContain('@media (hover: none) {\n  .app .assistant-footer { opacity: 1; }\n}');
  });
});
