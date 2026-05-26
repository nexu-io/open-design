import { redactSecrets } from './redact.js';

const SPAWN_ERRNO =
  /\bspawn\s+.+(?=\s+(?:ENOENT|EACCES|EPERM|EINVAL|ETIMEDOUT)\b)/i;

const UNIX_ABSOLUTE_PATH =
  /\/(?:Users|home|var|tmp|Applications|opt|usr|private)\/[^\s'",\]]+/g;

const WINDOWS_ABSOLUTE_PATH =
  /[A-Za-z]:\\(?:[^\\s'",\]]+\\)*[^\\s'",\]]+/g;

const NODE_MODULES_PATH = /\bnode_modules\/[^\s'",\]]+/g;

const SCOPED_PACKAGE_PATH = /\B@[^/\s'",\]]+\/[^\s'",\]]+/g;

/**
 * Strip filesystem paths from agent spawn / execution errors before they
 * reach the web UI (issue #2161, complements #2874).
 */
export function sanitizeAgentErrorDetail(message: string): string {
  let out = redactSecrets(String(message ?? ''));
  out = out.replace(/,?\s*spawnargs:\s*\[[\s\S]*?\]\s*$/i, '');
  out = out.replace(SPAWN_ERRNO, 'spawn [path]');
  out = out.replace(UNIX_ABSOLUTE_PATH, '[path]');
  out = out.replace(WINDOWS_ABSOLUTE_PATH, '[path]');
  out = out.replace(NODE_MODULES_PATH, '[package-path]');
  out = out.replace(SCOPED_PACKAGE_PATH, '[package-path]');
  return out.replace(/\s+/g, ' ').trim();
}
