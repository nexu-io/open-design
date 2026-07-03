// @ts-nocheck
/**
 * @module cli/plugin/github
 */
export async function execFileBuffered(command, args, opts = {}) {
  const { execFile } = await import('node:child_process');
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
      ...opts,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code,
        stdout: String(stdout ?? '').trim(),
        stderr: String(stderr ?? '').trim(),
        error,
      });
    });
  });
}

function quotePosixShellArg(value) {
  const text = String(value ?? '');
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

function buildGhShellCommand(args) {
  return ['gh', ...args].map(quotePosixShellArg).join(' ');
}

function buildLoginShellCommand(innerCommand) {
  return `export PATH=${quotePosixShellArg(process.env.PATH ?? '')}; ${innerCommand}`;
}

export async function execGhBuffered(args, opts = {}) {
  if (process.platform === 'win32') return execFileBuffered('gh', args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
    ...opts,
  });
}

export async function spawnPassthrough(command, args, opts = {}) {
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', ...opts });
    child.on('error', (error) => resolve({ code: 1, error }));
    child.on('close', (code) => resolve({ code }));
  });
}

export async function spawnGhPassthrough(args) {
  if (process.platform === 'win32') return spawnPassthrough('gh', args);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return spawnPassthrough(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
  });
}

export function inferGithubHost(target) {
  if (!target || target === 'github.com') return 'github.com';
  try {
    const parsed = new URL(target);
    return parsed.hostname || 'github.com';
  } catch {
    // Marketplace ids are not URLs; v1 GitHub-backed auth defaults to github.com.
    return 'github.com';
  }
}

export async function resolvePluginGithubTarget({ host = 'github.com', owner, manifest, purpose }) {
  const version = await execGhBuffered(['--version'], { timeout: 10_000 });
  if (!version.ok) {
    console.error('[plugin github] GitHub CLI is required. Install gh from https://cli.github.com/ and retry.');
    process.exit(1);
  }
  let status = await execGhBuffered(['auth', 'status', '--hostname', host, '--active'], { timeout: 10_000 });
  if (!status.ok && /unknown flag: --active/i.test(`${status.stdout}\n${status.stderr}`)) {
    status = await execGhBuffered(['auth', 'status', '--hostname', host], { timeout: 10_000 });
  }
  if (!status.ok) {
    console.error(`[plugin github] gh is not authenticated for ${host}.`);
    if (status.stderr || status.stdout) console.error(status.stderr || status.stdout);
    console.error('Run: gh auth login -h github.com -s repo,workflow');
    process.exit(1);
  }
  const manifestRepo = parseGithubRepoUrl(typeof manifest?.plugin?.repo === 'string' ? manifest.plugin.repo.trim() : '');
  const trustedManifestOwner = purpose === 'publish-repo' && manifestRepo && !isPlaceholderRepoOwner(manifestRepo.owner) ? manifestRepo.owner : '';
  const explicitOwner = typeof owner === 'string' ? owner.trim() : '';
  if (explicitOwner && isPlaceholderRepoOwner(explicitOwner)) {
    console.error(`[plugin github] refusing placeholder owner "${explicitOwner}". Pass a real GitHub login or org.`);
    process.exit(2);
  }
  const statusLogin = parseGhAuthStatusLogin(status.stderr || status.stdout);
  let login = statusLogin;
  let resolvedOwner = explicitOwner || trustedManifestOwner || statusLogin;
  let source = explicitOwner ? '--owner' : trustedManifestOwner ? 'plugin.repo' : statusLogin ? 'gh auth status' : '';
  let apiError = null;
  if (!resolvedOwner || !login) {
    const user = await execGhBuffered(['api', 'user', '--hostname', host, '--jq', '.login'], { timeout: 20_000 });
    if (user.ok && user.stdout.trim()) {
      login = user.stdout.trim();
      if (!resolvedOwner) {
        resolvedOwner = login;
        source = 'gh api user';
      }
    } else {
      apiError = user;
    }
  }
  if (!resolvedOwner) {
    console.error(`[plugin github] could not resolve the GitHub owner for ${purpose}.`);
    if (apiError?.stderr || apiError?.stdout) console.error(apiError.stderr || apiError.stdout);
    if (apiError && isGhApiRateLimit(apiError)) {
      const ownerHint = purpose === 'open-design-pr' ? '<github-login-or-fork-owner>' : '<github-login-or-org>';
      console.error(`GitHub API is rate limited. Re-run with --owner ${ownerHint}, or authenticate/refresh gh and retry.`);
    } else {
      console.error('Run: gh auth refresh -h github.com -s repo,workflow');
      console.error('Or:  gh auth login -h github.com -s repo,workflow');
      console.error(purpose === 'open-design-pr'
        ? 'If the fork owner differs from your auth login, pass --owner <github-login-or-fork-owner>.'
        : 'If this is an org-owned plugin, pass --owner <github-org>.');
    }
    process.exit(1);
  }
  if (apiError && isGhApiRateLimit(apiError)) {
    console.warn('[plugin github] GitHub API is rate limited; continuing with the owner resolved locally.');
  }
  if (isPlaceholderRepoOwner(resolvedOwner)) {
    console.error(`[plugin github] refusing placeholder owner "${resolvedOwner}". Pass --owner <github-login-or-org>.`);
    process.exit(2);
  }
  return {
    host,
    login: login || resolvedOwner,
    owner: resolvedOwner,
    ownerSource: source,
    apiRateLimited: Boolean(apiError && isGhApiRateLimit(apiError)),
    version: version.stdout,
    status: status.stderr || status.stdout,
  };
}

