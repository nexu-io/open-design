import { describe, expect, it } from 'vitest';

import {
  PLUGIN_AUTHORING_DEFAULT_GOAL,
  PLUGIN_AUTHORING_DEFAULT_GOAL_ZH_CN,
  PLUGIN_AUTHORING_GOAL_INPUT,
  PLUGIN_AUTHORING_PROMPT,
  PLUGIN_AUTHORING_PROMPT_TEMPLATE,
  PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN,
  buildPluginAuthoringPrompt,
  buildPluginAuthoringInputs,
  buildPluginAuthoringPromptForInputs,
  createPluginAuthoringHandoff,
  normalizePluginAuthoringLocale,
  selectPluginAuthoringTemplate,
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

  it('forbids placeholder plugin.repo owners in generated manifests', () => {
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('gh --version');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('gh auth status');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('gh api user --jq .login');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/only use `gh api user --jq \.login` as a fallback/i);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/rate-limited/i);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/do not silently omit/i);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/omit plugin\.repo/i);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/explicitly report the auth problem/i);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('gh auth refresh -h github.com -s repo,workflow');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('gh auth login -h github.com -s repo,workflow');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('od plugin publish-repo generated-plugin --owner <github-login-or-org>');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toMatch(/Never write placeholder owners/i);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('open-design-user');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('<vendor>');
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE).toContain('your-username');
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

// Issue #4058: a Chinese UI starts the Create-plugin flow localized (the chip
// label/hint are zh-CN) but then snapped back to the English prompt template.
// These tests lock the locale routing and guarantee the zh-CN prompt keeps
// every guardrail the English one encodes.

describe('normalizePluginAuthoringLocale', () => {
  it('routes Simplified Chinese variants to zh-CN', () => {
    expect(normalizePluginAuthoringLocale('zh-CN')).toBe('zh-CN');
    expect(normalizePluginAuthoringLocale('zh')).toBe('zh-CN');
    expect(normalizePluginAuthoringLocale('zh-Hans')).toBe('zh-CN');
    expect(normalizePluginAuthoringLocale('ZH-cn')).toBe('zh-CN');
  });

  it('falls back to English for Traditional Chinese and non-Chinese locales', () => {
    // No Traditional template yet — better honest English than wrong-script Chinese.
    expect(normalizePluginAuthoringLocale('zh-TW')).toBe('en');
    expect(normalizePluginAuthoringLocale('zh-HK')).toBe('en');
    expect(normalizePluginAuthoringLocale('zh-Hant')).toBe('en');
    expect(normalizePluginAuthoringLocale('en')).toBe('en');
    expect(normalizePluginAuthoringLocale('fr')).toBe('en');
    expect(normalizePluginAuthoringLocale(undefined)).toBe('en');
    expect(normalizePluginAuthoringLocale(null)).toBe('en');
    expect(normalizePluginAuthoringLocale('')).toBe('en');
  });
});

describe('selectPluginAuthoringTemplate', () => {
  it('returns the zh-CN template only for Simplified Chinese', () => {
    expect(selectPluginAuthoringTemplate('zh-CN')).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN);
    expect(selectPluginAuthoringTemplate('zh')).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN);
    expect(selectPluginAuthoringTemplate('en')).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE);
    expect(selectPluginAuthoringTemplate('zh-TW')).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE);
    expect(selectPluginAuthoringTemplate(undefined)).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE);
  });
});

describe('PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN', () => {
  it('is actually Simplified Chinese and keeps the interpolating goal placeholder', () => {
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN).toContain(`{{${PLUGIN_AUTHORING_GOAL_INPUT}}}`);
    expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN).toContain('创建一个 Open Design 插件');
    const prompt = buildPluginAuthoringPrompt('一个 SaaS 路演稿工作流', 'zh-CN');
    expect(prompt).toContain('一个 SaaS 路演稿工作流');
    expect(prompt).not.toContain(`{{${PLUGIN_AUTHORING_GOAL_INPUT}}}`);
  });

  it('preserves every literal the agent must reproduce verbatim', () => {
    // Code tokens, file paths, JSON keys, command lines, banned placeholder
    // owners, the issue ref, and the hardcoded-English button labels must all
    // survive translation — the prose around them is the only thing localized.
    const literals = [
      'docs/plugins-spec.md',
      'generated-plugin',
      'SKILL.md',
      'open-design.json',
      'plugin.repo',
      'specVersion',
      'gh --version',
      'gh auth status',
      'gh api user --jq .login',
      'gh auth refresh -h github.com -s repo,workflow',
      'gh auth login -h github.com -s repo,workflow',
      'od plugin publish-repo generated-plugin --owner <github-login-or-org>',
      'open-design-user',
      '<vendor>',
      'example-user',
      'your-org',
      'your-username',
      'od plugin validate',
      'od plugin pack',
      'od plugin install --source',
      'od plugin publish --to open-design',
      'gh repo create',
      'git push',
      'Add to My plugins',
      'Publish repo',
      'Open Design PR',
      'nexu-io/open-design',
      '#2332',
      'node -e',
      'cat generated-plugin/open-design.json',
      'gh ... --jq',
    ];
    for (const literal of literals) {
      expect(PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN, `missing literal: ${literal}`).toContain(literal);
    }
  });

  it('localizes the default goal so a goal-less Chinese chip click stays Chinese', () => {
    expect(buildPluginAuthoringInputs(undefined, 'zh-CN')[PLUGIN_AUTHORING_GOAL_INPUT]).toBe(
      PLUGIN_AUTHORING_DEFAULT_GOAL_ZH_CN,
    );
    expect(buildPluginAuthoringPrompt(undefined, 'zh-CN')).toContain(PLUGIN_AUTHORING_DEFAULT_GOAL_ZH_CN);
    // English path is unchanged.
    expect(buildPluginAuthoringInputs(undefined)[PLUGIN_AUTHORING_GOAL_INPUT]).toBe(
      PLUGIN_AUTHORING_DEFAULT_GOAL,
    );
  });

  it('round-trips a goal through the inputs helper under zh-CN', () => {
    const inputs = buildPluginAuthoringInputs('从一段简报生成大纲', 'zh-CN');
    expect(inputs[PLUGIN_AUTHORING_GOAL_INPUT]).toBe('从一段简报生成大纲');
    const prompt = buildPluginAuthoringPromptForInputs(inputs, 'zh-CN');
    expect(prompt).toContain('从一段简报生成大纲');
    expect(prompt).toContain('创建一个 Open Design 插件');
  });
});

describe('createPluginAuthoringHandoff under zh-CN', () => {
  it('carries the zh-CN template and a Chinese prompt', () => {
    const handoff = createPluginAuthoringHandoff(7, '一个幻灯片大纲工作流', 'zh-CN');
    expect(handoff.source).toBe('plugin-authoring');
    if (handoff.source !== 'plugin-authoring') return;
    expect(handoff.goal).toBe('一个幻灯片大纲工作流');
    expect(handoff.prompt).toContain('一个幻灯片大纲工作流');
    expect(handoff.prompt).toContain('创建一个 Open Design 插件');
    expect(handoff.queryTemplate).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE_ZH_CN);
  });

  it('still defaults to the English template when no locale is passed', () => {
    const handoff = createPluginAuthoringHandoff(8, 'a slide outline workflow');
    if (handoff.source !== 'plugin-authoring') return;
    expect(handoff.queryTemplate).toBe(PLUGIN_AUTHORING_PROMPT_TEMPLATE);
  });
});
