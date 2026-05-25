const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  devin: 'Devin',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  'cursor-agent': 'Cursor',
  cursor: 'Cursor',
  qwen: 'Qwen',
  qoder: 'Qoder',
  copilot: 'Copilot',
  deepseek: 'DeepSeek',
  'anthropic-api': 'Anthropic API',
  'openai-api': 'OpenAI API',
  'azure-openai-api': 'Azure OpenAI',
  'google-gemini-api': 'Google Gemini',
};

const AGENT_ALIASES: Record<string, string> = {
  'claude code': 'claude',
  'codex cli': 'codex',
  'devin for terminal': 'devin',
  'gemini cli': 'gemini',
  'cursor agent': 'cursor-agent',
  'qwen code': 'qwen',
  'qoder cli': 'qoder',
  'qodercli': 'qoder',
  'github copilot cli': 'copilot',
  'deepseek tui': 'deepseek',
  'deepseek-tui': 'deepseek',
};

export function agentDisplayName(
  agentId?: string | null,
  fallbackName?: string | null,
): string | null {
  for (const raw of [agentId, fallbackName]) {
    const known = knownAgentLabel(raw);
    if (known) return known;
  }
  for (const raw of [fallbackName, agentId]) {
    const fallback = safeFallbackLabel(raw);
    if (fallback) return fallback;
  }
  return null;
}

export function exactAgentDisplayName(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalizeKey(raw);
  const alias = AGENT_ALIASES[key] ?? key;
  return AGENT_LABELS[alias] ?? null;
}

export function agentModelDisplayName(
  agentId?: string | null,
  fallbackName?: string | null,
  model?: string | null,
): string | undefined {
  const label = agentDisplayName(agentId, fallbackName) ?? undefined;
  const modelId = displayableModelId(model);
  if (!modelId) return label;
  return label ? `${label} · ${modelId}` : modelId;
}

function knownAgentLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const key = normalizeKey(raw);
  const alias = AGENT_ALIASES[key] ?? key;
  const direct = AGENT_LABELS[alias];
  if (direct) return direct;
  if (key.includes('cursor-agent')) return 'Cursor';
  if (key.includes('copilot')) return 'Copilot';
  for (const [agentId, label] of Object.entries(AGENT_LABELS)) {
    if (key.includes(agentId)) return label;
  }
  return null;
}

function safeFallbackLabel(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const trimmed = raw.trim();
  if (!trimmed || trimmed.includes('/') || trimmed.includes('\\')) return null;
  return trimmed;
}

function displayableModelId(raw: string | null | undefined): string | null {
  const trimmed = raw?.trim();
  if (!trimmed || trimmed === 'default') return null;
  return trimmed;
}

function normalizeKey(raw: string): string {
  const basename = raw.trim().split(/[\\/]/).pop() ?? raw.trim();
  return basename
    .replace(/\.(cmd|exe|bat)$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}

// Visible-status invariant for the chat waiting pill (issue #2874): the
// daemon's start-event payload carries `bin` (the resolved agent executable
// path) which gets persisted as `detail` on the `starting` status event.
// Packaged-app paths like
//   /Applications/Open Design Beta.app/Contents/Resources/open-design/bin/vela
// leak the install root and (on custom installs) the user's home directory.
// Replace the path with the known agent display name when we can recognize it,
// otherwise drop the detail and let the localized status label speak.
//
// Scoped to the `starting` label on purpose: other labels (error, audit, ...)
// legitimately carry user-readable detail strings that may themselves
// reference paths, and over-redacting would hide actionable error context.
export function friendlyStatusDetail(
  label: string,
  detail: string | null | undefined,
): string | undefined {
  const trimmed = detail?.trim();
  if (!trimmed) return undefined;
  if (label !== 'starting') return trimmed;
  if (!looksLikeFilesystemPath(trimmed)) return trimmed;
  return agentDisplayName(trimmed) ?? undefined;
}

function looksLikeFilesystemPath(value: string): boolean {
  // POSIX absolute, home-relative, parent-relative, current-relative, or
  // Windows-drive paths. Any embedded path separator also qualifies — the
  // intent is "this string is talking about a file on disk, not a label."
  return /^([/~]|\.\.?[\\/]|[A-Za-z]:[\\/])/.test(value) || value.includes('/') || value.includes('\\');
}
