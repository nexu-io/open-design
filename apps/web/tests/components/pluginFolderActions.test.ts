// Contract test for the prompts the plugin-folder card buttons send to the
// agent. `install` / `publish` use the simple shared template; `contribute`
// is the PR-flow prompt that drives `gh repo fork → branch → commit →
// gh pr create --web` end-to-end. The tests below lock the *shape* of each
// prompt (keywords + folder interpolation) without coupling to exact wording,
// so prose tweaks don't break the suite but accidental removal of a critical
// step would.

import { describe, expect, it } from 'vitest';
import { buildPluginFolderAgentActionPrompt } from '../../src/components/design-files/pluginFolderActions';

const FOLDER = 'generated-plugin';

describe('buildPluginFolderAgentActionPrompt', () => {
  describe('install', () => {
    it('mentions the folder path and the supported install CLI', () => {
      const prompt = buildPluginFolderAgentActionPrompt(FOLDER, 'install');
      expect(prompt).toContain(`Plugin folder: \`${FOLDER}\``);
      expect(prompt).toContain('od plugin install --source');
    });
  });

  describe('publish', () => {
    it('mentions the folder path and the supported publish CLI', () => {
      const prompt = buildPluginFolderAgentActionPrompt(FOLDER, 'publish');
      expect(prompt).toContain(`Plugin folder: \`${FOLDER}\``);
      expect(prompt).toContain('od plugin publish');
    });
  });

  describe('contribute (PR-based flow)', () => {
    const prompt = buildPluginFolderAgentActionPrompt(FOLDER, 'contribute');

    it('targets the nexu-io/open-design community catalog', () => {
      expect(prompt).toContain('nexu-io/open-design');
      expect(prompt).toContain('plugins/community/<name>/');
    });

    it('drives the full PR flow via gh, not via the issue-URL CLI', () => {
      // The agent must drive raw gh commands rather than fall back to the
      // legacy `od plugin publish --to open-design` issue-URL launcher.
      expect(prompt).toContain('gh repo fork nexu-io/open-design');
      expect(prompt).toContain('gh repo clone');
      expect(prompt).toContain('git checkout -b plugin/');
      expect(prompt).toContain('gh pr create');
      // The legacy CLI is named in the prompt only as part of an explicit
      // ban ("Do NOT call the legacy `od plugin publish --to open-design`")
      // — verify the ban is in place, not the bare command.
      expect(prompt).toMatch(/do not call the legacy `od plugin publish --to open-design`/i);
    });

    it('uses --web so the author confirms the PR in browser', () => {
      // The "author keeps the final review click" invariant — preserved from
      // 45f52d71's "We never POST anywhere" principle.
      expect(prompt).toContain('--web');
      expect(prompt).toMatch(/do not auto-submit/i);
    });

    it('hard-bans AskUserQuestion to avoid 600s mid-turn stalls', () => {
      // Regression guard for the stall we observed during e2e: agent paused
      // mid-turn on an AskUserQuestion tool waiting for a host answer the
      // user never sent (they clicked the plugin-folder card instead).
      expect(prompt).toContain('AskUserQuestion');
      expect(prompt).toMatch(/do not call the `AskUserQuestion` tool|fire-and-forget/i);
    });

    it('forbids the agent from installing tools or retrying failures', () => {
      expect(prompt).toMatch(/do not try to install/i);
      expect(prompt).toMatch(/do not retry/i);
    });

    it('interpolates the actual folder path into manifest and copy steps', () => {
      // Sanity check that template-string interpolation didn't regress into
      // literal `${folderPath}` substrings (we already shipped that bug once).
      expect(prompt).toContain(`${FOLDER}/open-design.json`);
      expect(prompt).not.toContain('${folderPath}');
    });

    it('ends by handing the PR URL back to chat', () => {
      expect(prompt).toMatch(/PR URL|pull\/new|paste it into chat/);
    });
  });
});
