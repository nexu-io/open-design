// @ts-nocheck
/**
 * @module cli/mcp/install
 */
import { AGENT_SLUGS, applyJsonInstall, isAgentSlug, planAgentInstall, removeJsonInstall } from '../../mcp-agent-install.js';
import { parseFlags, positionalArgs } from '../core/index.js';
import { resolveMcpLaunchSpec } from './mcp.js';

// Hoisted next to MCP_*_FLAGS for the same TDZ reason as the MEDIA flags
// above: `od mcp install <agent>` dispatches through SUBCOMMAND_MAP during
// top-level module evaluation, and runMcpInstall references these `const`
// Sets — defining them next to runMcpInstall lower in the file would hit
// the TDZ.
const MCP_INSTALL_STRING_FLAGS = new Set([
  'daemon-url',
  'name',
]);

const MCP_INSTALL_CLI_PROBE_FLAG = 'open-design-cli-probe';

const MCP_INSTALL_CLI_PROBE_TOKEN = 'open-design-cli:mcp-install:v1';

const MCP_INSTALL_BOOLEAN_FLAGS = new Set([
  'help',
  'h',
  MCP_INSTALL_CLI_PROBE_FLAG,
  'json',
  'print',
  'dry-run',
  'uninstall',
  'remove',
]);

function emitInstallResult(useJson, result) {
  if (useJson) {
    console.log(JSON.stringify(result));
    return;
  }
  if (result.ok) {
    console.log(`✓ ${result.message}`);
  } else {
    console.error(`✗ ${result.message}`);
  }
}

export async function runMcpInstall(args) {
  let flags;
  try {
    flags = parseFlags(args, {
      string: MCP_INSTALL_STRING_FLAGS,
      boolean: MCP_INSTALL_BOOLEAN_FLAGS,
    });
  } catch (err) {
    console.error(err.message);
    printMcpInstallHelp();
    process.exit(2);
  }
  if (flags[MCP_INSTALL_CLI_PROBE_FLAG]) {
    console.log(MCP_INSTALL_CLI_PROBE_TOKEN);
    return;
  }
  if (flags.help || flags.h) {
    printMcpInstallHelp();
    return;
  }

  const slug = positionalArgs(args, MCP_INSTALL_STRING_FLAGS)[0];
  const useJson = Boolean(flags.json);
  if (!slug) {
    console.error('missing agent slug');
    printMcpInstallHelp();
    process.exit(2);
  }
  if (!isAgentSlug(slug)) {
    const msg = `unknown agent: ${slug} (expected one of: ${AGENT_SLUGS.join(' ')})`;
    emitInstallResult(useJson, { ok: false, agent: slug, message: msg });
    process.exit(2);
  }

  const uninstall = Boolean(flags.uninstall || flags.remove);
  const dryRun = Boolean(flags.print || flags['dry-run']);
  const serverName = flags.name || 'open-design';

  const os = await import('node:os');
  const spec = await resolveMcpLaunchSpec(flags);
  const plan = planAgentInstall(slug, spec, {
    home: os.homedir(),
    platform: process.platform,
    serverName,
  });

  if (plan.kind === 'manual') {
    const result = {
      ok: false,
      agent: slug,
      kind: 'manual',
      configPath: plan.configPath,
      format: plan.format,
      snippet: plan.snippet,
      message: `${slug}: manual setup required. ${plan.reason}`,
    };
    if (useJson) {
      console.log(JSON.stringify(result));
    } else {
      console.error(`› ${result.message}`);
      if (plan.configPath) console.error(`  Config: ${plan.configPath}`);
      console.error(`  Add this ${plan.format} block:\n`);
      console.log(plan.snippet);
    }
    return;
  }

  if (plan.kind === 'cli') {
    const argv = uninstall ? plan.removeArgv : plan.addArgv;
    if (dryRun) {
      emitInstallResult(useJson, {
        ok: true,
        agent: slug,
        kind: 'cli',
        command: `${plan.bin} ${argv.join(' ')}`,
        message: `would run: ${plan.bin} ${argv.join(' ')}`,
      });
      return;
    }
    const { spawn } = await import('node:child_process');
    const code = await new Promise((resolve) => {
      const child = spawn(plan.bin, argv, { stdio: 'inherit' });
      child.on('error', (err) => {
        console.error(`✗ failed to run ${plan.bin}: ${err.message}`);
        resolve(127);
      });
      child.on('exit', (c) => resolve(c ?? 0));
    });
    if (code !== 0) {
      emitInstallResult(useJson, {
        ok: false,
        agent: slug,
        kind: 'cli',
        message: `${plan.bin} exited with code ${code}`,
      });
      process.exit(code || 1);
    }
    emitInstallResult(useJson, {
      ok: true,
      agent: slug,
      kind: 'cli',
      message: uninstall
        ? `removed ${serverName} from ${slug}`
        : `installed ${serverName} into ${slug}`,
    });
    return;
  }

  // plan.kind === 'json'
  const fs = await import('node:fs/promises');
  const path = await import('node:path');
  let existing = null;
  try {
    existing = await fs.readFile(plan.configPath, 'utf8');
  } catch (err) {
    if (err && err.code !== 'ENOENT') throw err;
  }

  if (uninstall) {
    const next = removeJsonInstall(existing, plan);
    if (next == null) {
      emitInstallResult(useJson, {
        ok: true,
        agent: slug,
        kind: 'json',
        configPath: plan.configPath,
        message: `${serverName} not present in ${plan.configPath} — nothing to remove`,
      });
      return;
    }
    if (dryRun) {
      emitInstallResult(useJson, {
        ok: true,
        agent: slug,
        kind: 'json',
        configPath: plan.configPath,
        preview: next,
        message: `would update ${plan.configPath}`,
      });
      return;
    }
    await fs.writeFile(plan.configPath, next, 'utf8');
    emitInstallResult(useJson, {
      ok: true,
      agent: slug,
      kind: 'json',
      configPath: plan.configPath,
      message: `removed ${serverName} from ${plan.configPath}`,
    });
    return;
  }

  const next = applyJsonInstall(existing, plan);
  if (dryRun) {
    emitInstallResult(useJson, {
      ok: true,
      agent: slug,
      kind: 'json',
      configPath: plan.configPath,
      preview: next,
      message: `would write ${plan.configPath}`,
    });
    return;
  }
  await fs.mkdir(path.dirname(plan.configPath), { recursive: true });
  await fs.writeFile(plan.configPath, next, 'utf8');
  emitInstallResult(useJson, {
    ok: true,
    agent: slug,
    kind: 'json',
    configPath: plan.configPath,
    message: `installed ${serverName} into ${plan.configPath}`,
  });
}

function printMcpInstallHelp() {
  console.log(`Usage: od mcp install <agent> [options]

Register Open Design's stdio MCP server into a coding agent's own config.

Agents:
  ${AGENT_SLUGS.join(' ')}

Options:
  --uninstall, --remove   Remove the Open Design MCP server instead.
  --print, --dry-run      Show what would change; write nothing.
  --json                  Machine-readable result.
  --name <name>           MCP server name in the agent config (default: open-design).
  --daemon-url <url>      Daemon URL used to resolve the launch command.

The launch command is resolved from the running daemon's
/api/mcp/install-info, so the installed entry matches the Settings → MCP
panel snippet byte-for-byte. Start the daemon first for an exact match;
otherwise a minimal \`od mcp --daemon-url <url>\` command is used.`);
}
