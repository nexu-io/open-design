import { spawn } from 'node:child_process';
import { dirname, join } from 'node:path';
import {
  LauncherLaunchError,
  readLauncherLaunchTarget,
  resolveLauncherCliContext,
  type LauncherCliContextOptions,
  type LauncherLaunchTarget,
} from '@open-design/launcher-proto';

type LauncherCommand = 'open' | 'path' | '--version';
type CliFlags = Pick<LauncherCliContextOptions, 'channel' | 'configPath' | 'namespace' | 'root'> & { help: boolean; json: boolean };

export const PACKAGED_LAUNCHER_CLI_HELP = `Usage:
  od open [--channel <name>] [--namespace <name>] [--json]
  od path [--channel <name>] [--namespace <name>] [--json]
  od --version [--channel <name>] [--namespace <name>] [--json]

Open the packaged app or report its selected version and stable app path.
These commands work while the app and daemon are stopped.

Options:
  --channel <name>    Release channel (default: inherited packaged channel or stable).
  --namespace <name>  Packaged namespace (default: discover the installed namespace).
  --root <path>       Launcher installation root override.
  --config <path>     Read packaged identity and root from this config file.
  --json              Print the resolved version, paths, channel and namespace as JSON.
  -h, --help          Show this help.

od version [--json] remains the running daemon's /api/version report.`;

function parseFlags(args: string[]): CliFlags {
  const flags: CliFlags = { help: false, json: false };
  const names = { '--channel': 'channel', '--namespace': 'namespace', '--root': 'root', '--config': 'configPath' } as const;
  for (let index = 0; index < args.length; index += 1) {
    const item = args[index];
    if (item == null) continue;
    if (item === '--help' || item === '-h') { flags.help = true; continue; }
    if (item === '--json') { flags.json = true; continue; }
    const equals = item.indexOf('=');
    const option = (equals < 0 ? item : item.slice(0, equals)) as keyof typeof names;
    const key = names[option];
    if (key == null) throw new LauncherLaunchError('invalid-arguments', `Unknown launcher argument: ${item}`);
    if (flags[key] != null) throw new LauncherLaunchError('invalid-arguments', `Duplicate launcher option: ${option}`);
    const value = equals < 0 ? args[++index] : item.slice(equals + 1);
    if (value == null || value.length === 0 || value.startsWith('-')) {
      throw new LauncherLaunchError('invalid-arguments', `${option} requires a value.`);
    }
    flags[key] = value;
  }
  return flags;
}

export async function openLauncherTarget(target: LauncherLaunchTarget, options: { env?: NodeJS.ProcessEnv; platform?: NodeJS.Platform } = {}): Promise<void> {
  const platform = options.platform ?? process.platform;
  const env = { ...options.env ?? process.env, OD_PACKAGED_NAMESPACE: target.namespace, OD_PACKAGED_NAMESPACE_BASE_ROOT: join(target.root, 'namespaces') };
  // A launcher command can itself run under an agent's Node/sidecar environment.
  // The app must enter desktop mode instead of inheriting that process identity.
  // Config has already selected the target's identity and root; the child must
  // read that target's own resources, even when explicit flags changed channel.
  for (const key of Object.keys(env)) {
    if (key === 'ELECTRON_RUN_AS_NODE' || key === 'OD_PACKAGED_CONFIG_PATH' || key.startsWith('OD_SIDECAR_') || key === 'OD_TOOLS_DEV_PARENT_PID') delete env[key as keyof typeof env];
  }
  if (platform !== 'darwin' && platform !== 'win32') throw new LauncherLaunchError('unsupported-platform', `The packaged launcher is not supported on ${platform}.`);
  await new Promise<void>((done, reject) => {
    const child = spawn(target.executablePath, [], { cwd: dirname(target.executablePath), detached: true, env, stdio: 'ignore', windowsHide: true });
    child.once('error', reject);
    child.once('spawn', () => { child.unref(); done(); });
  });
}

export async function runPackagedLauncherCli(command: LauncherCommand, args: string[], dependencies: {
  env?: NodeJS.ProcessEnv;
  platform?: NodeJS.Platform;
  resolveContext?: typeof resolveLauncherCliContext;
  readTarget?: typeof readLauncherLaunchTarget;
  openTarget?: typeof openLauncherTarget;
  stdout?: (message: string) => void;
  stderr?: (message: string) => void;
} = {}): Promise<number> {
  const stdout = dependencies.stdout ?? ((message: string) => { process.stdout.write(message); });
  const stderr = dependencies.stderr ?? ((message: string) => { process.stderr.write(message); });
  const wantJson = args.includes('--json');
  try {
    const flags = parseFlags(args);
    if (flags.help) { stdout(`${PACKAGED_LAUNCHER_CLI_HELP}\n`); return 0; }
    const platform = dependencies.platform ?? process.platform;
    const env = dependencies.env ?? process.env;
    const context = await (dependencies.resolveContext ?? resolveLauncherCliContext)({ ...flags, env, platform });
    const target = await (dependencies.readTarget ?? readLauncherLaunchTarget)({ ...context, platform });
    if (command === 'open') await (dependencies.openTarget ?? openLauncherTarget)(target, { env, platform });
    if (flags.json) stdout(`${JSON.stringify({ ...target, ...(command === 'open' ? { opened: true } : {}) }, null, 2)}\n`);
    else if (command === 'path') stdout(`${target.launchPath}\n`);
    else stdout(`${target.version}\n${target.launchPath}\n`);
    return 0;
  } catch (error) {
    const code = error instanceof LauncherLaunchError ? error.code : 'launcher-failed';
    const message = error instanceof Error ? error.message : String(error);
    stderr(wantJson ? `${JSON.stringify({ ok: false, error: { code, message } })}\n` : `${message}\n`);
    return code === 'invalid-arguments' ? 2 : 1;
  }
}
