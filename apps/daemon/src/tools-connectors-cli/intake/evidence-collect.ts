/** @module intake/evidence-collect
 * Gathers design evidence from a GitHub repository (via connector or git clone) or a local folder, producing typed evidence objects.
 */
import { mkdtemp, readFile, rm, stat } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import { GITHUB_GET_RAW_CONTENT_TOOL, GITHUB_GET_README_TOOL, GITHUB_GET_REPOSITORY_CONTENT_TOOL, GITHUB_GET_REPOSITORY_TOOL, GITHUB_GET_TREE_TOOL, MAX_CONNECTOR_DIRECTORY_SCAN_DIRS, MAX_CONTEXT_ASSET_BYTES, MAX_CONTEXT_FILE_BYTES, cloneGithubRepository, isBinaryDesignAssetPath, isTextSnapshotPath, listLocalRepoFiles, localSourceName, preferredReadmePath, scoreDesignDirectory, selectDesignFiles, selectDesignFilesWithPreferredReadme, shouldSkipRepoPath } from '../core/index.js';
import { assertGithubConnectorIsListable, executeConnectorReadTool, extractDirectoryEntries, extractTreePaths, getDefaultBranch, getStringAtKeys, readConnectorSnapshotContent, readConnectorTextContent } from './connector-read.js';
import type { GithubDesignEvidence, GithubSnapshotFile, JsonObject, LocalDesignEvidence, ParsedGitHubRepo } from '../core/index.js';
import type { GithubDirectoryEntry } from './connector-read.js';

/** Fetches the full repository tree via the connector's recursive tree tool, falling back to directory listing on failure. @internal */
async function collectGithubTreePathsWithConnector(
  baseUrl: URL,
  token: string,
  repo: ParsedGitHubRepo,
  resolvedRef: string,
  warnings: string[],
): Promise<string[]> {
  try {
    const treePayload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_TREE_TOOL, {
      owner: repo.owner,
      repo: repo.repo,
      tree_sha: resolvedRef,
      recursive: true,
    });
    return extractTreePaths(treePayload);
  } catch (error) {
    warnings.push(
      `Recursive tree connector read failed; falling back to bounded directory browsing: ${
        error instanceof Error ? error.message : String(error)
      }`,
    );
    return collectGithubTreePathsFromDirectoryListings(baseUrl, token, repo, resolvedRef, warnings);
  }
}

/** Discovers file paths by breadth-first browsing of repository directories via the connector, bounded by `MAX_CONNECTOR_DIRECTORY_SCAN_DIRS`. @internal */
async function collectGithubTreePathsFromDirectoryListings(
  baseUrl: URL,
  token: string,
  repo: ParsedGitHubRepo,
  resolvedRef: string,
  warnings: string[],
): Promise<string[]> {
  const filePaths = new Set<string>();
  const seenDirs = new Set<string>();
  const queue: string[] = [''];

  while (queue.length > 0 && seenDirs.size < MAX_CONNECTOR_DIRECTORY_SCAN_DIRS) {
    const currentDir = queue.shift() ?? '';
    if (seenDirs.has(currentDir)) continue;
    seenDirs.add(currentDir);

    let entries: GithubDirectoryEntry[] = [];
    try {
      const payload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_REPOSITORY_CONTENT_TOOL, {
        owner: repo.owner,
        repo: repo.repo,
        ref: resolvedRef,
        path: currentDir,
      });
      entries = extractDirectoryEntries(payload);
    } catch (error) {
      warnings.push(`Skipped directory ${currentDir || '.'}: ${error instanceof Error ? error.message : String(error)}`);
      continue;
    }

    for (const entry of entries) {
      if (entry.type === 'file') {
        if (!shouldSkipRepoPath(entry.path.toLowerCase())) filePaths.add(entry.path);
        continue;
      }
      if (entry.type === 'dir' && !seenDirs.has(entry.path) && scoreDesignDirectory(entry.path) > 0) {
        queue.push(entry.path);
      }
    }

    queue.sort((left, right) => scoreDesignDirectory(right) - scoreDesignDirectory(left) || left.localeCompare(right));
  }

  if (queue.length > 0) {
    warnings.push(`Directory browsing stopped after ${MAX_CONNECTOR_DIRECTORY_SCAN_DIRS} directories; evidence is a bounded connector snapshot.`);
  }
  return [...filePaths].sort((left, right) => left.localeCompare(right));
}

/**
 * Collects GitHub design evidence by calling the daemon connector API, reading metadata, README, tree, and file content.
 * @param repo — Parsed repository identity.
 * @param options — `ref` (optional branch/tag) and `maxFiles` limit.
 * @returns A fully populated `GithubDesignEvidence` object.
 */
