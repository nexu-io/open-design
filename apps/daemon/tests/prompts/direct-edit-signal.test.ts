/**
 * Direct-edit fast path.
 *
 * A one-line change to an artifact that already exists must NOT drag the
 * discovery form, the designer charter, the active skill body, the deck
 * framework or the TodoWrite plan along with it — every one of those turns a
 * two-tool-call edit into a multi-round-trip ceremony. These assertions pin
 * the contract on both sides: the fast path fires for edit vocabulary, and it
 * never fires for a new build, ask mode, or a media surface.
 */
import { describe, expect, it } from 'vitest';

import {
  DIRECT_EDIT_OVERRIDE,
  composeSystemPrompt,
  detectEditIntentSignal,
} from '../../src/prompts/system.js';

const DISCOVERY_HEADING = '# OD core directives (read first';
const CHARTER_HEADING = '# Identity and workflow charter (background)';
const PLAN_HEADING = '## RULE 3 — TodoWrite the plan';
const SKILL_HEADING = '## Active skill';
const CLARIFY_HEADING = '## Structured clarification on any turn';
const DIRECT_EDIT_HEADING = '# Direct edit mode — change the existing artifact, nothing else';

describe('detectEditIntentSignal', () => {
  it('fires on English edit vocabulary', () => {
    expect(detectEditIntentSignal('change the headline to "Ship faster"')).toBe(true);
    expect(detectEditIntentSignal('make the button bigger')).toBe(true);
    expect(detectEditIntentSignal('tweak the spacing between cards')).toBe(true);
    expect(detectEditIntentSignal('fix the color of the nav')).toBe(true);
    expect(detectEditIntentSignal('rename pricing-page.html')).toBe(true);
  });

  it('fires on Chinese edit vocabulary', () => {
    expect(detectEditIntentSignal('把标题改成「更快交付」')).toBe(true);
    expect(detectEditIntentSignal('字体调大一点')).toBe(true);
    expect(detectEditIntentSignal('颜色换成蓝色')).toBe(true);
    expect(detectEditIntentSignal('间距调整一下')).toBe(true);
  });

  it('stays quiet on new-build briefs', () => {
    expect(detectEditIntentSignal('build me a landing page for a coffee brand')).toBe(false);
    expect(detectEditIntentSignal('create a pitch deck for our seed round')).toBe(false);
    expect(detectEditIntentSignal('design a dashboard for support tickets')).toBe(false);
    expect(detectEditIntentSignal('')).toBe(false);
    expect(detectEditIntentSignal(undefined, null)).toBe(false);
  });

  it('stays quiet on bug reports that are not visual edits', () => {
    expect(detectEditIntentSignal('fix this kind of error, spawn a background agent')).toBe(false);
    expect(detectEditIntentSignal('why is the daemon crashing on startup?')).toBe(false);
  });

  it('stays quiet on a long brief that merely mentions an edit word', () => {
    const brief = [
      'Build a marketing site for our new analytics product.',
      'It should explain the product, show three feature blocks, include pricing,',
      'and please change the tone to be more editorial than corporate.',
    ].join(' ').repeat(4);
    expect(brief.length).toBeGreaterThan(600);
    expect(detectEditIntentSignal(brief)).toBe(false);
  });
});

describe('composeSystemPrompt — direct-edit fast path', () => {
  const project = { metadata: { kind: 'prototype' as const }, executionProfile: 'filesystem' as const };

  it('ships only the direct-edit workflow when the signal is on', () => {
    const out = composeSystemPrompt({ ...project, editIntentSignal: true });
    expect(out).toContain(DIRECT_EDIT_HEADING);
    expect(out).toContain(DIRECT_EDIT_OVERRIDE);
  });

  it('drops the discovery layer, charter, plan and clarification surface', () => {
    const out = composeSystemPrompt({ ...project, editIntentSignal: true });
    expect(out).not.toContain(DISCOVERY_HEADING);
    expect(out).not.toContain(CHARTER_HEADING);
    expect(out).not.toContain(PLAN_HEADING);
    expect(out).not.toContain(CLARIFY_HEADING);
  });

  it('drops the active skill body (a simple edit is not a skill run)', () => {
    const out = composeSystemPrompt({
      ...project,
      skillBody: '# Long skill workflow\n\nStep 1 …',
      skillName: 'prototype',
      editIntentSignal: true,
    });
    expect(out).toContain(DIRECT_EDIT_HEADING);
    expect(out).not.toContain(SKILL_HEADING);
    expect(out).not.toContain('Step 1 …');
  });

  it('keeps the active design system so brand tokens still resolve', () => {
    const out = composeSystemPrompt({
      ...project,
      designSystemBody: '# Brand\n\nUse navy.',
      designSystemTitle: 'Acme',
      editIntentSignal: true,
    });
    expect(out).toContain('Use navy.');
  });

  it('drops the project-metadata delivery rules that describe building', () => {
    const out = composeSystemPrompt({ ...project, editIntentSignal: true });
    expect(out).not.toContain('## Project metadata');
    expect(out).not.toContain('screen-file-first rule');
  });

  it('keeps the full build workflow when the signal is absent', () => {
    const out = composeSystemPrompt(project);
    expect(out).toContain(DISCOVERY_HEADING);
    expect(out).toContain(PLAN_HEADING);
    expect(out).not.toContain(DIRECT_EDIT_HEADING);
  });

  it('never takes the fast path in ask mode', () => {
    const out = composeSystemPrompt({ ...project, sessionMode: 'chat', editIntentSignal: true });
    expect(out).not.toContain(DIRECT_EDIT_HEADING);
  });

  it('never takes the fast path on a media surface', () => {
    const out = composeSystemPrompt({
      metadata: { kind: 'image' as const },
      skillMode: 'image',
      editIntentSignal: true,
    });
    expect(out).not.toContain(DIRECT_EDIT_HEADING);
  });
});
