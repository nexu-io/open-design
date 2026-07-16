import { homedir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';

import type { RequestHandler } from 'express';

import {
  buildAgentCliLogSources,
  buildDiagnosticsZip,
  buildRunEventLogSources,
  DIAGNOSTICS_CONTENT_TYPE,
  DIAGNOSTICS_FILENAME_PREFIX,
  diagnosticsFileName,
  type LogSource,
} from '@open-design/diagnostics';
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  type SidecarStamp,
} from '@open-design/sidecar-proto';
import {
  resolveLogFilePath,
  resolveRuntimeNamespaceRoot,
  type SidecarRuntimeContext,
} from '@open-design/sidecar';

import { readCurrentAppVersionInfo } from './app-version.js';
import { agentCliEnvForAgent, readAppConfig } from './app-config.js';
import { spawnEnvForAgent } from './agents.js';
import { collectBrowserUseDiscoveryFacts } from './browser/index.js';

interface ResolvedAgentHomes {
  amrOpenCodeHome: string | null;
  claudeConfigDir: string | null;
  codexHome: string | null;
  openCodeXdgDataHome: string | null;
}

// Resolve each agent CLI's effective home (OPENCODE_TEST_HOME / CLAUDE_CONFIG_DIR
// / CODEX_HOME) exactly as a real run would, by running the live
// `spawnEnvForAgent` resolver over the user's app-config overrides. This makes
// the diagnostics sweep honor `agentCliEnv.<agent>.*` relocations instead of
// only looking under the hardcoded defaults, and cannot drift from the spawn
// path. Returns nulls on any failure; the collector then falls back to defaults.
async function resolveAgentHomes(dataDir: string | null | undefined): Promise<ResolvedAgentHomes> {
  const empty: ResolvedAgentHomes = {
    amrOpenCodeHome: null,
    claudeConfigDir: null,
    codexHome: null,
    openCodeXdgDataHome: null,
  };
  if (!dataDir) return empty;
  try {
    const appConfig = await readAppConfig(dataDir);
    const envFor = (agentId: string) =>
      spawnEnvForAgent(
        agentId,
        { ...process.env, OD_DATA_DIR: dataDir },
        agentCliEnvForAgent(appConfig.agentCliEnv, agentId),
      );
    const clean = (value: string | undefined): string | null => {
      const trimmed = value?.trim();
      return trimmed && trimmed.length > 0 ? trimmed : null;
    };
    return {
      amrOpenCodeHome: clean(envFor('amr').OPENCODE_TEST_HOME),
      claudeConfigDir: clean(envFor('claude').CLAUDE_CONFIG_DIR),
      codexHome: clean(envFor('codex').CODEX_HOME),
      // OpenCode resolves its data/log dir from XDG_DATA_HOME; sandbox mode
      // rewrites that (sandbox-mode.ts), so read the EFFECTIVE value from the
      // opencode spawn env rather than the host's, or the sweep misses the
      // logs in a sandboxed runtime.
      openCodeXdgDataHome: clean(envFor('opencode').XDG_DATA_HOME),
    };
  } catch {
    return empty;
  }
}

export interface DiagnosticsHandlerOptions {
  /** Sidecar runtime context, present when daemon is launched via tools-dev or packaged sidecar. */
  runtime: SidecarRuntimeContext<SidecarStamp> | null;
  /** Project root used to derive crash-report match strings. */
  projectRoot: string;
  /** Directory containing per-run event logs at <runsDir>/<runId>/events.jsonl. */
  runsDir?: string | null;
  /** Open Design data dir (OD_DATA_DIR), used to locate the AMR OpenCode home. */
  dataDir?: string | null;
}

const TAIL_BYTES_PER_LOG = 4 * 1024 * 1024;

function safeUsername(): string | undefined {
  try {
    const info = userInfo();
    return info?.username && info.username.length > 0 ? info.username : undefined;
  } catch {
    return undefined;
  }
}

export const STANDALONE_LAUNCH_WARNING =
  "Daemon started without a sidecar runtime (plain `od` / standalone launch); " +
  "file-based logs are not captured. Re-run via `pnpm tools-dev` or the packaged " +
  "desktop app to include daemon/web/desktop log files in the bundle.";

function buildSidecarLogSources(runtime: SidecarRuntimeContext<SidecarStamp> | null): LogSource[] {
  if (runtime == null) return [];
  // In packaged builds `runtime.base` is `<namespaceRoot>/runtime`, so the log
  // tree lives a level UP at `<namespaceRoot>/logs`; `resolveRuntimeNamespaceRoot`
  // accounts for that (a plain `resolveNamespaceRoot` here resolved every
  // daemon/web log to an ENOENT phantom path and captured none of them).
  const namespaceRoot = resolveRuntimeNamespaceRoot({
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtime,
    runtimeMode: SIDECAR_MODES.RUNTIME,
  });
  const apps = [APP_KEYS.DAEMON, APP_KEYS.WEB, APP_KEYS.DESKTOP];
  const sources: LogSource[] = [];
  for (const app of apps) {
    const absolutePath = resolveLogFilePath({
      app,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      runtimeRoot: namespaceRoot,
    });
    sources.push({
      name: `logs/${app}/latest.log`,
      absolutePath,
      kind: 'text',
      tailBytes: TAIL_BYTES_PER_LOG,
    });
    // Only desktop runs an Electron renderer that writes `renderer.log`
    // (see apps/desktop/src/main/runtime.ts). daemon and web are pure Node
    // services with no renderer process, so listing the file there only
    // produces missing-file placeholders and manifest warnings.
    if (app === APP_KEYS.DESKTOP) {
      sources.push({
        name: `logs/${app}/renderer.log`,
        absolutePath: `${dirname(absolutePath)}/renderer.log`,
        kind: 'text',
        tailBytes: TAIL_BYTES_PER_LOG,
      });
      // GPU + system snapshot the desktop main writes at startup. For a native
      // renderer crash (e.g. a GPU/V8 CHECK, exit 0x80000003) this answers "is
      // hardware acceleration on / which driver / is a feature blocklisted",
      // which the text logs alone can't.
      sources.push({
        name: `logs/${app}/gpu-info.json`,
        absolutePath: `${dirname(absolutePath)}/gpu-info.json`,
        kind: 'json',
      });
    }
  }
  return sources;
}