export async function collectGithubEvidenceWithConnector(
  baseUrl: URL,
  token: string,
  repo: ParsedGitHubRepo,
  options: { ref?: string; maxFiles: number },
): Promise<GithubDesignEvidence> {
  await assertGithubConnectorIsListable(baseUrl, token);
  const warnings: string[] = [];
  let metadata: unknown;
  try {
    metadata = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_REPOSITORY_TOOL, {
      owner: repo.owner,
      repo: repo.repo,
    });
  } catch (error) {
    if (!connectorIntakeIsRecoverable(error)) throw error;
    warnings.push(
      `Repository metadata connector read failed; continuing with ${
        options.ref ?? 'main'
      } as the ref: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
  const resolvedRef = options.ref ?? getDefaultBranch(metadata) ?? 'main';

  let readme: GithubDesignEvidence['readme'];
  try {
    const readmePayload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_README_TOOL, {
      owner: repo.owner,
      repo: repo.repo,
      ref: resolvedRef,
    });
    const content = await readConnectorTextContent(readmePayload);
    if (content) {
      readme = {
        path: getStringAtKeys(readmePayload, ['path', 'name']) ?? 'README.md',
        content,
      };
    }
  } catch (error) {
    warnings.push(`README connector read failed: ${error instanceof Error ? error.message : String(error)}`);
  }

  const treePaths = await collectGithubTreePathsWithConnector(baseUrl, token, repo, resolvedRef, warnings);
  const selectedPaths = selectDesignFiles(treePaths, options.maxFiles);
  const files: GithubSnapshotFile[] = [];
  for (const repoPath of selectedPaths) {
    if (readme?.path === repoPath) continue;
    try {
      const contentPayload = await executeConnectorReadTool(baseUrl, token, GITHUB_GET_RAW_CONTENT_TOOL, {
        owner: repo.owner,
        repo: repo.repo,
        ref: resolvedRef,
        path: repoPath,
      });
      const snapshot = await readConnectorSnapshotContent(repoPath, contentPayload);
      if (snapshot === undefined) {
        warnings.push(`Skipped ${repoPath}: connector returned no readable content`);
        continue;
      }
      files.push({
        repoPath,
        content: snapshot.content,
        bytes: snapshot.bytes,
        source: 'connector',
        ...(snapshot.binary ? { binary: true } : {}),
      });
    } catch (error) {
      warnings.push(`Skipped ${repoPath}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  if (!readme && files.length === 0) {
    throw new Error(
      [
        'GitHub connector did not produce readable repository evidence through bounded intake.',
        warnings.length ? `Warnings: ${warnings.join(' | ')}` : '',
      ].filter(Boolean).join(' '),
    );
  }

  const metadataObject = metadata && typeof metadata === 'object' && !Array.isArray(metadata)
    ? metadata as JsonObject
    : undefined;
  return {
    repo,
    ...(options.ref === undefined ? {} : { ref: options.ref }),
    resolvedRef,
    method: 'connector',
    ...(metadataObject === undefined ? {} : { repositoryMetadata: metadataObject }),
    ...(readme === undefined ? {} : { readme }),
    treePaths,
    files,
    warnings,
  };
}

/**
 * Collects GitHub design evidence by performing a shallow `git clone` (or gh-CLI clone) into a temp directory.
 * @param repo — Parsed repository identity.
 * @param options — `ref`, `maxFiles`, an optional advisory `reason` string, and pre-existing `warnings`.
 */
export async function collectGithubEvidenceWithGitClone(
  repo: ParsedGitHubRepo,
  options: { ref?: string; maxFiles: number; reason?: string; warnings?: string[] },
): Promise<GithubDesignEvidence> {
  const tmpDir = await mkdtemp(path.join(os.tmpdir(), 'od-github-context-'));
  const cloneDir = path.join(tmpDir, 'repo');
  try {
    const clone = await cloneGithubRepository(repo, cloneDir, options.ref);
    const paths = await listLocalRepoFiles(cloneDir);
    const selectedPaths = selectDesignFilesWithPreferredReadme(paths, options.maxFiles);
    const files: GithubSnapshotFile[] = [];
    let readme: GithubDesignEvidence['readme'];
    const preferredReadme = preferredReadmePath(paths);
    for (const repoPath of selectedPaths) {
      const absolutePath = path.join(cloneDir, repoPath);
      const fileStat = await stat(absolutePath);
      if (!fileStat.isFile()) continue;
      const normalizedPath = repoPath.toLowerCase();
      const binary = isBinaryDesignAssetPath(normalizedPath);
      if (binary) {
        if (fileStat.size > MAX_CONTEXT_ASSET_BYTES) continue;
        files.push({
          repoPath,
          content: await readFile(absolutePath),
          bytes: fileStat.size,
          source: 'git-clone',
          binary: true,
        });
        continue;
      }
      if (!isTextSnapshotPath(normalizedPath) || fileStat.size > MAX_CONTEXT_FILE_BYTES) continue;
      const content = await readFile(absolutePath, 'utf8');
      if (!readme && repoPath === preferredReadme) {
        readme = { path: repoPath, content };
        continue;
      }
      files.push({
        repoPath,
        content,
        bytes: Buffer.byteLength(content, 'utf8'),
        source: 'git-clone',
      });
    }
    return {
      repo,
      ...(options.ref === undefined ? {} : { ref: options.ref }),
      ...(options.ref === undefined ? {} : { resolvedRef: options.ref }),
      method: 'git-clone',
      localCloneMethod: clone.method,
      ...(readme === undefined ? {} : { readme }),
      treePaths: paths,
      files,
      warnings: [
        ...(options.warnings ?? []),
        ...clone.warnings,
        ...(options.reason ? [`This-device GitHub intake note: ${options.reason}`] : []),
      ],
    };
  } finally {
    await rm(tmpDir, { recursive: true, force: true });
  }
}

/**
 * Collects design evidence from a local directory, scoring and selecting files the same way as GitHub intake.
 * @param sourcePath — Absolute or relative path to the local project folder.
 * @param options — `maxFiles` limit for the snapshot.
 */
export async function collectLocalDesignEvidence(
  sourcePath: string,
  options: { maxFiles: number },
): Promise<LocalDesignEvidence> {
  const resolvedSourcePath = path.resolve(sourcePath);
  const sourceStat = await stat(resolvedSourcePath);
  if (!sourceStat.isDirectory()) {
    throw new Error(`local-design-context requires --path to be a directory: ${resolvedSourcePath}`);
  }
  const paths = await listLocalRepoFiles(resolvedSourcePath);
  const selectedPaths = selectDesignFilesWithPreferredReadme(paths, options.maxFiles);
  const files: GithubSnapshotFile[] = [];
  const warnings: string[] = [];
  let readme: LocalDesignEvidence['readme'];
  const preferredReadme = preferredReadmePath(paths);

  for (const repoPath of selectedPaths) {
    const absolutePath = path.join(resolvedSourcePath, repoPath);
    const fileStat = await stat(absolutePath);
    if (!fileStat.isFile()) continue;
    const normalizedPath = repoPath.toLowerCase();
    const binary = isBinaryDesignAssetPath(normalizedPath);
    if (binary) {
      if (fileStat.size > MAX_CONTEXT_ASSET_BYTES) {
        warnings.push(`Skipped ${repoPath}: binary asset exceeds ${MAX_CONTEXT_ASSET_BYTES} bytes`);
        continue;
      }
      files.push({
        repoPath,
        content: await readFile(absolutePath),
        bytes: fileStat.size,
        source: 'local-folder',
        binary: true,
      });
      continue;
    }
    if (!isTextSnapshotPath(normalizedPath)) continue;
    if (fileStat.size > MAX_CONTEXT_FILE_BYTES) {
      warnings.push(`Skipped ${repoPath}: text file exceeds ${MAX_CONTEXT_FILE_BYTES} bytes`);
      continue;
    }
    const content = await readFile(absolutePath, 'utf8');
    if (!readme && repoPath === preferredReadme) {
      readme = { path: repoPath, content };
      continue;
    }
    files.push({
      repoPath,
      content,
      bytes: Buffer.byteLength(content, 'utf8'),
      source: 'local-folder',
    });
  }

  if (!readme && files.length === 0) {
    throw new Error(`No design-relevant local evidence was selected from ${resolvedSourcePath}`);
  }

  return {
    sourcePath: resolvedSourcePath,
    sourceName: localSourceName(resolvedSourcePath),
    method: 'local-folder',
    treePaths: paths,
    files,
    ...(readme === undefined ? {} : { readme }),
    warnings,
  };
}

/** Returns true if a connector intake error is recoverable (rate-limit or output-too-large) rather than a hard auth/access failure. @internal */
function connectorIntakeIsRecoverable(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  if (/\b(ACCESS_DENIED|NOT_FOUND|FORBIDDEN|UNAUTHORIZED)\b|access denied|repository not found|not found|forbidden|permission|unauthorized|\b40[134]\b/iu.test(message)) {
    return false;
  }
  return /\b(CONNECTOR_OUTPUT_TOO_LARGE|CONNECTOR_RATE_LIMITED)\b/u.test(message)
    || /did not produce readable repository evidence/iu.test(message)
    || /produced no snapshot files/iu.test(message);
}

/**
 * Returns true when connector-collected evidence has no snapshot files and a git-clone fallback should be attempted.
 * @param evidence — The evidence object returned by `collectGithubEvidenceWithConnector`.
 */
export function connectorEvidenceNeedsCloneFallback(evidence: GithubDesignEvidence): boolean {
  return evidence.files.length === 0;
}
