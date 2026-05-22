import { describe, expect, it } from 'vitest';

import {
  PLUGIN_AUTHORING_DEFAULT_GOAL,
  PLUGIN_AUTHORING_GOAL_INPUT,
  PLUGIN_AUTHORING_PROMPT,
  PLUGIN_AUTHORING_PROMPT_TEMPLATE,
  buildPluginAuthoringPrompt,
  buildPluginAuthoringInputs,
  buildPluginAuthoringPromptForInputs,
  createPluginAuthoringHandoff,
} from '../../../src/components/home-hero/plugin-authoring';

// The Home "Create plugin" chip sends this prompt as the project's first
// user turn. When QA exercised it (issue #2332 transcript), the agent's
// summary turn freeform-recommended `od plugin publish --to open-design`
// and `gh repo create lefarcen/<name>` — recreating the exact flows the
// plugin-folder card buttons already own. The button prompts (PR #2363)
// encode auth gates, jq fallback, retry rules; agent summaries that
// duplicate them as raw shell commands drift from those guarantees and
// re-open the same bugs. These tests lock the rewritten prompt's
// guard-rails so a future prose edit can't reintroduce the freeform
// CLI suggestions.

describe('PLUGIN_AUTHORING_PROMPT_TEMPLATE', () => {
  it('keeps the goal placeholder so the template still interpolates', () => {
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain(`{{${PLUGIN_AUTHORING_GOAL_INPUT}}}`);
    expect(buildPluginAuthoringPrompt('a SaaS pitch deck workflow')).toContain(
      'a SaaS pitch deck workflow',
    );
    expect(PLUGIN_AUTHORING_PROMPT).toContain(PLUGIN_AUTHORING_DEFAULT_GOAL);
  });

  it('still asks the agent to scaffold generated-plugin with SKILL.md + manifest', () => {
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('generated-plugin');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('SKILL.md');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('open-design.json');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('plugin.repo');
  });

  it('still drives the local validation chain', () => {
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('od plugin validate');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('od plugin pack');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('od plugin install --source');
  });

  it('bans freeform publish / repo CLI suggestions in the summary turn', () => {
    // The agent transcript in #2332 had the agent recommending
    // `od plugin publish --to open-design`, `gh repo create
    // lefarcen/<name>`, and `git init && git push` in its summary —
    // recreating the exact flows the plugin-folder card buttons own.
    // The ban list must name those workarounds explicitly so the agent
    // can't drift back into them.
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(
      /Do NOT.*suggest follow-up CLI commands/i,
    );
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('od plugin publish --to open-design');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('gh repo create');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('git push');
  });

  it('points the user at the plugin-folder card buttons instead', () => {
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('Add to My plugins');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('Publish repo');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('Open Design PR');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(
      /Point the user at whichever button|Tell the user to click whichever button/i,
    );
  });

  it('warns against assuming standalone jq is installed', () => {
    // Same jq-fallback lesson as PR #2363 — agent reaches for jq first
    // by training-distribution default. The prompt must list portable
    // alternatives AND keep gh's --jq flag exempt.
    // Note `Do NOT\*\* ` matches the markdown-bolded `**Do NOT**` that
    // sits in the prompt. The bolding is intentional emphasis, so the
    // regex tolerates the `**` markers between NOT and the rest of the
    // sentence.
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(
      /Do NOT\W*assume the standalone `jq` binary is installed/i,
    );
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/cat .*open-design\.json/);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('node -e');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/`gh \.\.\. --jq` flag is fine|gh ships its own embedded library/i);
  });
});

describe('buildPluginAuthoringInputs / buildPluginAuthoringPromptForInputs', () => {
  it('round-trips a user-provided goal through the inputs helper', () => {
    const inputs = buildPluginAuthoringInputs('outline deck from a brief');
    expect(inputs[PLUGIN_AUTHORING_GOAL_INPUT]).toBe('outline deck from a brief');
    const prompt = buildPluginAuthoringPromptForInputs(inputs);
    expect(prompt).toContain('outline deck from a brief');
  });

  it('falls back to the default goal when the input is missing or blank', () => {
    expect(buildPluginAuthoringInputs(undefined)[PLUGIN_AUTHORING_GOAL_INPUT]).toBe(
      PLUGIN_AUTHORING_DEFAULT_GOAL,
    );
    expect(buildPluginAuthoringInputs('   ')[PLUGIN_AUTHORING_GOAL_INPUT]).toBe(
      PLUGIN_AUTHORING_DEFAULT_GOAL,
    );
  });
});

describe('createPluginAuthoringHandoff', () => {
  it('returns a plugin-authoring handoff with the rewritten prompt', () => {
    const handoff = createPluginAuthoringHandoff(1, 'a slide outline workflow');
    expect(handoff.source).toBe('plugin-authoring');
    if (handoff.source !== 'plugin-authoring') return;
    expect(handoff.goal).toBe('a slide outline workflow');
    expect(handoff.prompt).toContain('a slide outline workflow');
    // The handoff must carry the latest template so HomeView's
    // replacement-confirmation logic (`queueAuthoringChipId === 'create-plugin'`)
    // sends the rewritten copy and not a cached older string.
    expect(handoff.queryTemplate).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE);
  });
});
