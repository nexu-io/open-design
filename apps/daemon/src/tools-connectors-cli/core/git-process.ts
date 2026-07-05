/** @module core/git-process
 * Git clone, gh-CLI auth, and buffered child-process execution helpers used by the intake layer.
 */
import { spawn } from 'node:child_process';
import { existsSync } from 'node:fs';
import { readdir, rm } from 'node:fs/promises';
import path from 'node:path';

import { shouldSkipRepoPath } from './design-scoring.js';
import { GH_AUTH_TIMEOUT_MS, GITHUB_CLONE_TIMEOUT_MS, MAX_PROCESS_OUTPUT_CHARS } from './types.js';
import type { LocalGitHubCloneResult, ParsedGitHubRepo, ProcessRunResult } from './types.js';

/**
 * Clones a GitHub repository into `cloneDir` using `git clone`, falling back to the GitHub CLI on failure.
 * @param repo — The parsed repository identity (owner, repo, source URL).
 * @param cloneDir — Absolute path of the target clone directory (must not yet exist).
 * @param ref — Optional branch, tag, or commit to pass as `--branch`; omit to clone the default branch.
 * @returns A `LocalGitHubCloneResult` indicating which method succeeded, plus any advisory warnings.
 */
export async function cloneGithubRepository(
  repo: ParsedGitHubRepo,
  cloneDir: string,
  ref: string | undefined,
): Promise<LocalGitHubCloneResult> {
  const repoUrl = /^https?:\/\//iu.test(repo.source) || repo.source.startsWith('git@')
    ? repo.source
    : `https://github.com/${repo.owner}/${repo.repo}.git`;
  const gitArgs = ['clone', '--depth=1', '--single-branch'];
  if (ref) gitArgs.push('--branch', ref);
  gitArgs.push(repoUrl, cloneDir);

  const gitResult = await runProcessBuffered('git', gitArgs, {
    timeoutMs: GITHUB_CLONE_TIMEOUT_MS,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  if (gitResult.ok) return { method: 'git', warnings: [] };

  await rm(cloneDir, { recursive: true, force: true });
  const gitFailure = summarizeProcessFailure('git clone', gitResult);
  const gh = await checkGitHubCliAuthentication();
  if (!gh.installed) {
    throw new Error(
      `${gitFailure}; GitHub CLI is not installed. Install GitHub CLI or configure local git credentials, then rerun github-design-context.`,
    );
  }
  if (!gh.authenticated) {
    throw new Error(
      `${gitFailure}; GitHub CLI is installed but not authenticated. Run \`gh auth login --web\`, grant this repository, then rerun github-design-context.`,
    );
  }

  const ghArgs = ['repo', 'clone', `${repo.owner}/${repo.repo}`, cloneDir, '--', '--depth=1', '--single-branch'];
  if (ref) ghArgs.push('--branch', ref);
  const ghResult = await runProcessBuffered('gh', ghArgs, {
    timeoutMs: GITHUB_CLONE_TIMEOUT_MS,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  if (ghResult.ok) {
    return {
      method: 'gh-cli',
      warnings: [
        `Plain git clone could not read the repository, so the intake used authenticated GitHub CLI clone instead. ${gitFailure}`,
      ],
    };
  }

  throw new Error(`${gitFailure}; ${summarizeProcessFailure('gh repo clone', ghResult)}`);
}

/** Checks whether `gh` is installed and authenticated against github.com. @internal */
async function checkGitHubCliAuthentication(): Promise<{ installed: boolean; authenticated: boolean }> {
  const version = await runProcessBuffered('gh', ['--version'], { timeoutMs: GH_AUTH_TIMEOUT_MS });
  if (!version.ok) return { installed: false, authenticated: false };
  const auth = await runProcessBuffered('gh', ['auth', 'status', '--hostname', 'github.com'], {
    timeoutMs: GH_AUTH_TIMEOUT_MS,
    env: { GIT_TERMINAL_PROMPT: '0' },
  });
  return { installed: true, authenticated: auth.ok };
}

/** Spawns a child process, buffers stdout/stderr up to `MAX_PROCESS_OUTPUT_CHARS`, and resolves with the result. @internal */
async function runProcessBuffered(
  command: string,
  args: string[],
  options: { timeoutMs: number; env?: Record<string, string> },
): Promise<ProcessRunResult> {
  return await new Promise<ProcessRunResult>((resolve) => {
    let settled = false;
    let timedOut = false;
    let stdout = '';
    let stderr = '';
    let timeout: ReturnType<typeof setTimeout> | undefined;
    const settle = (result: ProcessRunResult) => {
      if (settled) return;
      settled = true;
      if (timeout) clearTimeout(timeout);
      resolve({
        ...result,
        stdout: redactSensitiveProcessOutput(result.stdout),
        stderr: redactSensitiveProcessOutput(result.stderr),
        ...(result.error === undefined ? {} : { error: redactSensitiveProcessOutput(result.error) }),
      });
    };
    const resolvedCommand = resolveProcessCommand(command);
    const child = spawn(resolvedCommand, args, {
      stdio: ['ignore', 'pipe', 'pipe'],
      env: { ...process.env, ...(options.env ?? {}) },
      shell: process.platform === 'win32' && /\.(?:bat|cmd)$/iu.test(resolvedCommand),
    });
    timeout = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
      setTimeout(() => {
        if (!settled) child.kill('SIGKILL');
      }, 2_000).unref();
    }, options.timeoutMs);
    timeout.unref();
    child.stdout.on('data', (chunk) => {
      stdout = appendProcessOutput(stdout, chunk);
    });
    child.stderr.on('data', (chunk) => {
      stderr = appendProcessOutput(stderr, chunk);
    });
    child.on('error', (error) => {
      settle({ ok: false, stdout, stderr, error: error.message });
    });
    child.on('close', (code) => {
      settle({ ok: code === 0 && !timedOut, stdout, stderr, code, ...(timedOut ? { timedOut } : {}) });
    });
  });
}

/** Resolves a bare command name to a full executable path on Windows by searching PATH extensions. @internal */
function resolveProcessCommand(command: string): string {
  if (process.platform !== 'win32' || path.extname(command)) return command;
  for (const directory of (process.env.PATH ?? '').split(path.delimiter)) {
    if (!directory) continue;
    for (const extension of ['.cmd', '.exe', '.bat', '']) {
      const candidate = path.join(directory, `${command}${extension}`);
      if (existsSync(candidate)) return candidate;
    }
  }
  return command;
}

/** Appends a process output chunk to the accumulated string, capping at `MAX_PROCESS_OUTPUT_CHARS`. @internal */
function appendProcessOutput(current: string, chunk: unknown): string {
  return `${current}${String(chunk)}`.slice(-MAX_PROCESS_OUTPUT_CHARS);
}

/** Formats a human-readable failure summary from a `ProcessRunResult`, including timeout, error, and stderr details. @internal */
function summarizeProcessFailure(label: string, result: ProcessRunResult): string {
  const details = [
    result.timedOut ? `timed out after ${Math.round(GITHUB_CLONE_TIMEOUT_MS / 1000)}s` : '',
    result.error,
    result.stderr.trim(),
    result.stdout.trim(),
    result.code === undefined || result.code === 0 ? '' : `exit code ${result.code}`,
  ].filter(Boolean);
  return `${label} failed${details.length ? `: ${details.join(' | ')}` : ''}`;
}

/** Strips GitHub tokens and credential-embedded URLs from process output to prevent credential leakage. @internal */
function redactSensitiveProcessOutput(value: string): string {
  return value
    .replace(/https?:\/\/[^@\s]+@github\.com/giu, 'https://***@github.com')
    .replace(/(gh[opsu]_[A-Za-z0-9_]+)/gu, '***');
}

/**
 * Recursively walks `root`, returning sorted repo-relative paths for all files not excluded by `shouldSkipRepoPath`.
 * @param root — Absolute path to the local repository clone or folder.
 */
export async function listLocalRepoFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      const normalized = relativePath.toLowerCase();
      if (entry.isDirectory()) {
        if (shouldSkipRepoPath(`${normalized}/`)) continue;
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && !shouldSkipRepoPath(normalized)) files.push(relativePath);
    }
  };
  await walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

