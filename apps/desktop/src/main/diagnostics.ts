import { readFile, writeFile } from "node:fs/promises";
import { homedir, userInfo } from "node:os";
import { dirname, join } from "node:path";

import { BrowserWindow, app, dialog, ipcMain, shell } from "electron";

import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  type SidecarStamp,
} from "@open-design/sidecar-proto";
import {
  resolveLogFilePath,
  resolveRuntimeNamespaceRoot,
  type SidecarRuntimeContext,
} from "@open-design/sidecar";
import {
  DIAGNOSTICS_FILENAME_PREFIX,
  buildAgentCliLogSources,
  buildDiagnosticsZip,
  buildRunEventLogSources,
  diagnosticsFileName,
  type LogSource,
} from "@open-design/diagnostics";

export const DESKTOP_DIAGNOSTICS_IPC_CHANNEL = "diagnostics:export-to-file";

const TAIL_BYTES_PER_LOG = 4 * 1024 * 1024;

export type DesktopDiagnosticsExportResult =
  | { ok: true; path: string }
  | { ok: false; cancelled: true }
  | { ok: false; cancelled: false; message: string };

function safeUsername(): string | undefined {
  try {
    const info = userInfo();
    return info?.username && info.username.length > 0 ? info.username : undefined;
  } catch {
    return undefined;
  }
}

function expandTilde(value: unknown): string | null {
  if (typeof value !== "string" || value.trim().length === 0) return null;
  const trimmed = value.trim();
  if (trimmed === "~") return homedir();
  if (trimmed.startsWith("~/")) return join(homedir(), trimmed.slice(2));
  return trimmed;
}

interface AgentHomeOverrides {
  amrOpenCodeHome: string | null;
  claudeConfigDir: string | null;
  codexHome: string | null;
}

// Best-effort read of user `agentCliEnv.<agent>.*` home overrides
// (`OPENCODE_TEST_HOME` / `CLAUDE_CONFIG_DIR` / `CODEX_HOME`) from the daemon's
// app-config, so the log sweep targets the same homes a real run uses. The
// daemon resolves these authoritatively via spawnEnvForAgent; the desktop main
// process may not import daemon internals, so it reads the config file directly
// and applies only leading-`~` expansion (overrides are effectively absolute).
// Missing values fall back to the collector's defaults.
async function readAgentHomeOverrides(dataDir: string): Promise<AgentHomeOverrides> {
  try {
    const raw = await readFile(join(dataDir, "app-config.json"), "utf8");
    const agentCliEnv = (JSON.parse(raw) as {
      agentCliEnv?: Record<string, Record<string, unknown> | undefined>;
    }).agentCliEnv;
    return {
      amrOpenCodeHome: expandTilde(agentCliEnv?.amr?.OPENCODE_TEST_HOME),
      claudeConfigDir: expandTilde(agentCliEnv?.claude?.CLAUDE_CONFIG_DIR),
      codexHome: expandTilde(agentCliEnv?.codex?.CODEX_HOME),
    };
  } catch {
    return { amrOpenCodeHome: null, claudeConfigDir: null, codexHome: null };
  }
}

function buildSidecarLogSources(runtime: SidecarRuntimeContext<SidecarStamp>): LogSource[] {
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
  for (const appKey of apps) {
    const absolutePath = resolveLogFilePath({
      app: appKey,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      runtimeRoot: namespaceRoot,
    });
    sources.push({
      name: `logs/${appKey}/latest.log`,
      absolutePath,
      kind: "text",
      tailBytes: TAIL_BYTES_PER_LOG,
    });
    // Only desktop runs an Electron renderer that writes `renderer.log`
    // (see apps/desktop/src/main/runtime.ts). daemon and web are pure Node
    // services with no renderer process, so listing the file there only
    // produces missing-file placeholders and manifest warnings.
    if (appKey === APP_KEYS.DESKTOP) {
      sources.push({
        name: `logs/${appKey}/renderer.log`,
        absolutePath: join(dirname(absolutePath), "renderer.log"),
        kind: "text",
        tailBytes: TAIL_BYTES_PER_LOG,
      });
    }
  }
  return sources;
}

