/** @module commands
 * Context-command handlers and the `runConnectorsToolCli(args)` dispatch entry point for `od tools connectors …`.
 */
import path from 'node:path';

import { auditDesignSystemPackage } from './audit/index.js';
import { CONNECTORS_USAGE, DEFAULT_GITHUB_CONTEXT_MAX_FILES, DEFAULT_LOCAL_CONTEXT_MAX_FILES, compactExecution, compactList, daemonUrl, defaultGithubContextOutputPath, defaultLocalContextOutputPath, fail, parseGithubRepo, parseOptions, printApiResult, readJsonObject, requestJson, toolToken, writeJson } from './core/index.js';
import { writeGithubDesignEvidence, writeLocalDesignEvidence } from './evidence/index.js';
import { collectGithubEvidenceWithConnector, collectGithubEvidenceWithGitClone, collectLocalDesignEvidence, connectorEvidenceNeedsCloneFallback } from './intake/index.js';
import type { GithubDesignEvidence, ParsedOptions, ToolCliResult } from './core/index.js';

/** Runs the `github-design-context` subcommand: collects GitHub evidence and writes markdown + snapshot files. @internal */
async function runGithubDesignContext(options: ParsedOptions): Promise<ToolCliResult> {
  if (!options.repo) return fail('github-design-context requires --repo owner/repo');
  const repo = parseGithubRepo(options.repo);
  const maxFiles = options.maxFiles ?? DEFAULT_GITHUB_CONTEXT_MAX_FILES;
  const outputPath = options.outputPath ?? defaultGithubContextOutputPath(repo);
  const baseUrl = daemonUrl();
  const token = toolToken();
  let evidence: GithubDesignEvidence;

  try {
    evidence = await collectGithubEvidenceWithGitClone(repo, {
      ...(options.ref === undefined ? {} : { ref: options.ref }),
      maxFiles,
    });
  } catch (localError) {
    const localReason = localError instanceof Error ? localError.message : String(localError);
    const connectorReady = !('error' in baseUrl) && typeof token === 'string';
    if (connectorReady) {
      let connectorReason: string | undefined;
      try {
        evidence = await collectGithubEvidenceWithConnector(baseUrl, token, repo, {
          ...(options.ref === undefined ? {} : { ref: options.ref }),
          maxFiles,
        });
        if (connectorEvidenceNeedsCloneFallback(evidence)) {
          throw new Error('GitHub connector bounded intake produced no snapshot files.');
        }
        evidence.warnings.unshift(
          `This-device GitHub intake failed; used Composio GitHub connector fallback. Reason: ${localReason}`,
        );
      } catch (connectorError) {
        connectorReason = connectorError instanceof Error ? connectorError.message : String(connectorError);
        if (options.requireConnector) {
          return fail('Required GitHub repository intake could not read the repository through git, GitHub CLI, or connector', {
            repo: `${repo.owner}/${repo.repo}`,
            localReason,
            connectorReason,
            nextStep: 'Run `gh auth login --web`, configure local git credentials, or connect GitHub through Composio with access to this repository. Do not draft design-system files from URL text alone.',
          });
        }
        throw new Error(
          `GitHub repository intake failed through this device and connector fallback. This device: ${localReason}; Connector: ${connectorReason}`,
        );
      }
    } else {
      const connectorReason = 'error' in baseUrl
        ? baseUrl.error
        : typeof token === 'string'
          ? 'OD_TOOL_TOKEN is not available'
          : token.error;
      if (options.requireConnector) {
        return fail('Required GitHub repository intake could not read the repository through git, GitHub CLI, or connector', {
          repo: `${repo.owner}/${repo.repo}`,
          localReason,
          connectorReason,
          nextStep: 'Run `gh auth login --web`, configure local git credentials, or connect GitHub through Composio with access to this repository. Do not draft design-system files from URL text alone.',
        });
      }
      throw localError;
    }
  }

  const written = await writeGithubDesignEvidence(outputPath, evidence);
  writeJson({
    ok: true,
    repo: `${repo.owner}/${repo.repo}`,
    method: written.method,
    ...(written.localCloneMethod === undefined ? {} : { localCloneMethod: written.localCloneMethod }),
    outputPath: path.relative(process.cwd(), path.resolve(outputPath)).split(path.sep).join('/'),
    snapshotFiles: written.files.map((file) => file.outputPath).filter(Boolean),
    materializedFiles: written.materializedFiles ?? [],
    warnings: written.warnings,
  });
  return { exitCode: 0 };
}

