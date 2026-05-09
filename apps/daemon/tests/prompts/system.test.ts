import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

import { composeSystemPrompt } from '../../src/prompts/system.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, '../../../..');
const liveArtifactRoot = path.join(repoRoot, 'skills/live-artifact');
const liveArtifactSkillPath = path.join(repoRoot, 'skills/live-artifact/SKILL.md');
const liveArtifactSkillMarkdown = readFileSync(liveArtifactSkillPath, 'utf8');
const liveArtifactSkillBody = [
  `> **Skill root (absolute):** \`${liveArtifactRoot}\``,
  '>',
  '> This skill ships side files alongside `SKILL.md`. When the workflow',
  '> below references side files such as `references/artifact-schema.md`, resolve',
  '> them against the skill root above and open them via their full absolute path.',
  '>',
  '> Known side files in this skill: `references/artifact-schema.md`, `references/connector-policy.md`, `references/refresh-contract.md`.',
  '',
  '',
  liveArtifactSkillMarkdown.replace(/^---[\s\S]*?---\n\n/, '').trim(),
].join('\n');

describe('composeSystemPrompt', () => {
  it('injects live-artifact skill guidance and metadata intent', () => {
    const prompt = composeSystemPrompt({
      skillName: 'live-artifact',
      skillMode: 'prototype',
      skillBody: liveArtifactSkillBody,
      metadata: {
        kind: 'prototype',
        intent: 'live-artifact',
      } as any,
    });

    expect(prompt).toContain('## Active skill — live-artifact');
    expect(prompt).toContain(`> **Skill root (absolute):** \`${liveArtifactRoot}\``);
    expect(prompt).not.toContain('**Pre-flight (do this before any other tool):** Read `assets/template.html`');
    expect(prompt).not.toContain('live-artifact/references/layouts.md');
    expect(prompt).not.toContain('live-artifact/assets/template.html');
    expect(prompt).toContain('`references/artifact-schema.md`');
    expect(prompt).toContain('`references/connector-policy.md`');
    expect(prompt).toContain('`references/refresh-contract.md`');
    expect(prompt).toContain('The wrapper reads injected `OD_NODE_BIN`, `OD_BIN`, `OD_DAEMON_URL`, and `OD_TOOL_TOKEN`');
    expect(prompt).toContain('Do not include or invent `projectId`; the daemon derives project/run scope from the token.');
    expect(prompt).toContain('"$OD_NODE_BIN" "$OD_BIN" tools live-artifacts create --input artifact.json');
    expect(prompt).toContain('if the user names a connector/source (for example Notion)');
    expect(prompt).toContain('list connectors before asking where the data comes from');
    expect(prompt).toContain('a connected `notion` connector plus a user brief that names Notion is enough to start with `notion.notion_search`');
    expect(prompt).toContain('Prefer the `live-artifact` skill workflow when available');
    expect(prompt).toContain('The first output should be a live artifact/dashboard/report');
  });

  describe('connectedExternalMcp directive', () => {
    it('omits the directive when no servers are passed', () => {
      const prompt = composeSystemPrompt({});
      expect(prompt).not.toContain('External MCP servers — already authenticated');
      expect(prompt).not.toContain('mcp__<server>__authenticate');
    });

    it('omits the directive when an empty array is passed', () => {
      const prompt = composeSystemPrompt({ connectedExternalMcp: [] });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('lists each connected server and forbids the synthetic auth tools', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: 'higgsfield-openclaw', label: 'Higgsfield (OpenClaw)' },
          { id: 'github' },
        ],
      });

      expect(prompt).toContain('## External MCP servers — already authenticated');
      expect(prompt).toContain('`higgsfield-openclaw`');
      expect(prompt).toContain('Higgsfield (OpenClaw)');
      expect(prompt).toContain('`github`');
      expect(prompt).toContain(
        '**Do NOT call any tool whose name matches `mcp__<server>__authenticate` or `mcp__<server>__complete_authentication`',
      );
      expect(prompt).toContain('localhost:<random>/callback');
      expect(prompt).toContain('Settings → External MCP');
    });

    it('skips entries with blank ids and emits no directive when nothing usable remains', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [
          { id: '   ', label: 'blank' },
          { id: '', label: 'empty' },
        ] as any,
      });
      expect(prompt).not.toContain('External MCP servers — already authenticated');
    });

    it('does not duplicate the label when it equals the id', () => {
      const prompt = composeSystemPrompt({
        connectedExternalMcp: [{ id: 'github', label: 'github' }],
      });
      expect(prompt).toContain('- `github`\n');
      expect(prompt).not.toContain('- `github` (github)');
    });
  });
});
