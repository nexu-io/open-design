// @ts-nocheck
/** @module cli/plugin/github
 * GitHub CLI integration: command execution, shell escaping, auth detection, repo URL parsing, owner resolution.
 * Collaborators: publish.ts (publish-repo/open-design-pr workflows), marketplace.ts (marketplace login).
 * Invariant: POSIX shell escaping for gh commands; Windows falls back to direct gh spawn; tokens managed by gh, never by Open Design.
 */
/**
 * Runs command with args, captures stdout/stderr, returns { ok, code, stdout, stderr, error }.
 * Default 30s timeout, 1MB buffer. Used for git/gh/other commands.
 * @param command Command name (e.g., 'git', 'gh')
 * @param args Command arguments
 * @param opts { timeout?, maxBuffer?, cwd?, env? }
 * @returns { ok: boolean, code?, stdout, stderr, error? }
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

/**
 * Escapes shell argument for POSIX sh (single quote + escape internal quotes).
 * @internal
 */
function quotePosixShellArg(value) {
  const text = String(value ?? '');
  return `'${text.replace(/'/g, `'\\''`)}'`;
}

/**
 * Builds 'gh <args>' shell command string with quoted args.
 * @internal
 */
function buildGhShellCommand(args) {
  return ['gh', ...args].map(quotePosixShellArg).join(' ');
}

/**
 * Wraps command with $PATH export so gh finds login shell's installed gh.
 * @internal
 */
function buildLoginShellCommand(innerCommand) {
  return `export PATH=${quotePosixShellArg(process.env.PATH ?? '')}; ${innerCommand}`;
}

/**
 * Runs gh command via shell on POSIX (handles $PATH for gh installed via homebrew/scoop).
 * Windows uses direct spawn. Preserves gh environment for token lookup.
 * @param args gh subcommand and arguments
 * @param opts { timeout?, cwd? }
 * @returns { ok, code, stdout, stderr, error? }
 */
export async function execGhBuffered(args, opts = {}) {
  if (process.platform === 'win32') return execFileBuffered('gh', args, opts);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return execFileBuffered(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
    ...opts,
  });
}

/**
 * Runs command with stdio='inherit' (streams output live to caller's stdout/stderr).
 * Used for interactive prompts (gh auth login).
 * @param command Command name
 * @param args Arguments
 * @param opts Spawn options
 * @returns { code?, error? }
 */
export async function spawnPassthrough(command, args, opts = {}) {
  const { spawn } = await import('node:child_process');
  return await new Promise((resolve) => {
    const child = spawn(command, args, { stdio: 'inherit', ...opts });
    child.on('error', (error) => resolve({ code: 1, error }));
    child.on('close', (code) => resolve({ code }));
  });
}

/**
 * Runs gh command with stdio='inherit' via shell (POSIX) or direct (Windows).
 * @param args gh subcommand and arguments
 * @returns { code?, error? }
 */
export async function spawnGhPassthrough(args) {
  if (process.platform === 'win32') return spawnPassthrough('gh', args);
  const shell = process.env.SHELL && process.env.SHELL.trim() ? process.env.SHELL.trim() : '/bin/zsh';
  return spawnPassthrough(shell, ['-c', buildLoginShellCommand(buildGhShellCommand(args))], {
    env: process.env,
  });
}

/**
 * Extracts hostname from URL or defaults to 'github.com'. Handles marketplace ids (non-URLs) gracefully.
 * @param target URL or marketplace id
 * @returns GitHub host string
 */
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

/**
 * Resolves GitHub owner for publish-repo or open-design-pr. Tries (in order):
 * 1. --owner flag
 * 2. manifest.plugin.repo (if not placeholder + valid)
 * 3. gh auth status --active
 * 4. gh api user --jq .login (fallback)
 * Tracks resolution source + rate-limit warnings. Refuses placeholder owners (spec §3.T2).
 * @param opts { host?, owner?, manifest, purpose: 'publish-repo'|'open-design-pr' }
 * @returns { host, login, owner, ownerSource, apiRateLimited, version, status }
 */
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

/**
 * Extracts login from 'gh auth status' output (looks for 'Logged in to ... account' or 'Token account:').
 * @internal
 */
function parseGhAuthStatusLogin(output) {
  const text = String(output ?? '');
  const activeAccount = /Logged in to [^\s]+ account ([^\s()]+)/i.exec(text);
  if (activeAccount?.[1]) return activeAccount[1].trim();
  const tokenAccount = /Token account:\s*([^\s()]+)/i.exec(text);
  if (tokenAccount?.[1]) return tokenAccount[1].trim();
  return '';
}

/**
 * @internal Detects GitHub API rate-limit errors from command output
 * (stdout + stderr). Returns true if rate-limit signature is found.
 * Used by resolvePluginGithubTarget to distinguish capacity errors from
 * auth/network failures and guide users toward re-auth or explicit --owner.
 */
function isGhApiRateLimit(result) {
  const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  return /rate limit exceeded|authenticated requests get a higher rate limit/i.test(text);
}

/**
 * Rewrites manifest.plugin.repo if placeholder owner or mismatch vs owner param.
 * Returns { changed, repoUrl, previousRepoUrl } and mutates manifest in place.
 * Also updates manifest.homepage and manifest.author.url.
 * @param manifest Plugin manifest (mutated)
 * @param owner Resolved GitHub owner
 * @returns { changed, repoUrl, previousRepoUrl? }
 */
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

/**
 * Parses GitHub repo URL or 'owner/repo' format → { owner, name, fullName, url }.
 * Tolerates trailing .git. Returns null if invalid.
 * @param raw URL or owner/repo string
 * @returns Parsed object or null
 */
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

/**
 * Detects placeholder owners (open-design-user, <vendor>, vendor, example-user, your-org, etc.).
 * @internal
 */
function isPlaceholderRepoOwner(owner) {
  return /^(open-design-user|<vendor>|vendor|example-user|your-org|your-username|owner|user|username)$/i.test(String(owner ?? '').trim());
}

/**
 * Detects 'could not resolve to a repository' / 'not found' from gh command output.
 * Used to distinguish 404 from auth/network errors.
 * @internal
 */
export function isRepoNotFound(result) {
  const text = `${result?.stdout ?? ''}\n${result?.stderr ?? ''}`;
  return /could not resolve to a repository|not found|repository not found/i.test(text);
}
