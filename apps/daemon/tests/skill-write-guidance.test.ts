import { describe, expect, it } from 'vitest';
import { composeSystemPrompt } from '../src/prompts/system.js';

// Regression cover for the "skills are read-only and the agent was never told"
// report (0.21.0, packaged stable). A user asked the agent to update one of his
// own skills under the daemon data dir. Every write came back `Operation not
// permitted` — by design: `resolveChatExtraAllowedDirs` deliberately keeps skill
// roots out of the agent's writable allowlist, and Codex gets no skill dir at
// all (PR #622: "Do not add read-only resource/reference directories to Codex
// --add-dir").
//
// Nothing in the composed system prompt said so. With no stated boundary and no
// stated exit, the agent invented one: it told the user to open Open Design's
// settings and add the directory to a "文件系统 / 工作区 / 可写目录 / writable
// roots" option. No such setting exists — not for writable roots, not for a
// sandbox mode, not for an approval policy. The user hunted for it, could not
// find it, and filed a diagnostics bundle.
//
// These tests pin the three things the prompt must state so the failure mode
// cannot come back:
//   1. the boundary  — skill directories are not writable through file tools;
//   2. the staged copy — `.od-skills/<folder>/` is the one skill path the
//      permission error does NOT cover. `withSkillRootPreamble` advertises it
//      as the primary **Skill root** and it lives inside the agent's writable
//      project cwd, so a write there succeeds, looks like an install, and is
//      wiped when `stageActiveSkill` re-stages next turn — the same
//      misdirection as the invented setting, without the error to stop it;
//   3. the exit      — where a human actually edits a skill in the UI;
//   4. the prohibition on inventing product settings, worded so it stays a
//      statement about today rather than a promise we never make one.
//
// The assertions match on meaning rather than importing the implementation
// constant: a same-file copy would go green against any wording, including a
// wording that reintroduces the bug.
//
// Every assertion runs against the extracted section, never the whole prompt.
// Scoping matters: an earlier draft asserted `/today/i` over the full document
// and passed on `main` with no implementation at all, because some unrelated
// section happened to contain the word. A guard that cannot go red is not a
// guard.
const SECTION_HEADING = '## Editing skills';

function skillGuidanceSection(prompt: string): string {
  const start = prompt.indexOf(SECTION_HEADING);
  if (start < 0) return '';
  const rest = prompt.slice(start + SECTION_HEADING.length);
  const end = rest.search(/\n(?:#{1,3} |---)/u);
  return end < 0 ? rest : rest.slice(0, end);
}

function composedSkillGuidance(): string {
  return skillGuidanceSection(composeSystemPrompt({ metadata: { kind: 'prototype' } }));
}

describe('composeSystemPrompt — skill write guidance', () => {
  it('emits a dedicated skill-editing section', () => {
    expect(composedSkillGuidance()).not.toBe('');
  });

  it('states that skill directories are not writable through file tools', () => {
    const section = composedSkillGuidance();

    // The boundary itself, and the observable symptom the agent will hit.
    expect(section).toMatch(
      /skill (directories|folders|roots)[^.]*(are not|is not|aren't|cannot be)[^.]*writ/i,
    );
    expect(section).toMatch(/operation not permitted|permission denied|will fail/i);
  });

  it('names the staged .od-skills copy as a write that does not persist', () => {
    const section = composedSkillGuidance();

    // `/operation not permitted/` above cannot go red on this path: the staged
    // copy is inside the writable project cwd, so the write succeeds. The
    // section has to say so explicitly, or "write it into the project folder"
    // reads as an invitation to install into `.od-skills/<id>/SKILL.md`.
    expect(section).toMatch(/\.od-skills/);
    expect(section).toMatch(/(appear to succeed|succeed[^.]*(but|while)|does not (update|persist))/i);
    expect(section).toMatch(/(do not|don't|never) edit that path/i);
  });

  it('keeps the handover file out of the staged copy', () => {
    // The proposal is a new file in the project folder, explicitly not under
    // the staged skill root.
    expect(composedSkillGuidance()).toMatch(/never under `\.od-skills\/`/i);
  });

  it('points at the real UI location where a skill is edited', () => {
    // The actual entry point is the Integration view's Skills tab
    // (`IntegrationsView.tsx`, `integrations.tabLabel.skills`) — NOT a
    // "Settings > Skills" page, which does not exist. Naming the wrong
    // surface here would reproduce the original bug in our own voice.
    expect(composedSkillGuidance()).toMatch(/Integration[^.]{0,40}Skills/i);
  });

  it('forbids inventing sandbox / writable-root / approval-policy settings', () => {
    const section = composedSkillGuidance();

    // Hyphen-tolerant: the prose reads "writable-directory" / "approval-policy"
    // in attributive position and "writable roots" when naming the setting.
    expect(section).toMatch(/writable[- ](root|director)/i);
    expect(section).toMatch(/approval[- ]polic/i);
    expect(section).toMatch(
      /(do not|don't|never)[^.]*(invent|fabricate|make up|claim|tell the user to)/i,
    );
  });

  it('words the missing settings as "not today" rather than "never"', () => {
    const section = composedSkillGuidance();

    // Product asked for this explicitly: contributors read an absolute "we do
    // not have this" as "this is rejected". Keep it a statement about the
    // current build so a future writable-roots surface is not pre-refused.
    expect(section).toMatch(/do(es)? not currently|not yet|current build/i);
    expect(section).not.toMatch(
      /(will never|never going to|has no plans|not planned|we do not (support|intend))/i,
    );
  });
});