/** Runs the `local-design-context` subcommand: collects local-folder evidence and writes markdown + snapshot files. @internal */
async function runLocalDesignContext(options: ParsedOptions): Promise<ToolCliResult> {
  if (!options.localPath) return fail('local-design-context requires --path /path/to/project');
  const maxFiles = options.maxFiles ?? DEFAULT_LOCAL_CONTEXT_MAX_FILES;
  const outputPath = options.outputPath ?? defaultLocalContextOutputPath(options.localPath);
  const evidence = await collectLocalDesignEvidence(options.localPath, { maxFiles });
  const written = await writeLocalDesignEvidence(outputPath, evidence);
  writeJson({
    ok: true,
    sourcePath: written.sourcePath,
    method: written.method,
    outputPath: path.relative(process.cwd(), path.resolve(outputPath)).split(path.sep).join('/'),
    snapshotFiles: written.files.map((file) => file.outputPath).filter(Boolean),
    materializedFiles: written.materializedFiles ?? [],
    warnings: written.warnings,
  });
  return { exitCode: 0 };
}

/** Runs the `design-system-package-audit` subcommand and writes the audit result as JSON. @internal */
async function runDesignSystemPackageAudit(options: ParsedOptions): Promise<ToolCliResult> {
  const projectPath = path.resolve(options.localPath ?? '.');
  const audit = await auditDesignSystemPackage(projectPath, { referencePackage: options.referencePackage === true });
  const ok = audit.ok && (options.failOnWarnings !== true || audit.warnings.length === 0);
  writeJson(options.failOnWarnings === true ? { ...audit, ok } : audit);
  return { exitCode: ok ? 0 : 1 };
}

/**
 * Dispatches `od tools connectors …` subcommands parsed from the given argument array.
 * Handles `list`, `execute`, `github-design-context`, `local-design-context`, and `design-system-package-audit`.
 * @param args — Raw argument array following the `connectors` subcommand token (i.e. `process.argv.slice(3)`).
 */
export async function runConnectorsToolCli(args: string[]): Promise<ToolCliResult> {
  const options = parseOptions(args);
  if ('error' in options) return fail(options.error);
  if (options.help || !options.command) {
    process.stdout.write(CONNECTORS_USAGE);
    return { exitCode: options.command ? 0 : 1 };
  }

  if (options.command === 'github-design-context') {
    try {
      return await runGithubDesignContext(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }
  }

  if (options.command === 'local-design-context') {
    try {
      return await runLocalDesignContext(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }
  }

  if (options.command === 'design-system-package-audit') {
    try {
      return await runDesignSystemPackageAudit(options);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      return fail(message);
    }
  }

  const baseUrl = daemonUrl();
  if ('error' in baseUrl) return fail(baseUrl.error);
  const token = toolToken();
  if (typeof token !== 'string') return fail(token.error);

  try {
    if (options.command === 'list') {
      const listPath = options.useCase ? `/api/tools/connectors/list?useCase=${encodeURIComponent(options.useCase)}` : '/api/tools/connectors/list';
      return await printApiResult(
        await requestJson(baseUrl, token, listPath, { method: 'GET' }),
        options.format === 'compact' ? compactList : (body) => body,
      );
    }

    if (options.command === 'execute') {
      if (!options.connectorId) return fail('execute requires --connector <id>');
      if (!options.toolName) return fail('execute requires --tool <name>');
      if (!options.inputPath) return fail('execute requires --input input.json');
      const input = await readJsonObject(options.inputPath);
      return await printApiResult(
        await requestJson(baseUrl, token, '/api/tools/connectors/execute', {
          method: 'POST',
          body: JSON.stringify({ connectorId: options.connectorId, toolName: options.toolName, input }),
        }),
        options.format === 'compact' ? compactExecution : (body) => body,
      );
    }

    return fail(`unknown connectors command: ${options.command}`);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return fail(message);
  }
}