export async function exportDiagnosticsToFile(
  runtime: SidecarRuntimeContext<SidecarStamp>,
  parentWindow: BrowserWindow | null,
): Promise<DesktopDiagnosticsExportResult> {
  const filename = diagnosticsFileName(DIAGNOSTICS_FILENAME_PREFIX);
  const downloadsDir = (() => {
    try {
      return app.getPath("downloads");
    } catch {
      return homedir();
    }
  })();
  const defaultPath = join(downloadsDir, filename);

  const dialogOptions = {
    title: "Export Open Design diagnostics",
    defaultPath,
    filters: [{ name: "Zip archive", extensions: ["zip"] }],
  };
  const choice = parentWindow != null
    ? await dialog.showSaveDialog(parentWindow, dialogOptions)
    : await dialog.showSaveDialog(dialogOptions);

  if (choice.canceled || choice.filePath == null) {
    return { ok: false, cancelled: true };
  }

  try {
    // The packaged daemon writes its runtime data at `<namespaceRoot>/data`
    // (OD_DATA_DIR), with per-run event logs under `data/runs` and the
    // AMR-managed OpenCode home under `data/amr`. Derive both so this export
    // — the one users actually trigger from the desktop UI — carries the same
    // run/agent diagnostics the daemon HTTP export does, instead of only the
    // three sidecar logs.
    const namespaceRoot = resolveRuntimeNamespaceRoot({
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      runtime,
      runtimeMode: SIDECAR_MODES.RUNTIME,
    });
    const dataDir = join(namespaceRoot, "data");
    const runsDir = join(dataDir, "runs");
    // Honor user `agentCliEnv.<agent>.*` home overrides so relocated CLI homes
    // are not missed; absent values fall back to the collector's defaults.
    const agentHomes = await readAgentHomeOverrides(dataDir);
    const sources: LogSource[] = [
      ...buildSidecarLogSources(runtime),
      ...(await buildRunEventLogSources(runsDir)),
      ...(await buildAgentCliLogSources({
        homeDir: homedir(),
        dataDir,
        amrOpenCodeHome: agentHomes.amrOpenCodeHome,
        claudeConfigDir: agentHomes.claudeConfigDir,
        codexHome: agentHomes.codexHome,
        xdgDataHome: process.env.XDG_DATA_HOME ?? null,
      })),
    ];
    const result = await buildDiagnosticsZip({
      context: {
        app: { name: "open-design", version: app.getVersion(), packaged: app.isPackaged },
        source: "desktop-ipc",
        namespace: runtime.namespace,
        extra: {
          electronVersion: process.versions.electron,
          chromiumVersion: process.versions.chrome,
          base: runtime.base,
          mode: runtime.mode,
          sourceTag: runtime.source,
        },
      },
      sources,
      redaction: { username: safeUsername() },
      crashReports: {
        // Restrict to Open Design's own process names. A generic "Electron"
        // substring would sweep up crash reports from any other Electron app
        // on the host (VS Code, Slack, …) and leak unrelated user data into
        // the support bundle.
        matchSubstrings: ["Open Design", "open-design"],
        withinDays: 7,
        maxReports: 10,
        homeDir: homedir(),
      },
    });
    await writeFile(choice.filePath, result.zip);
    // Reveal the saved file in Finder (macOS) / Explorer (Windows) / file
    // manager (Linux) so the user can drag it into Slack / email without
    // having to navigate manually. Failures here are non-fatal.
    try {
      shell.showItemInFolder(choice.filePath);
    } catch (revealError) {
      console.warn("desktop diagnostics reveal failed", revealError);
    }
    return { ok: true, path: choice.filePath };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { ok: false, cancelled: false, message };
  }
}

export function registerDesktopDiagnosticsIpc(runtime: SidecarRuntimeContext<SidecarStamp>): () => void {
  const handler = async (event: Electron.IpcMainInvokeEvent): Promise<DesktopDiagnosticsExportResult> => {
    const senderWindow = BrowserWindow.fromWebContents(event.sender);
    return await exportDiagnosticsToFile(runtime, senderWindow);
  };
  ipcMain.handle(DESKTOP_DIAGNOSTICS_IPC_CHANNEL, handler);
  return () => {
    ipcMain.removeHandler(DESKTOP_DIAGNOSTICS_IPC_CHANNEL);
  };
}
