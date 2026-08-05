export interface GithubRepository {
  owner: string;
  name: string;
  fullName: string;
  url: string;
}

export interface CommandOutput {
  stdout?: unknown;
  stderr?: unknown;
}

export function parseGithubRepoUrl(raw: unknown): GithubRepository | null {
  if (typeof raw !== 'string' || !raw) return null;
  const trimmed = raw.trim().replace(/\.git$/i, '');
  let owner = '';
  let name = '';
  try {
    const url = new URL(trimmed);
    if (!/^github\.com$/i.test(url.hostname)) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    owner = parts[0] ?? '';
    name = parts[1] ?? '';
  } catch {
    const match = /^([^/\s]+)\/([^/\s]+)$/.exec(trimmed);
    if (!match) return null;
    owner = match[1] ?? '';
    name = match[2] ?? '';
  }
  if (!owner || !name) return null;
  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
}

export function isPlaceholderRepoOwner(owner: unknown): boolean {
  return /^(open-design-user|<vendor>|vendor|example-user|your-org|your-username|owner|user|username)$/i
    .test(String(owner ?? '').trim());
}

export function isRepoNotFound(result: CommandOutput | null | undefined): boolean {
  const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  return /could not resolve to a repository|not found|repository not found/i.test(text);
}

export function parseGhAuthStatusLogin(output: unknown): string {
  const text = String(output ?? '');
  const activeAccount = /Logged in to [^\s]+ account ([^\s()]+)/i.exec(text);
  if (activeAccount?.[1]) return activeAccount[1].trim();
  const tokenAccount = /Token account:\s*([^\s()]+)/i.exec(text);
  if (tokenAccount?.[1]) return tokenAccount[1].trim();
  return '';
}

export function isGhApiRateLimit(result: CommandOutput | null | undefined): boolean {
  const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  return /rate limit exceeded|authenticated requests get a higher rate limit/i.test(text);
}
