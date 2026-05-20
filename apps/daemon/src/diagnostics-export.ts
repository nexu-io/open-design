import { homedir, userInfo } from 'node:os';
import { dirname } from 'node:path';

import type { RequestHandler } from 'express';

import {
  buildDiagnosticsZip,
  DIAGNOSTICS_CONTENT_TYPE,
  DIAGNOSTICS_FILENAME_PREFIX,
  diagnosticsFileName,
  type LogSource,
} from '@open-design/diagnostics';
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  type SidecarStamp,
} from '@open-design/sidecar-proto';
import {
  resolveLogFilePath,
  resolveNamespaceRoot,
  type SidecarRuntimeContext,
} from '@open-design/sidecar';

import { readCurrentAppVersionInfo } from './app-version.js';

export interface DiagnosticsHandlerOptions {
  /** Sidecar runtime context, present when daemon is launched via tools-dev or packaged sidecar. */
  runtime: SidecarRuntimeContext<SidecarStamp> | null;
  /** Project root used to derive crash-report match strings. */
  projectRoot: string;
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
  const namespaceRoot = resolveNamespaceRoot({
    base: runtime.base,
    contract: OPEN_DESIGN_SIDECAR_CONTRACT,
    namespace: runtime.namespace,
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
    }
  }
  return sources;
}

export function createDiagnosticsExportHandler(options: DiagnosticsHandlerOptions): RequestHandler {
  return async (_req, res) => {
    try {
      const versionInfo = await readCurrentAppVersionInfo().catch(() => null);
      const sources = buildSidecarLogSources(options.runtime);
      const username = safeUsername();
      const home = homedir();

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
          },
          warnings: options.runtime == null ? [STANDALONE_LAUNCH_WARNING] : undefined,
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
