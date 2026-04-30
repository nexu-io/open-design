const AGENT_LABELS: Record<string, string> = {
  claude: 'Claude',
  codex: 'Codex',
  gemini: 'Gemini',
  opencode: 'OpenCode',
  'cursor-agent': 'Cursor',
  cursor: 'Cursor',
  qwen: 'Qwen',
  copilot: 'Copilot',
};

const AGENT_ALIASES: Record<string, string> = {
  'claude code': 'claude',
  'codex cli': 'codex',
  'gemini cli': 'gemini',
  'cursor agent': 'cursor-agent',
  'qwen code': 'qwen',
  'github copilot cli': 'copilot',
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

function normalizeKey(raw: string): string {
  const basename = raw.trim().split(/[\\/]/).pop() ?? raw.trim();
  return basename
    .replace(/\.(cmd|exe|bat)$/i, '')
    .replace(/\s+/g, ' ')
    .toLowerCase();
}