/**
 * Recursively walks `root`, returning sorted repo-relative paths for all files not excluded by `shouldSkipAuditPath`.
 * Uses a broader inclusion set than `listLocalRepoFiles` to capture all package source files for audit.
 * @param root — Absolute path to the project directory to audit.
 */
export async function listAuditFiles(root: string): Promise<string[]> {
  const files: string[] = [];
  const walk = async (dir: string) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const absolutePath = path.join(dir, entry.name);
      const relativePath = path.relative(root, absolutePath).split(path.sep).join('/');
      const normalized = relativePath.toLowerCase();
      if (entry.isDirectory()) {
        if (shouldSkipAuditPath(`${normalized}/`)) continue;
        await walk(absolutePath);
        continue;
      }
      if (entry.isFile() && !shouldSkipAuditPath(normalized)) files.push(relativePath);
    }
  };
  await walk(root);
  return files.sort((left, right) => left.localeCompare(right));
}

/** Returns true if a path should be excluded from an audit file walk (generated output, lockfiles, etc.). @internal */
function shouldSkipAuditPath(normalizedPath: string): boolean {
  return /(^|\/)(node_modules|vendor|dist|coverage|\.next|\.nuxt|\.git|out|target|storybook-static)\//u.test(normalizedPath)
    || /(^|\/)(package-lock\.json|pnpm-lock\.ya?ml|yarn\.lock|bun\.lockb|\.ds_store)$/u.test(normalizedPath);
}