// The desktop relocates Electron's crashDumps to `<logs/desktop>/crashes` (see
// apps/desktop/src/main/crash-diagnostics.ts) so the minidumps live inside the
// same log tree this export already collects. Derive that dir the same way.
function resolveDesktopCrashDumpsDir(runtime: SidecarRuntimeContext<SidecarStamp> | null): string | null {
  if (runtime == null) return null;
  const namespaceRoot = resolveRuntimeNamespaceRoot({
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtime,
    runtimeMode: SIDECAR_MODES.RUNTIME,
  });
  const desktopLog = resolveLogFilePath({
    app: APP_KEYS.DESKTOP,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    runtimeRoot: namespaceRoot,
  });
  return join(dirname(desktopLog), 'crashes');
}

export function createDiagnosticsExportHandler(options: DiagnosticsHandlerOptions): RequestHandler {
  return async (_req, res) => {
    try {
      const versionInfo = await readCurrentAppVersionInfo().catch(() => null);
      const home = homedir();
      const agentHomes = await resolveAgentHomes(options.dataDir);
      const browserUse = collectBrowserUseDiscoveryFacts();
      const runEventSources = await buildRunEventLogSources(options.runsDir);
      const sources = [
        ...buildSidecarLogSources(options.runtime),
        ...runEventSources,
        ...(await buildAgentCliLogSources({
          homeDir: home,
          dataDir: options.dataDir ?? null,
          amrOpenCodeHome: agentHomes.amrOpenCodeHome,
          claudeConfigDir: agentHomes.claudeConfigDir,
          codexHome: agentHomes.codexHome,
          xdgDataHome: agentHomes.openCodeXdgDataHome ?? process.env.XDG_DATA_HOME ?? null,
        })),
      ];
      const username = safeUsername();
      const crashDumpsDir = resolveDesktopCrashDumpsDir(options.runtime);

      // Surface "expected-but-empty" so a reader can tell a collection gap
      // apart from "no runs happened". buildRunEventLogSources returns [] both
      // when the dir is missing AND when persistence is off, adding no manifest
      // entries — without this note an empty bundle looks like a clean run.
      const warnings: string[] = [];
      if (options.runtime == null) warnings.push(STANDALONE_LAUNCH_WARNING);
      if (options.runsDir && runEventSources.length === 0) {
        warnings.push(
          `No per-run event logs found under ${options.runsDir}. Either no chat ` +
            `runs have executed in this data dir, or run-event persistence is ` +
            `disabled (server.ts createChatRunService runsLogDir).`,
        );
      }

      const result = await buildDiagnosticsZip({
        context: {
          app: {
            name: 'open-design',
            version: versionInfo?.version,
            channel: versionInfo?.channel,
            packaged: versionInfo?.packaged,
          },
          source: 'daemon-http',
          namespace: options.runtime?.namespace,
          extra: {
            runtimeAvailable: options.runtime != null,
            sourceTag: options.runtime?.source ?? null,
            mode: options.runtime?.mode ?? null,
            base: options.runtime?.base ?? null,
            projectRoot: options.projectRoot,
            browserUse,
          },
          warnings: warnings.length > 0 ? warnings : undefined,
        },
        sources,
        redaction: { username },
        crashReports: {
          // Restrict to Open Design's own process names. A generic "Electron"
          // substring would sweep up crash reports from any other Electron
          // app on the host (VS Code, Slack, …) and leak unrelated user data
          // into the support bundle.
          matchSubstrings: ['Open Design', 'open-design'],
          withinDays: 7,
          maxReports: 10,
          homeDir: home,
        },
        // Electron minidumps the desktop relocated into the log tree. These carry
        // the native crash stack — the only reliable root-cause for an opaque
        // renderer abort like 0x80000003 that no text log captures.
        ...(crashDumpsDir != null
          ? { crashDumps: { dir: crashDumpsDir, withinDays: 14, maxDumps: 10 } }
          : {}),
      });

      const filename = diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX);
      res.setHeader('Content-Type', DIAGNOSTICS_CONTENT_TYPE);
      res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      res.setHeader('Cache-Control', 'no-store');
      res.status(200).end(result.zip);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ error: 'DIAGNOSTICS_EXPORT_FAILED', message });
    }
  };
}
