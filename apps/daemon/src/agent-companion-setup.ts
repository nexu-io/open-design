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
import { hasOpenDesignProfile } from './runtimes/defs/deepseek-harness.js';

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
      'This Open Design build does not contain the DeepSeek Harness connection component.',
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
}): Promise<{ manifest: RuntimeManifest; tarballPath: string }> {
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
  const actualHash = createHash('sha256').update(await readFile(tarballPath)).digest('hex');
  if (actualHash !== manifest.sha256) {
    throw new AgentCompanionSetupError('BUNDLED_COMPANION_INVALID', 'Connection package integrity check failed.');
  }
  return { manifest, tarballPath };
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
  const { manifest, tarballPath } = await resolveVerifiedBundle(options);
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
  try {
    await execAgentFile(
      launch.launchPath,
      ['plugin', '--profile', 'open-design', 'add', tarballPath],
      { env: childEnv, timeout: 120_000, maxBuffer: 2 * 1024 * 1024 },
    );
  } catch {
    throw new AgentCompanionSetupError(
      'COMPANION_INSTALL_FAILED',
      'DeepSeek Harness could not install the Open Design connection component. No agent selection was changed.',
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
