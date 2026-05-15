import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

export interface ShellEnvResult {
  file: string;
  /** true = existing export line was updated; false = new line appended */
  updated: boolean;
}

function candidateProfiles(): string[] {
  const home = os.homedir();
  if (process.platform === 'win32') {
    return [
      path.join(
        home,
        'Documents',
        'WindowsPowerShell',
        'Microsoft.PowerShell_profile.ps1',
      ),
    ];
  }
  const shell = process.env.SHELL ?? '';
  if (shell.includes('zsh')) {
    return [path.join(home, '.zshrc'), path.join(home, '.zprofile')];
  }
  if (shell.includes('fish')) {
    return [path.join(home, '.config', 'fish', 'config.fish')];
  }
  return [
    path.join(home, '.bashrc'),
    path.join(home, '.bash_profile'),
    path.join(home, '.profile'),
  ];
}

/**
 * Write or update `export NAME="value"` in the user's primary shell profile.
 *
 * Selects the first existing candidate file; falls back to the first candidate
 * (creating it) when none exist. Safe to call concurrently — last write wins
 * for the same key, but distinct keys don't race destructively.
 */
export async function setShellEnvVar(
  name: string,
  value: string,
): Promise<ShellEnvResult> {
  const candidates = candidateProfiles();
  let target = candidates[0]!;
  for (const f of candidates) {
    try {
      await fs.access(f);
      target = f;
      break;
    } catch {
      // not found — keep trying
    }
  }

  let content = '';
  try {
    content = await fs.readFile(target, 'utf8');
  } catch {
    // file doesn't exist yet; will create
  }

  const isPwsh = process.platform === 'win32';
  const exportLine = isPwsh
    ? `$Env:${name} = "${value}"`
    : `export ${name}="${value}"`;
  const pattern = isPwsh
    ? new RegExp(`^\\$Env:${name}\\s*=.*$`, 'm')
    : new RegExp(`^export ${name}=.*$`, 'm');

  let updated = false;
  if (pattern.test(content)) {
    content = content.replace(pattern, exportLine);
    updated = true;
  } else {
    const sep = content.length > 0 && !content.endsWith('\n') ? '\n' : '';
    content += `${sep}\n# Added by Open Design\n${exportLine}\n`;
  }

  const dir = path.dirname(target);
  await fs.mkdir(dir, { recursive: true });
  const tmp = path.join(dir, `.od-shell-env-${process.pid}.tmp`);
  await fs.writeFile(tmp, content, 'utf8');
  await fs.rename(tmp, target);
  return { file: target, updated };
}
