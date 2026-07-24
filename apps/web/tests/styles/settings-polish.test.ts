import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { readExpandedIndexCss } from '../helpers/read-expanded-css';

const indexCss = readFileSync(new URL('../../src/index.css', import.meta.url), 'utf8');
const expandedIndexCss = readExpandedIndexCss();
const mentionHomeCss = readFileSync(new URL('../../src/styles/workspace/mention-home.css', import.meta.url), 'utf8');
const settingsAboutCss = readFileSync(new URL('../../src/components/SettingsAbout.module.css', import.meta.url), 'utf8');

function cssBlock(css: string, selector: string): string {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const match = new RegExp(`${escaped}\\s*\\{([^}]*)\\}`).exec(css);
  if (!match) throw new Error(`Missing CSS block for ${selector}`);
  return match[1] ?? '';
}

function ruleValue(block: string, property: string): string {
  const match = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+);`).exec(block);
  if (!match) throw new Error(`Missing CSS property ${property}`);
  return match[1]!.trim();
}

describe('settings polish CSS', () => {
  it('keeps the global stylesheet as an import manifest after the CSS split', () => {
    const nonImportLines = indexCss
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('@import'));

    expect(nonImportLines).toEqual([]);
  });

  it('paints selected select options as a full-row state, not text-only emphasis', () => {
    const option = cssBlock(expandedIndexCss, '.od-select-option');
    const selected = cssBlock(expandedIndexCss, '.od-select-option.selected');
    const selectedHover = cssBlock(expandedIndexCss, '.od-select-option.selected:hover:not(:disabled),\n.od-select-option.selected.active:not(:disabled)');

    expect(ruleValue(option, 'width')).toBe('100%');
    expect(ruleValue(option, 'display')).toBe('grid');
    expect(ruleValue(selected, 'background')).toBe('color-mix(in srgb, var(--selected) 9%, var(--bg-subtle))');
    expect(ruleValue(selectedHover, 'background')).toBe('color-mix(in srgb, var(--selected) 13%, var(--bg-subtle))');
  });

  it('keeps the settings header above scrolling content rows', () => {
    const head = cssBlock(mentionHomeCss, '.modal-settings .modal-head');
    const body = cssBlock(mentionHomeCss, '.modal-settings .modal-body');
    const content = cssBlock(mentionHomeCss, '.settings-content');

    expect(ruleValue(body, 'overflow')).toBe('hidden');
    expect(ruleValue(head, 'position')).toBe('relative');
    expect(ruleValue(head, 'z-index')).toBe('2');
    expect(ruleValue(head, 'background')).toBe('var(--bg-elevated)');
    expect(ruleValue(content, 'position')).toBe('relative');
    expect(ruleValue(content, 'z-index')).toBe('1');
  });

  it('presents the About update preference as a compact accessible switch', () => {
    const row = cssBlock(settingsAboutCss, '.root .toggleRow');
    const control = cssBlock(settingsAboutCss, '.switchControl');
    const checkbox = cssBlock(settingsAboutCss, '.switchControl input');
    const track = cssBlock(settingsAboutCss, '.switchTrack');

    expect(ruleValue(row, 'display')).toBe('grid');
    expect(ruleValue(row, 'grid-template-columns')).toBe('20px minmax(0, 1fr) 34px');
    expect(ruleValue(row, 'align-items')).toBe('center');
    expect(ruleValue(control, 'width')).toBe('34px');
    expect(ruleValue(control, 'height')).toBe('20px');
    expect(ruleValue(checkbox, 'position')).toBe('absolute');
    expect(ruleValue(checkbox, 'opacity')).toBe('0');
    expect(ruleValue(track, 'border-radius')).toBe('999px');
  });

  it('groups About actions into continuous cards with full-width rows', () => {
    const card = cssBlock(settingsAboutCss, '.card');
    const row = cssBlock(settingsAboutCss, '.row,\n.linkRow');

    expect(ruleValue(card, 'overflow')).toBe('hidden');
    expect(ruleValue(card, 'border-radius')).toBe('var(--about-card-radius)');
    expect(ruleValue(row, 'width')).toBe('100%');
    expect(ruleValue(row, 'align-items')).toBe('center');
    expect(ruleValue(row, 'border-radius')).toBe('0');
  });

  it('keeps updater popup checkbox and actions on one footer row for long en labels', () => {
    const footer = cssBlock(mentionHomeCss, '.updater-popup__footer');
    const preference = cssBlock(mentionHomeCss, '.updater-popup__preference');
    const label = cssBlock(mentionHomeCss, '.updater-popup__checkbox span');
    const actions = cssBlock(mentionHomeCss, '.updater-popup__actions');

    expect(ruleValue(footer, 'display')).toBe('flex');
    expect(ruleValue(footer, 'flex-wrap')).toBe('nowrap');
    expect(ruleValue(preference, 'flex')).toBe('1 1 0');
    expect(ruleValue(preference, 'min-width')).toBe('0');
    expect(ruleValue(label, 'white-space')).toBe('normal');
    expect(ruleValue(actions, 'flex')).toBe('0 0 auto');
    expect(ruleValue(actions, 'flex-wrap')).toBe('nowrap');
  });
});
