import { execFile } from 'node:child_process';
import { mkdir, rm } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { containsSymlink } from '../library-install.js';
import {
  LocalDesignSystemImportError,
  type LocalDesignSystemImportOptions,
  type LocalDesignSystemImportResult,
  importLocalDesignSystemProject,
} from './import.js';

const execFileAsync = promisify(execFile);

export type GitHubDesignSystemImportOptions = Pick<
  LocalDesignSystemImportOptions,
  'craftApplies' | 'importMode' | 'name' | 'now' | 'reservedIds'
> & {
  branch?: string;
  gitBin?: string;
};

export type ParsedGitHubRepoUrl = {
  cloneUrl: string;
  owner: string;
  repo: string;
};

type ExecGitResult = {
  stdout: string | Buffer;
  stderr: string | Buffer;
};

export async function importGitHubDesignSystemProject(
  githubUrl: string,
  tmpRoot: string,
  userDesignSystemsRoot: string,
  options: GitHubDesignSystemImportOptions = {},
): Promise<LocalDesignSystemImportResult> {
  const parsed = parseGitHubRepoUrl(githubUrl);
  const importedAt = (options.now ?? new Date()).toISOString();
  const cloneRoot = path.join(tmpRoot, 'github-design-system-imports');
  await mkdir(cloneRoot, { recursive: true });
  const cloneDir = path.join(
    cloneRoot,
    `${parsed.owner}-${parsed.repo}-${importedAt.replace(/[^0-9a-z]/gi, '')}`,
  );
  const gitBin = options.gitBin ?? 'git';
  const cloneArgs = ['clone', '--depth', '1'];
  const branch = cleanBranch(options.branch);
  if (branch) cloneArgs.push('--branch', branch);
  cloneArgs.push(parsed.cloneUrl, cloneDir);

  try {
    await execGit(gitBin, cloneArgs, undefined, 120_000);
    // Refuse a clone that contains symbolic links: the design-system readers and
    // this importer follow symlinks, so a committed in-tree symlink pointing
    // outside the clone (e.g. `README.md -> /etc/passwd`) would exfiltrate an
    // arbitrary file into the imported design system. Mirrors installFromGithub.
    if (await containsSymlink(cloneDir)) {
      throw new LocalDesignSystemImportError(
        'BAD_REQUEST',
        'repository contains symbolic links, which are not allowed',
      );
    }
    const [detectedBranch, commit] = await Promise.all([
      readGitStdout(gitBin, ['-C', cloneDir, 'rev-parse', '--abbrev-ref', 'HEAD']),
      readGitStdout(gitBin, ['-C', cloneDir, 'rev-parse', 'HEAD']),
    ]);
    const sourceBranch = branch ?? normalizeDetachedBranch(detectedBranch);
    return await importLocalDesignSystemProject(cloneDir, userDesignSystemsRoot, {
      now: new Date(importedAt),
      fallbackName: parsed.repo,
      ...(options.name ? { name: options.name } : {}),
      ...(options.reservedIds ? { reservedIds: options.reservedIds } : {}),
      ...(options.importMode ? { importMode: options.importMode } : {}),
      ...(options.craftApplies ? { craftApplies: options.craftApplies } : {}),
      source: {
        type: 'github',
        url: parsed.cloneUrl,
        commit,
        importedAt,
        ...(sourceBranch ? { branch: sourceBranch } : {}),
      },
    });
  } catch (err) {
    await rm(cloneDir, { recursive: true, force: true });
    if (err instanceof LocalDesignSystemImportError) throw err;
    throw new LocalDesignSystemImportError(
      'BAD_REQUEST',
      `could not import public GitHub repository: ${formatGitError(err)}`,
    );
  }
}

export function parseGitHubRepoUrl(input: string): ParsedGitHubRepoUrl {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new LocalDesignSystemImportError('BAD_REQUEST', 'GitHub URL must be a valid https://github.com URL');
  }

  if (url.protocol !== 'https:' || url.hostname.toLowerCase() !== 'github.com') {
    throw new LocalDesignSystemImportError('BAD_REQUEST', 'only public https://github.com repositories are supported');
  }

  const parts = url.pathname.split('/').filter(Boolean);
  const owner = parts[0];
  const rawRepo = parts[1];
  if (!owner || !rawRepo || parts.length > 2) {
    throw new LocalDesignSystemImportError('BAD_REQUEST', 'GitHub URL must point to a repository root');
  }

  const repo = rawRepo.replace(/\.git$/i, '');
  if (!isGitHubPathSegment(owner) || !isGitHubPathSegment(repo)) {
    throw new LocalDesignSystemImportError('BAD_REQUEST', 'GitHub repository owner/name contains unsupported characters');
  }

  return {
    owner,
    repo,
    cloneUrl: `https://github.com/${owner}/${repo}.git`,
  };
}

function cleanBranch(value: string | undefined): string | undefined {
  if (value === undefined) return undefined;
  const trimmed = value.trim();
  if (trimmed.length === 0) return undefined;
  if (!/^[A-Za-z0-9._/-]+$/.test(trimmed) || trimmed.includes('..') || trimmed.startsWith('/')) {
    throw new LocalDesignSystemImportError('BAD_REQUEST', 'GitHub branch contains unsupported characters');
  }
  return trimmed;
}

function normalizeDetachedBranch(value: string): string | undefined {
  const trimmed = value.trim();
  if (!trimmed || trimmed === 'HEAD') return undefined;
  return trimmed;
}

function isGitHubPathSegment(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value) && !value.startsWith('.') && !value.endsWith('.');
}

async function readGitStdout(gitBin: string, args: string[]): Promise<string> {
  const result = await execGit(gitBin, args, undefined, 20_000);
  return String(result.stdout).trim();
}

async function execGit(
  gitBin: string,
  args: string[],
  cwd: string | undefined,
  timeout: number,
): Promise<ExecGitResult> {
  return await execFileAsync(gitBin, args, {
    cwd,
    timeout,
    maxBuffer: 1024 * 1024,
  });
}

function formatGitError(err: unknown): string {
  if (typeof err === 'object' && err !== null) {
    const stderr = (err as { stderr?: unknown }).stderr;
    if (typeof stderr === 'string' && stderr.trim()) return stderr.trim().split('\n').slice(-1)[0] ?? stderr.trim();
    const message = (err as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) return message.trim();
  }
  return String(err);
}
