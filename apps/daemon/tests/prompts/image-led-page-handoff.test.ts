import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

import { composeSystemPrompt as composeDaemonPrompt } from '../../src/prompts/system.js';
import { composeSystemPrompt as composeApiPrompt } from '@open-design/contracts';

// The shipped SKILL.md once ended its hard rules with a blanket
// "Do not emit an `<artifact>` tag." — correct for filesystem runs, fatal
// for text-artifact/BYOK prototype runs: the API-mode override names a
// final `<artifact type="text/html">` block as their only delivery path,
// so a blanket ban left those runs unable to hand off the landing page
// the template promises (PR #7625 review, head cb2fbfa0e). This spec pins
// the handoff rule as execution-context-scoped and proves both composed
// prompts stay self-consistent.

const SKILL_MD = readFileSync(
  fileURLToPath(
    new URL('../../../../design-templates/image-led-page/SKILL.md', import.meta.url),
  ),
  'utf8',
);

const BLANKET_BAN = /^- Do not emit an `<artifact>` tag\.$/m;

describe('image-led-page — handoff stays deliverable in both execution contexts', () => {
  it('scopes the artifact rule by execution context instead of a blanket ban', () => {
    expect(SKILL_MD).not.toMatch(BLANKET_BAN);
    // Filesystem branch: write the page, close with the normal file summary.
    expect(SKILL_MD).toMatch(/filesystem tools/i);
    expect(SKILL_MD).toMatch(/file summary/i);
    // Text-artifact branch: canonical HTML in a single <artifact> tag.
    expect(SKILL_MD).toMatch(/text-artifact/i);
    expect(SKILL_MD).toMatch(/<artifact type="text\/html">/);
  });

  it('filesystem composition carries the scoped handoff rule into the prompt', () => {
    const out = composeDaemonPrompt({
      skillBody: SKILL_MD,
      skillName: 'image-led-page',
    });
    expect(out).toContain('## Active skill — image-led-page');
    expect(out).not.toMatch(BLANKET_BAN);
    expect(out).toMatch(/file summary/i);
  });

  it('text-artifact composition keeps the artifact handoff the API override requires', () => {
    const out = composeApiPrompt({
      streamFormat: 'plain',
      skillBody: SKILL_MD,
      skillName: 'image-led-page',
    });
    expect(out).toContain('## Active skill — image-led-page');
    // The API-mode override's delivery contract must be present…
    expect(out).toContain('<artifact type="text/html">');
    // …and the active skill must no longer contradict it.
    expect(out).not.toMatch(BLANKET_BAN);
    expect(out).toMatch(/text-artifact/i);
  });
});
