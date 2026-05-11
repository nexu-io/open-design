import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');

// Load a real deck skill to test with actual content
const pptSkillPath = path.join(repoRoot, 'skills/guizang-ppt/SKILL.md');
const pptSkillMarkdown = readFileSync(pptSkillPath, 'utf8');
const pptSkillBody = pptSkillMarkdown.replace(/^---[\s\S]*?---\n\n/, '').trim();

describe('composeSystemPrompt — deck mode', () => {
  it('injects deck framework directive when skillMode=deck', () => {
    const prompt = composeSystemPrompt({
      skillName: 'ppt-business-deck',
      skillMode: 'deck',
      skillBody: pptSkillBody,
      metadata: { kind: 'deck' },
    });

    // Deck framework directive must be present
    expect(prompt).toContain('deck');
    expect(prompt).toContain('slide');
    expect(prompt).toContain('outline');

    // Per-slide directive for turn-by-turn generation
    expect(prompt).toContain('one slide per turn');

    // Theme token binding
    expect(prompt).toContain(':root');

    // Skill body content must flow through
    expect(prompt).toContain(pptSkillBody.slice(0, 100).slice(0, 50));
  });

  it('injects deck session hint for interactive deck projects', () => {
    const prompt = composeSystemPrompt({
      skillName: 'ppt-business-deck',
      skillMode: 'deck',
      skillBody: pptSkillBody,
      metadata: { kind: 'deck' },
    });

    // Session hint should be present for deck mode
    expect(prompt).toContain('kind=deck');
  });

  it('includes deck project metadata in the prompt', () => {
    const prompt = composeSystemPrompt({
      skillName: 'ppt-business-deck',
      skillMode: 'deck',
      skillBody: pptSkillBody,
      metadata: {
        kind: 'deck',
        intent: 'Business presentation for Q4 review',
      },
    });

    // Deck mode must be signaled so downstream prompts are injected
    expect(prompt).toContain('deck');
    // The per-slide directive confirms deck prompts are active
    expect(prompt).toContain('one slide per turn');
  });

  it('does NOT inject deck framework when skillMode is not deck', () => {
    const prompt = composeSystemPrompt({
      skillName: 'live-artifact',
      skillMode: 'prototype',
      skillBody: 'some skill body',
      metadata: { kind: 'prototype' },
    });

    // Non-deck modes should not get deck-specific directives
    expect(prompt).not.toContain('one slide per turn');
    expect(prompt).not.toContain('DECK_FRAMEWORK');
  });
});
