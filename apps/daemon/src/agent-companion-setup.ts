import { createHash } from 'node:crypto';
import { execFile } from 'node:child_process';
import { access, mkdir, readFile, readdir, rm, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';

import { createPackageManagerInvocation } from '@open-design/platform';
import type {
  AgentCompanionSetupAction,
  AgentCompanionSetupResponse,
} from '@open-design/contracts';

import { agentCliEnvForAgent, readAppConfig } from './app-config.js';
import { detectAgent } from './runtimes/detection.js';
import { spawnEnvForAgent } from './runtimes/env.js';
import { execAgentFile } from './runtimes/invocation.js';
import { applyAgentLaunchEnv, resolveAgentLaunch } from './runtimes/launch.js';
import { getAgentDef } from './runtimes/registry.js';
import {
  hasOpenDesignProfile,
  resolveOpenDesignProfileDir,
} from './runtimes/defs/deepseek-harness.js';

const execFileAsync = promisify(execFile);
const DSH_AGENT_ID = 'deepseek-harness';
const DSH_RUNTIME_RESOURCE_DIRECTORY = path.join('agent-runtimes', 'deepseek-harness');
const DSH_RUNTIME_PACKAGE_NAME = '@open-design/dsh-runtime';

type RuntimeManifest = {
  file: string;
  packageName: typeof DSH_RUNTIME_PACKAGE_NAME;
  schemaVersion: 1;
  sha256: string;
  version: string;
};

export class AgentCompanionSetupError extends Error {
  constructor(
    readonly code:
      | 'AGENT_NOT_INSTALLED'
      | 'BUNDLED_COMPANION_INVALID'
      | 'COMPANION_INSTALL_FAILED'
      | 'COMPANION_STILL_INCOMPATIBLE',
    message: string,
  ) {
    super(message);
    this.name = 'AgentCompanionSetupError';
  }
}

async function fileExists(file: string): Promise<boolean> {
  try {
    await access(file);
    return true;
  } catch {
    return false;
  }
}

async function runPackageManager(args: string[], workspaceRoot: string): Promise<void> {
  const invocation = createPackageManagerInvocation(args, process.env);
  await execFileAsync(invocation.command, invocation.args, {
    cwd: workspaceRoot,
    env: process.env,
    windowsVerbatimArguments: invocation.windowsVerbatimArguments,
  });
}

async function materializeDevelopmentBundle(
  projectRoot: string,
  runtimeDataDir: string,
): Promise<string> {
  const packageRoot = path.join(projectRoot, 'packages', 'dsh-runtime');
  const packageJsonPath = path.join(packageRoot, 'package.json');
  if (!(await fileExists(packageJsonPath))) {
    throw new AgentCompanionSetupError(
      'BUNDLED_COMPANION_INVALID',
      'This OpenDesign build does not contain the DeepSeek Harness connection component.',
    );
  }
  const destination = path.join(runtimeDataDir, 'runtime-packages', DSH_AGENT_ID);
  await rm(destination, { force: true, recursive: true });
  await mkdir(destination, { recursive: true });
  await runPackageManager(['--filter', DSH_RUNTIME_PACKAGE_NAME, 'build'], projectRoot);
  await runPackageManager(['-C', packageRoot, 'pack', '--pack-destination', destination], projectRoot);
  const tarballs = (await readdir(destination)).filter((entry) => entry.endsWith('.tgz'));
  const file = tarballs.length === 1 ? tarballs[0] : null;
  if (!file) {
    throw new AgentCompanionSetupError(
      'BUNDLED_COMPANION_INVALID',
      `Expected one DeepSeek Harness connection package, found ${tarballs.length}.`,
    );
  }
  const packageJson = JSON.parse(await readFile(packageJsonPath, 'utf8')) as {
    name?: unknown;
    version?: unknown;
  };
  if (packageJson.name !== DSH_RUNTIME_PACKAGE_NAME || typeof packageJson.version !== 'string') {
    throw new AgentCompanionSetupError('BUNDLED_COMPANION_INVALID', 'Invalid connection package metadata.');
  }
  const sha256 = createHash('sha256').update(await readFile(path.join(destination, file))).digest('hex');
  const manifest: RuntimeManifest = {
    file,
    packageName: DSH_RUNTIME_PACKAGE_NAME,
    schemaVersion: 1,
    sha256,
    version: packageJson.version,
  };
  await writeFile(path.join(destination, 'manifest.json'), `${JSON.stringify(manifest, null, 2)}\n`, 'utf8');
  return destination;
}

async function resolveVerifiedBundle(options: {
  projectRoot: string;
  resourceRoot: string;
  runtimeDataDir: string;
}): Promise<{ bytes: Buffer; manifest: RuntimeManifest }> {
  let directory = path.join(options.resourceRoot, DSH_RUNTIME_RESOURCE_DIRECTORY);
  if (!(await fileExists(path.join(directory, 'manifest.json')))) {
    directory = await materializeDevelopmentBundle(options.projectRoot, options.runtimeDataDir);
  }
  let manifest: RuntimeManifest;
  try {
    manifest = JSON.parse(await readFile(path.join(directory, 'manifest.json'), 'utf8')) as RuntimeManifest;
  } catch {
    throw new AgentCompanionSetupError('BUNDLED_COMPANION_INVALID', 'Invalid connection package manifest.');
  }
  if (
    manifest.schemaVersion !== 1 ||
    manifest.packageName !== DSH_RUNTIME_PACKAGE_NAME ||
    typeof manifest.version !== 'string' ||
    !manifest.version ||
    typeof manifest.file !== 'string' ||
    path.basename(manifest.file) !== manifest.file ||
    !manifest.file.endsWith('.tgz') ||
    !/^[a-f0-9]{64}$/u.test(manifest.sha256)
  ) {
    throw new AgentCompanionSetupError('BUNDLED_COMPANION_INVALID', 'Invalid connection package manifest.');
  }
  const tarballPath = path.join(directory, manifest.file);
  const bytes = await readFile(tarballPath);
  const actualHash = createHash('sha256').update(bytes).digest('hex');
  if (actualHash !== manifest.sha256) {
    throw new AgentCompanionSetupError('BUNDLED_COMPANION_INVALID', 'Connection package integrity check failed.');
  }
  return { bytes, manifest };
}

async function stageVerifiedBundleInProfile(
  env: NodeJS.ProcessEnv,
  manifest: RuntimeManifest,
  bytes: Buffer,
): Promise<string> {
  const relativeDirectory = '.open-design';
  const file = `${manifest.sha256}.tgz`;
  const profileDirectory = resolveOpenDesignProfileDir(env);
  const bundleDirectory = path.join(profileDirectory, relativeDirectory);
  await mkdir(bundleDirectory, { recursive: true });
  await writeFile(path.join(bundleDirectory, file), bytes);
  // dsh runs pnpm with the profile directory as cwd. Keeping this spec
  // relative avoids rc.6's Windows shell forwarder splitting an absolute
  // packaged-app path such as "OpenDesign" at its spaces.
  return `${relativeDirectory}/${file}`;
}

function commandFailureDetail(error: unknown): string | null {
  if (!error || typeof error !== 'object') return null;
  const candidate = error as { code?: unknown; signal?: unknown; stderr?: unknown };
  let stderr = '';
  if (typeof candidate.stderr === 'string') {
    stderr = candidate.stderr.trim();
  } else if (Buffer.isBuffer(candidate.stderr)) {
    stderr = candidate.stderr.toString('utf8').trim();
  }
  const parts = [
    typeof candidate.code === 'string' || typeof candidate.code === 'number'
      ? `code=${candidate.code}`
      : null,
    typeof candidate.signal === 'string' ? `signal=${candidate.signal}` : null,
    stderr ? `stderr=${stderr.slice(-4_000)}` : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(' ') : null;
}

let activeSetup: Promise<AgentCompanionSetupResponse> | null = null;

export function installDeepSeekHarnessCompanion(options: {
  projectRoot: string;
  resourceRoot: string;
  runtimeDataDir: string;
}): Promise<AgentCompanionSetupResponse> {
  if (activeSetup) return activeSetup;
  activeSetup = installDeepSeekHarnessCompanionOnce(options).finally(() => {
    activeSetup = null;
  });
  return activeSetup;
}

async function installDeepSeekHarnessCompanionOnce(options: {
  projectRoot: string;
  resourceRoot: string;
  runtimeDataDir: string;
}): Promise<AgentCompanionSetupResponse> {
  const def = getAgentDef(DSH_AGENT_ID);
  if (!def) {
    throw new AgentCompanionSetupError('BUNDLED_COMPANION_INVALID', 'DeepSeek Harness runtime is not registered.');
  }
  const appConfig = await readAppConfig(options.runtimeDataDir);
  const configuredEnv = agentCliEnvForAgent(appConfig.agentCliEnv, DSH_AGENT_ID);
  const before = await detectAgent(def, configuredEnv);
  const { bytes, manifest } = await resolveVerifiedBundle(options);
  if (before.available) {
    return { action: 'already-compatible', agent: before, ok: true, packageVersion: manifest.version };
  }

  const launch = resolveAgentLaunch(def, configuredEnv);
  if (!launch.launchPath) {
    throw new AgentCompanionSetupError(
      'AGENT_NOT_INSTALLED',
      'DeepSeek Harness is not installed. Install the official dsh CLI, then scan again.',
    );
  }
  const childEnv = applyAgentLaunchEnv(
    spawnEnvForAgent(DSH_AGENT_ID, process.env, configuredEnv),
    launch,
  );
  const profileWasPresent = hasOpenDesignProfile(childEnv);
  const packageSpec = await stageVerifiedBundleInProfile(childEnv, manifest, bytes);
  try {
    await execAgentFile(
      launch.launchPath,
      ['plugin', '--profile', 'open-design', 'add', packageSpec],
      { env: childEnv, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
  } catch (error) {
    console.error(
      '[od] DeepSeek Harness connection component install failed',
      commandFailureDetail(error) ?? 'no command diagnostics were available',
    );
    throw new AgentCompanionSetupError(
      'COMPANION_INSTALL_FAILED',
      'DeepSeek Harness could not install the OpenDesign connection component. No agent selection was changed.',
    );
  }

  const after = await detectAgent(def, configuredEnv);
  if (!after.available) {
    throw new AgentCompanionSetupError(
      'COMPANION_STILL_INCOMPATIBLE',
      'The connection component was installed, but its compatibility check did not pass.',
    );
  }
  const action: AgentCompanionSetupAction = profileWasPresent ? 'repaired' : 'installed';
  return { action, agent: after, ok: true, packageVersion: manifest.version };
}
