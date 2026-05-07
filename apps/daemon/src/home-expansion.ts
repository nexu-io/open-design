/**
 * Shared shorthand-expander for env-supplied directory paths. Both
 * resolveDataDir (server.ts, drives OD_DATA_DIR) and resolveOverrideDir
 * (media-config.ts, drives OD_MEDIA_CONFIG_DIR + the OD_DATA_DIR fallback)
 * use this so the two resolvers cannot split state — a launcher passing
 * $HOME/.open-design lands every daemon write at the same expanded path.
 *
 * Recognized shorthands (case-sensitive):
 *   '~'        | '~/...'   | '~\\...'
 *   '$HOME'    | '$HOME/...' | '$HOME\\...'
 *   '${HOME}'  | '${HOME}/...' | '${HOME}\\...'
 *
 * Anything else (absolute paths, plain relative paths, $OTHER variables) is
 * returned unchanged. Both forward and back slashes are accepted in the
 * prefix so a Windows launcher passing $HOME\.open-design behaves the same
 * as a Unix launcher passing $HOME/.open-design; the result is rebuilt via
 * path.join so the platform separator is correct in the output regardless
 * of which the input used.
 */
import os from 'node:os';
import path from 'node:path';

const HOME_BARE_TOKENS = new Set(['~', '$HOME', '${HOME}']);
const HOME_PREFIX_RE = /^(~|\$\{HOME\}|\$HOME)[/\\](.*)$/;

export function expandHomePrefix(raw: string): string {
  const home = os.homedir();
  if (HOME_BARE_TOKENS.has(raw)) return home;
  const match = HOME_PREFIX_RE.exec(raw);
  if (match) return path.join(home, match[2] ?? '');
  return raw;
}