function parseGhAuthStatusLogin(output) {
  const text = String(output ?? '');
  const activeAccount = /Logged in to [^\s]+ account ([^\s()]+)/i.exec(text);
  if (activeAccount?.[1]) return activeAccount[1].trim();
  const tokenAccount = /Token account:\s*([^\s()]+)/i.exec(text);
  if (tokenAccount?.[1]) return tokenAccount[1].trim();
  return '';
}

function isGhApiRateLimit(result) {
  const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  return /rate limit exceeded|authenticated requests get a higher rate limit/i.test(text);
}

export function normalizeManifestRepoForOwner(manifest, owner) {
  const name = String(manifest?.name ?? '').trim();
  if (!name) {
    console.error('[plugin repo] manifest.name is required');
    process.exit(2);
  }
  const rawRepo = typeof manifest?.plugin?.repo === 'string' ? manifest.plugin.repo.trim() : '';
  const parsed = parseGithubRepoUrl(rawRepo);
  const placeholder = parsed ? isPlaceholderRepoOwner(parsed.owner) : false;
  const shouldRewrite = !parsed || placeholder || parsed.name.toLowerCase() !== name.toLowerCase() || parsed.owner.toLowerCase() !== owner.toLowerCase();
  const repoUrl = shouldRewrite ? `https://github.com/${owner}/${name}` : parsed.url;
  if (shouldRewrite) {
    if (!manifest.plugin || typeof manifest.plugin !== 'object') manifest.plugin = {};
    manifest.plugin.repo = repoUrl;
    manifest.homepage = repoUrl;
    if (!manifest.author || typeof manifest.author !== 'object') manifest.author = {};
    manifest.author.url = `https://github.com/${owner}`;
  }
  return {
    changed: shouldRewrite,
    repoUrl,
    previousRepoUrl: rawRepo || null,
  };
}

export function parseGithubRepoUrl(raw) {
  if (!raw || typeof raw !== 'string') return null;
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
    owner = match[1];
    name = match[2];
  }
  if (!owner || !name) return null;
  return {
    owner,
    name,
    fullName: `${owner}/${name}`,
    url: `https://github.com/${owner}/${name}`,
  };
}

function isPlaceholderRepoOwner(owner) {
  return /^(open-design-user|<vendor>|vendor|example-user|your-org|your-username|owner|user|username)$/i.test(String(owner ?? '').trim());
}

export function isRepoNotFound(result) {
  const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  return /could not resolve to a repository|not found|repository not found/i.test(text);
}
