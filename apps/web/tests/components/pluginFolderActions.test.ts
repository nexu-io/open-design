// Contract test for the prompts the plugin-folder card buttons send to the
// agent. `install` uses the simple shared template; `contribute` drives the
// `gh repo fork → branch → commit → gh pr create --web` flow against
// `nexu-io/open-design`; `publish` drives `gh repo create / push` against the
// author's own `plugin.repo` URL. The tests below lock the *shape* of each
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

  describe('publish (repo-publish flow)', () => {
    const prompt = buildPluginFolderAgentActionPrompt(FOLDER, 'publish');

    it('targets the author\'s plugin.repo, not the registry catalog', () => {
      expect(prompt).toContain(`Plugin folder: \`${FOLDER}\``);
      expect(prompt).toContain('plugin.repo');
      expect(prompt).toMatch(/<owner>\/<name>/);
      expect(prompt).toMatch(/repository-publish flow|repo URL|published code/i);
    });

    it('drives the full publish flow via gh + git', () => {
      // The agent must drive raw gh/git commands so an actual public repo
      // exists at the end of the turn. Regression guard for issue #2332,
      // where the previous prompt let the agent fall back to `od plugin
      // publish --to open-design` and never created the target repo.
      expect(prompt).toContain('gh --version');
      expect(prompt).toContain('gh auth status');
      expect(prompt).toContain('gh repo view <owner>/<name>');
      expect(prompt).toContain('gh repo create <owner>/<name> --public --source . --push');
      expect(prompt).toContain('git push --tags');
    });

    it('handles both new-repo and existing-repo paths', () => {
      // 404 → create + push; 200 → push to existing remote. Both branches
      // must exist or the agent will silently skip one case.
      expect(prompt).toMatch(/Could not resolve to a Repository|repo does not exist/i);
      expect(prompt).toMatch(/repo exists/i);
      expect(prompt).toMatch(/Create \+ push|Push to existing repo/i);
    });

    it('bans the registry-submission CLI explicitly', () => {
      // The legacy CLI is what shipped the bug — without an explicit ban
      // the agent had been routing back to it. The mention must be in a
      // negative imperative ("Do NOT call …"), not a recommendation.
      expect(prompt).toMatch(
        /Do NOT (call|route through) `?od plugin publish --to open-design`?/i,
      );
      expect(prompt).toMatch(
        /registry[- ]submission|registry-submission flow|Open Design PR/i,
      );
    });

    it('hard-bans AskUserQuestion + auto-install + force-push + retry', () => {
      expect(prompt).toContain('AskUserQuestion');
      expect(prompt).toMatch(/fire-and-forget|do not call the `AskUserQuestion`/i);
      expect(prompt).toMatch(/do not try to install/i);
      expect(prompt).toMatch(/do not force-push|--force/i);
      expect(prompt).toMatch(/do not retry/i);
    });

    it('treats invalid/expired tokens the same as not-logged-in', () => {
      // Issue #2332 showed the agent attempting the publish even after `gh
      // auth status` reported "token for shangxinyu1 is invalid". The
      // prompt now treats that case as a hard stop instead of a soft warn.
      expect(prompt).toMatch(/invalid\/expired token|invalid token/i);
      expect(prompt).toMatch(/STOP/);
    });

    it('interpolates the actual folder path into manifest and cd steps', () => {
      // Sanity check that template-string interpolation didn't regress into
      // literal `${folderPath}` substrings.
      expect(prompt).toContain(`${FOLDER}/open-design.json`);
      expect(prompt).toContain(`cd ${FOLDER}`);
      expect(prompt).not.toContain('${folderPath}');
    });

    it('ends by handing the repo URL back to chat', () => {
      expect(prompt).toMatch(/Paste the resolved `?https:\/\/github\.com\/<owner>\/<name>`? URL into chat/i);
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

    it('warns the agent against assuming standalone jq is installed', () => {
      // QA hit this: agent ran `jq '{name,title,...}' generated-plugin/open-design.json`
      // at step 2 and stopped with `zsh:1: command not found: jq` before
      // even reaching the fork step. The prompt now lists portable
      // alternatives (Read / cat / node -e) and bans the assumption.
      expect(prompt).toMatch(/Do not assume the standalone `jq` binary is installed/);
      expect(prompt).toMatch(/cat .*open-design\.json/);
      expect(prompt).toMatch(/node -e/);
    });
  });

  describe('jq guidance shared between contribute and publish', () => {
    it('disambiguates standalone jq from gh\'s built-in --jq flag', () => {
      // gh ships its own jq library, so `gh ... --jq` is fine — that's
      // what RULE step "Resolve author identity" uses. The ban must
      // single out the brew-installed standalone binary, otherwise the
      // agent will read the ban literally and stop using gh's flag too.
      const contributePrompt = buildPluginFolderAgentActionPrompt(FOLDER, 'contribute');
      const publishPrompt = buildPluginFolderAgentActionPrompt(FOLDER, 'publish');
      for (const prompt of [contributePrompt, publishPrompt]) {
        expect(prompt).toMatch(/--jq` flag bundled with gh|gh ships its own embedded library|gh \.\.\. --jq` is fine/i);
      }
    });
  });
});
