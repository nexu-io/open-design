// Static data for the hand-off menu: the CLI fallback catalogue (shown before
// the daemon's `/api/agents` probe resolves, and merged with it after), the
// framework picker options, and small UI constants shared across the slice.
import type { CliTarget, FrameworkTarget } from './types';

export const AMR_WEBSITE_URL = 'https://open-design.ai/amr';
export const PROJECT_PATH_COPY_ID = 'project-path';

export const FRAMEWORKS: FrameworkTarget[] = [
  { id: 'react' },
  { id: 'vue' },
  { id: 'svelte' },
  { id: 'solid' },
  { id: 'next' },
  { id: 'vanilla' },
];

export const DEFAULT_FRAMEWORK: FrameworkTarget = FRAMEWORKS[0] ?? {
  id: 'react',
};

/** Display + sort order for CLI targets; anything not listed sorts after by
 * alphabetical display name. */
export const CLI_ORDER = [
  'amr',
  'claude',
  'codex',
  'opencode',
  'cursor-agent',
  'gemini',
  'qwen',
  'qoder',
  'copilot',
  'grok-build',
  'deepseek',
  'kimi',
  'hermes',
  'devin',
  'kiro',
  'kilo',
  'vibe',
  'antigravity',
  'aider',
  'trae-cli',
  'pi',
  'reasonix',
];

/** Shown until the daemon's `/api/agents` probe resolves (or for any id it
 * never reports), so the CLI tab is never blank. */
export const FALLBACK_CLI_TARGETS: CliTarget[] = [
  { id: 'amr', name: 'Open Design', bin: 'vela', available: false },
  { id: 'claude', name: 'Claude Code', bin: 'claude', available: false },
  { id: 'codex', name: 'Codex CLI', bin: 'codex', available: false },
  { id: 'opencode', name: 'OpenCode', bin: 'opencode-cli', available: false },
  { id: 'cursor-agent', name: 'Cursor Agent', bin: 'cursor-agent', available: false },
  { id: 'qwen', name: 'Qwen Code', bin: 'qwen', available: false },
  { id: 'qoder', name: 'Qoder CLI', bin: 'qodercli', available: false },
  { id: 'copilot', name: 'GitHub Copilot CLI', bin: 'copilot', available: false },
  { id: 'grok-build', name: 'Grok Build', bin: 'grok', available: false },
  { id: 'deepseek', name: 'DeepSeek TUI', bin: 'deepseek', available: false },
  { id: 'kimi', name: 'Kimi CLI', bin: 'kimi', available: false },
  { id: 'hermes', name: 'Hermes', bin: 'hermes', available: false },
  { id: 'devin', name: 'Devin for Terminal', bin: 'devin', available: false },
  { id: 'kiro', name: 'Kiro CLI', bin: 'kiro-cli', available: false },
  { id: 'kilo', name: 'Kilo', bin: 'kilo', available: false },
  { id: 'vibe', name: 'Mistral Vibe CLI', bin: 'vibe-acp', available: false },
  { id: 'antigravity', name: 'Antigravity', bin: 'agy', available: false },
  { id: 'aider', name: 'Aider', bin: 'aider', available: false },
  { id: 'trae-cli', name: 'Trae CLI', bin: 'traecli', available: false },
  { id: 'pi', name: 'Pi', bin: 'pi', available: false },
  { id: 'reasonix', name: 'DeepSeek Reasonix', bin: 'reasonix', available: false },
];
