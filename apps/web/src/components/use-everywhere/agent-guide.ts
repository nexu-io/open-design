// Pure builder for the "Copy guide for an agent" markdown blob.
//
// The blob is the headline payoff of the Use Everywhere modal: paste it
// into Claude Code, Codex, Cursor, openclaw, or hermes and the agent has
// everything it needs to install Open Design, expose it as MCP, and
// drive it from CLI / HTTP without further hand-holding.
//
// Kept side-effect-free so the unit test can assert the shape (sections
// present, snippets fenced correctly, daemon URL substituted) without
// rendering React.

import { GUIDE_SECTIONS, type CodeSnippet, type GuideSection } from './sections';

export interface AgentGuideOptions {
  /** Live daemon URL detected at modal-open time. Defaults to the documented port. */
  daemonUrl?: string;
  /**
   * Optional `od` binary path / hint. When provided we mention it in the
   * setup checklist so the agent knows whether to run `od …` directly or
   * spawn the packaged binary.
   */
  cliHint?: string;
  /** Optional Open Design version/channel; surfaced in the header for support tickets. */
  versionHint?: string;
}

const DEFAULT_DAEMON_URL = 'http://127.0.0.1:7456';

export function buildAgentGuideMarkdown(options: AgentGuideOptions = {}): string {
  const daemonUrl = (options.daemonUrl ?? DEFAULT_DAEMON_URL).replace(/\/$/, '');
  const lines: string[] = [];

  lines.push('# Open Design — agent setup guide');
  lines.push('');
  lines.push(
    'You are a coding agent (Claude Code, Codex, Cursor, openclaw, hermes, or similar). ' +
      'The user wants Open Design wired into your workflow. Open Design is a local ' +
      'privileged daemon (`od`) plus a Skills + Design-Systems registry that exposes ' +
      'four interchangeable surfaces: CLI, HTTP API, MCP, and Skills.',
  );
  lines.push('');
  lines.push('Follow the setup checklist, then keep the reference sections handy.');
  if (options.versionHint) {
    lines.push('');
    lines.push(`> Reported Open Design version: \`${options.versionHint}\``);
  }
  lines.push('');

  lines.push('## Setup checklist');
  lines.push('');
  lines.push('1. Confirm the daemon is reachable:');
  lines.push('');
  lines.push('   ```bash');
  lines.push(`   curl -s ${daemonUrl}/api/health | jq`);
  lines.push('   ```');
  lines.push('');
  lines.push('   If it 404s or times out, ask the user to run `pnpm tools-dev` (dev) or open the Open Design app (packaged).');
  lines.push('');
  lines.push('2. Detect available agent CLIs and confirm `od` is on PATH:');
  lines.push('');
  lines.push('   ```bash');
  lines.push('   od doctor');
  lines.push('   od status --json');
  lines.push('   ```');
  if (options.cliHint) {
    lines.push('');
    lines.push(`   The user reported \`od\` at: \`${options.cliHint}\``);
  }
  lines.push('');
  lines.push('3. Pull the MCP install snippet (use it instead of hand-writing `mcpServers` config):');
  lines.push('');
  lines.push('   ```bash');
  lines.push(`   curl -s ${daemonUrl}/api/mcp/install-info | jq`);
  lines.push('   ```');
  lines.push('');
  lines.push(
    '4. Persist the MCP server config in your client (e.g. `~/.cursor/mcp.json`, ' +
      '`~/.config/claude-code/config.json`, your own agent runner). The snippet ' +
      "from step 3 already includes the right `command`, `args`, and `env`.",
  );
  lines.push('');
  lines.push('5. Verify the integration end-to-end:');
  lines.push('');
  lines.push('   ```bash');
  lines.push(`   curl -s ${daemonUrl}/api/skills | jq '.skills | length'`);
  lines.push('   od skills list --json');
  lines.push('   ```');
  lines.push('');

  for (const section of GUIDE_SECTIONS) {
    lines.push(...renderSection(section, daemonUrl));
  }

  lines.push('## Reference URLs');
  lines.push('');
  lines.push(`- Daemon: \`${daemonUrl}\``);
  lines.push(`- Health: \`${daemonUrl}/api/health\``);
  lines.push(`- MCP install info: \`${daemonUrl}/api/mcp/install-info\``);
  lines.push(`- Skills: \`${daemonUrl}/api/skills\``);
  lines.push(`- Design systems: \`${daemonUrl}/api/design-systems\``);
  lines.push(`- Projects: \`${daemonUrl}/api/projects\``);
  lines.push('');
  lines.push(
    '> When in doubt, prefer the HTTP API for stateless reads, the MCP server for ' +
      'agent-driven tool calls, and the CLI for shell automation or CI.',
  );
  lines.push('');

  return lines.join('\n');
}

function renderSection(section: GuideSection, daemonUrl: string): string[] {
  const lines: string[] = [];
  lines.push(`## ${substituteDaemonUrl(section.heading, daemonUrl)}`);
  lines.push('');
  lines.push(substituteDaemonUrl(section.intro, daemonUrl));
  lines.push('');
  if (section.bullets.length > 0) {
    for (const bullet of section.bullets) {
      lines.push(`- ${substituteDaemonUrl(bullet, daemonUrl)}`);
    }
    lines.push('');
  }
  for (const snippet of section.snippets) {
    lines.push(...renderSnippet(snippet, daemonUrl));
  }
  if (section.footer) {
    lines.push(`> ${substituteDaemonUrl(section.footer, daemonUrl)}`);
    lines.push('');
  }
  return lines;
}

function renderSnippet(snippet: CodeSnippet, daemonUrl: string): string[] {
  const lines: string[] = [];
  lines.push(`### ${substituteDaemonUrl(snippet.label, daemonUrl)}`);
  lines.push('');
  lines.push('```' + snippet.language);
  lines.push(substituteDaemonUrl(snippet.body, daemonUrl));
  lines.push('```');
  lines.push('');
  return lines;
}

function substituteDaemonUrl(body: string, daemonUrl: string): string {
  return body.replace(/http:\/\/127\.0\.0\.1:7456/g, daemonUrl);
}
