/**
 * Sanitizes status detail strings to prevent raw executable paths
 * from leaking into the user-facing UI.
 *
 * Detects filesystem paths and replaces them with user-friendly labels,
 * or suppresses them entirely if they're unrecognized.
 *
 * Example:
 * Input:  "/Applications/Open Design Beta.app/.../bin/vela"
 * Output: "Live Artifact"
 *
 * Example:
 * Input:  "Starting Live Artifact..."
 * Output: "Starting Live Artifact..." (unchanged)
 */

/**
 * Known agent executable names mapped to user-friendly labels.
 */
const KNOWN_AGENT_LABELS: Record<string, string> = {
  vela: 'Live Artifact',
  'claude-code': 'Claude Code',
  codex: 'Codex',
  devin: 'Devin',
  'gemini-cli': 'Gemini',
  opencode: 'OpenCode',
  'cursor-agent': 'Cursor Agent',
  qwen: 'Qwen',
  qoder: 'Qoder',
  copilot: 'Copilot',
  hermes: 'Hermes',
  kimi: 'Kimi',
  pi: 'Pi',
  kiro: 'Kiro',
  kilo: 'Kilo',
  'mistral-vibe': 'Mistral Vibe',
  deepseek: 'DeepSeek',
};

/**
 * Patterns that indicate a string contains a raw filesystem/executable path
 * rather than a user-friendly status message.
 */
const PATH_PATTERNS = [
  /^(\/|[A-Z]:\\)/,  // Unix or Windows absolute path
  /\/bin\//,         // Unix bin directory
  /\\bin\\/,         // Windows bin directory
  /\.app\/Contents/, // macOS app bundle path
  /\.asar/,          // Electron app archive
];

/**
 * Check if a string appears to be a raw filesystem path.
 */
function isFilePath(detail: string): boolean {
  return PATH_PATTERNS.some((pattern) => pattern.test(detail));
}

/**
 * Extract a known agent label from a filesystem path.
 * If the path contains a recognized agent executable name, return its label.
 * Otherwise, return undefined.
 *
 * Example: "/Applications/.../bin/vela" → "Live Artifact"
 * Example: "/usr/local/bin/unknown-agent" → undefined
 */
function extractKnownAgentLabel(detail: string): string | undefined {
  const normalizedDetail = detail.toLowerCase();

  for (const [agentKey, agentLabel] of Object.entries(KNOWN_AGENT_LABELS)) {
    if (normalizedDetail.includes(agentKey.toLowerCase())) {
      return agentLabel;
    }
  }

  return undefined;
}

/**
 * Sanitize a status detail string for safe display in the user-facing UI.
 *
 * If the detail is a raw filesystem path:
 * - Try to extract a known agent label (return the label)
 * - If unknown, suppress it entirely (return undefined)
 *
 * If the detail is normal human-readable text, return it unchanged.
 *
 * @param detail - The raw status detail from the daemon
 * @returns Safe sanitized detail, or undefined if it should be suppressed
 */
export function sanitizeStatusDetail(
  detail: string | undefined
): string | undefined {
  if (!detail) return detail;

  // Check if this looks like a raw filesystem path
  if (isFilePath(detail)) {
    // Try to find a known agent label
    const knownLabel = extractKnownAgentLabel(detail);
    if (knownLabel) {
      return knownLabel;
    }

    // Unknown executable path: suppress entirely
    return undefined;
  }

  // Normal status text: return unchanged
  return detail;
}
