import { access, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { homedir, tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';

import type { RequestHandler } from 'express';

import {
  buildAgentCliLogSources,
  buildAgentSessionSources,
  buildDiagnosticsZip,
  buildRunEventLogSources,
  DIAGNOSTICS_CONTENT_TYPE,
  DIAGNOSTICS_FILENAME_PREFIX,
  diagnosticsFileName,
  readRunAgentSession,
  AGENT_SESSION_TAIL_BYTES,
  readAgentSessionWindow,
  selectAgentSessionLines,
  type AgentSessionAgent,
  type AgentSessionTimeWindow,
  type AutomaticDiagnosticSource,
  type LogSource,
} from '@open-design/diagnostics';
import {
  APP_KEYS,
  OPEN_DESIGN_SIDECAR_CONTRACT,
  SIDECAR_MODES,
  type LegacySidecarRuntimeLayout,
} from '@open-design/sidecar-proto';
import {
  resolveLogFilePath,
  resolveRuntimeNamespaceRoot,
  type SidecarRuntimeContext,
} from '@open-design/sidecar';

import { readCurrentAppVersionInfo } from './app-version.js';
import {
  CHAT_SCROLL_FORENSICS_SUMMARY_FILE,
  buildChatScrollForensicsSummary,
} from './diagnostics-client-evidence.js';
import { agentCliEnvForAgent, readAppConfig } from './app-config.js';
import { spawnEnvForAgent } from './agents.js';
import { collectBrowserUseDiscoveryFacts } from './browser/index.js';
import { readRecentApiFailures } from './http/api-failure-journal.js';
import {
  createDiagnosticsEvidence,
  diagnosticsEvidencePaths,
  getDiagnosticsEvidence,
  type DiagnosticsEvidence,
} from './services/diagnostics-evidence.js';
import { diagnosticId } from './services/diagnostics-environment.js';
import { daemonHealthPaths } from './services/daemon-health.js';
import { readVelaLoginStatus } from './integrations/vela.js';
import { exportOpenCodeSession, openCodeDatabaseExists } from './opencode-session-export.js';

interface ResolvedDiagnosticsAgentEnvironment {
  amrHome: string | null;
  amrOpenCodeHome: string | null;
  amrConfiguredEnv: Record<string, string>;
  claudeConfigDir: string | null;
  codexHome: string | null;
  openCodeXdgDataHome: string | null;
}

// Resolve agent diagnostics inputs through the same Settings → spawn-environment
// helpers used by the daemon's process launcher. This keeps login status and log
// discovery aligned with the environment that the daemon passes to each agent.
// Returns empty values on failure so collectors can fall back to their defaults.
async function resolveDiagnosticsAgentEnvironment(
  dataDir: string | null | undefined,
): Promise<ResolvedDiagnosticsAgentEnvironment> {
  const empty: ResolvedDiagnosticsAgentEnvironment = {
    amrHome: null,
    amrOpenCodeHome: null,
    amrConfiguredEnv: {},
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
      amrHome: clean(envFor('amr').AMR_HOME),
      amrOpenCodeHome: clean(envFor('amr').OPENCODE_TEST_HOME),
      amrConfiguredEnv: agentCliEnvForAgent(appConfig.agentCliEnv, 'amr'),
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
  evidence?: DiagnosticsEvidence;
  /** Sidecar runtime context, present when daemon is launched via tools-dev or packaged sidecar. */
  runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> | null;
  /** Project root used to derive crash-report match strings. */
  projectRoot: string;
  /** Directory containing per-run event logs at <runsDir>/<runId>/events.jsonl. */
  runsDir?: string | null;
  /** OpenDesign data dir (OD_DATA_DIR), used to locate the AMR OpenCode home. */
  dataDir?: string | null;
  automaticUploadStatus?: () => Record<string, unknown>;
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

export const RUN_EVENT_CONTENT_WARNING =
  'Per-run event logs may contain conversation content and artifact excerpts. ' +
  'Review the bundle before sharing it.';

/**
 * Whether an optional log source should be listed at all.
 *
 * ENOENT is the ordinary "this launcher never produced one" answer and must
 * drop the entry silently — tools-dev appends to latest.log and never rotates,
 * so listing a phantom would stamp a placeholder into every dev bundle.
 *
 * Any OTHER access failure means the file is THERE but unreachable (EACCES on
 * the log directory, EIO, ENOTDIR). Treating that as absence would make the
 * one log that explains an incident vanish without a word, so the source stays
 * listed and `collectLogSource` records the real error — a bundle that says
 * "unreadable, here is why" beats a bundle that quietly says nothing.
 */
async function shouldListOptionalSource(path: string): Promise<boolean> {
  try {
    await access(path);
    return true;
  } catch (error) {
    return (error as NodeJS.ErrnoException | null)?.code !== "ENOENT";
  }
}

/**
 * The daemon's rotated prior-session log (see `openLog` in
 * apps/packaged/src/sidecars.ts), resolved exactly as the bundle does, or null
 * for launchers that keep none (standalone `od`; tools-dev appends instead).
 */
export function resolveDaemonPreviousLogPath(
  runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> | null,
): string | null {
  if (runtime == null) return null;
  try {
    const namespaceRoot = resolveRuntimeNamespaceRoot({
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      runtime,
      runtimeMode: SIDECAR_MODES.RUNTIME,
    });
    const latest = resolveLogFilePath({
      app: APP_KEYS.DAEMON,
      contract: OPEN_DESIGN_SIDECAR_CONTRACT,
      runtimeRoot: namespaceRoot,
    });
    return `${dirname(latest)}/previous.log`;
  } catch {
    return null;
  }
}

async function buildSidecarLogSources(
  runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> | null,
): Promise<LogSource[]> {
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
    // The packaged launcher truncates latest.log on every start and rotates
    // the prior session's file aside as previous.log (apps/packaged/src/
    // sidecars.ts openLog). After an incident-triggered relaunch that rotated
    // file IS the incident-time log, so bundle it whenever it exists. The
    // entry is existence-conditional because non-rotating launchers
    // (tools-dev appends to latest.log) never produce one, and listing it
    // unconditionally would stamp missing-file placeholders and manifest
    // noise into every dev bundle — the same reason renderer.log stays
    // desktop-only above.
    const previousLogPath = `${dirname(absolutePath)}/previous.log`;
    if (await shouldListOptionalSource(previousLogPath)) {
      sources.push({
        name: `logs/${app}/previous.log`,
        absolutePath: previousLogPath,
        kind: 'text',
        tailBytes: TAIL_BYTES_PER_LOG,
      });
    }
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
function resolveDesktopCrashDumpsDir(runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> | null): string | null {
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

/**
 * AMR's runtime log (`$AMR_HOME/logs/agent-runtime.jsonl`) is shared by every run.
 * `opencode_session_created` carries the Open Design run id; later records such as
 * `opencode_event_stream_failure` only carry the OpenCode session id. Keep this run's
 * records and its sessions' records until another run takes a session over.
 */
export function selectAmrRuntimeRunLines(runId: string): (lines: string[]) => string[] {
  return (lines) => {
    const sessions = new Set<string>();
    return lines.filter((line) => {
      let record: Record<string, unknown>;
      try { record = JSON.parse(line) as Record<string, unknown>; } catch { return false; }
      const session = typeof record.opencodeSessionId === 'string' ? record.opencodeSessionId : '';
      if (record.event === 'opencode_session_created' && session) {
        if (record.openDesignRunId === runId) sessions.add(session); else sessions.delete(session);
      }
      return record.openDesignRunId === runId || (session !== '' && sessions.has(session));
    });
  };
}

async function buildAmrRuntimeLogSources(
  amrHome: string | null,
  incident: { runId?: string; agentId?: string },
  agentLogCount: number,
): Promise<AutomaticDiagnosticSource[]> {
  const name = 'agent-cli-logs/amr/agent-runtime.jsonl';
  const absolutePath = join(amrHome ?? join(homedir(), '.amr'), 'logs', 'agent-runtime.jsonl');
  const exists = await access(absolutePath).then(() => true, () => false);
  // The consent baseline needs the shared file itself; incidents only take their run's records.
  if (incident.agentId === '*') return exists ? [{ name, absolutePath, kind: 'text' }] : [];
  const sources: AutomaticDiagnosticSource[] = [];
  if (!exists) sources.push({ name, absolutePath, kind: 'text', omitReason: 'source_not_found' });
  else if (!incident.runId) sources.push({ name, absolutePath, kind: 'text', omitReason: 'run_id_unavailable' });
  else sources.push({ name, absolutePath, kind: 'text', tailBytes: TAIL_BYTES_PER_LOG,
    selectLines: selectAmrRuntimeRunLines(incident.runId) });
  // AMR keeps OpenCode session logs under per-conversation homes that are not located yet.
  if (agentLogCount === 0) sources.push({ name: 'agent-cli-logs/amr/opencode', absolutePath: '', kind: 'text',
    omitReason: 'source_not_located' });
  return sources;
}

/** Automatic uploads select the failing run and its runtime; manual exports remain broader. */
export async function buildAutomaticDiagnosticSources(
  options: DiagnosticsHandlerOptions,
  incident: { runId?: string; agentId?: string },
): Promise<AutomaticDiagnosticSource[]> {
  const sources: AutomaticDiagnosticSource[] = [];
  if (incident.runId && /^[A-Za-z0-9_-]{1,128}$/.test(incident.runId) && options.runsDir) {
    sources.push({ name: `runs/${incident.runId}/events.jsonl`,
      absolutePath: join(options.runsDir, incident.runId, 'events.jsonl'), kind: 'text', tailBytes: TAIL_BYTES_PER_LOG });
  }
  sources.push(...await buildSidecarLogSources(options.runtime));
  if (incident.agentId) {
    const environment = await resolveDiagnosticsAgentEnvironment(options.dataDir);
    const agentSources = await buildAgentCliLogSources({ homeDir: homedir(), dataDir: options.dataDir ?? null,
      amrOpenCodeHome: environment.amrOpenCodeHome, claudeConfigDir: environment.claudeConfigDir,
      codexHome: environment.codexHome, xdgDataHome: environment.openCodeXdgDataHome ?? null });
    const selected = agentSources.filter((source) => incident.agentId === '*' || source.name.startsWith(`agent-cli-logs/${incident.agentId}/`));
    sources.push(...selected);
    if (incident.agentId === 'amr' || incident.agentId === '*') {
      const amrLogs = selected.filter((source) => source.name.startsWith('agent-cli-logs/amr/')).length;
      sources.push(...await buildAmrRuntimeLogSources(environment.amrHome, incident, amrLogs));
    }
    if (isSessionAgent(incident.agentId) && incident.runId && options.runsDir) {
      sources.push(...await buildRunAgentSessionSources(join(options.runsDir, incident.runId, 'events.jsonl'),
        incident.agentId, environment));
    }
    if (incident.agentId === 'opencode' && incident.runId && options.runsDir) {
      sources.push(...await buildRunOpenCodeSessionSources(join(options.runsDir, incident.runId, 'events.jsonl'), environment));
    }
  }
  return sources;
}

const SESSION_AGENTS: readonly AgentSessionAgent[] = ['claude', 'codex'];
function isSessionAgent(agentId: string | undefined): agentId is AgentSessionAgent {
  return SESSION_AGENTS.includes(agentId as AgentSessionAgent);
}

/**
 * The run's own Claude Code / Codex session record (main agent and subagents),
 * limited to the run's time span. A missing record is reported, not dropped.
 */
async function buildRunAgentSessionSources(
  eventsPath: string,
  agent: AgentSessionAgent,
  environment: ResolvedDiagnosticsAgentEnvironment,
): Promise<AutomaticDiagnosticSource[]> {
  const placeholder = (omitReason: string): AutomaticDiagnosticSource[] =>
    [{ name: `agent-sessions/${agent}`, absolutePath: '', kind: 'text', omitReason }];
  const session = await readRunAgentSession(eventsPath);
  if (!session) return placeholder('session_id_unavailable');
  const found = await buildAgentSessionSources(session, {
    homeDir: homedir(), agents: [agent],
    claudeConfigDir: environment.claudeConfigDir, codexHome: environment.codexHome,
  });
  if (found.length === 0) return placeholder('source_not_located');
  // Select the run's records before any byte cap, fenced by the consent time.
  return found.map(({ agent: _agent, ...source }) => ({
    ...source,
    render: (notBeforeMs: number | null) => readAgentSessionWindow(source.absolutePath, [session],
      { maxBytes: source.tailBytes ?? AGENT_SESSION_TAIL_BYTES, notBeforeMs }),
  }));
}

function openCodeXdgDataHome(environment: ResolvedDiagnosticsAgentEnvironment): string {
  return environment.openCodeXdgDataHome ?? process.env.XDG_DATA_HOME?.trim() ?? join(homedir(), '.local', 'share');
}

/** The run's OpenCode session tree, exported from opencode.db at bundle time and fenced by record time. */
async function buildRunOpenCodeSessionSources(
  eventsPath: string,
  environment: ResolvedDiagnosticsAgentEnvironment,
): Promise<AutomaticDiagnosticSource[]> {
  const placeholder = (omitReason: string): AutomaticDiagnosticSource[] =>
    [{ name: 'agent-sessions/opencode', absolutePath: '', kind: 'text', omitReason }];
  const session = await readRunAgentSession(eventsPath);
  if (!session) return placeholder('session_id_unavailable');
  const xdg = openCodeXdgDataHome(environment);
  if (!openCodeDatabaseExists(xdg)) return placeholder('source_not_located');
  return [{
    name: `agent-sessions/opencode/${session.sessionId}.jsonl`,
    absolutePath: join(xdg, 'opencode', 'opencode.db'),
    kind: 'text',
    tailBytes: AGENT_SESSION_TAIL_BYTES,
    render: async (notBeforeMs) => exportOpenCodeSession(xdg, session.sessionId, [session], notBeforeMs),
    selectLines: selectAgentSessionLines(session.startMs, session.endMs),
  }];
}

/**
 * Native sessions of the runs the export includes, one entry per file, written
 * into `scratchDir` (removed by the caller after zipping): Claude Code / Codex
 * session files reduced to the run's records, so the ZIP's tail cap cannot
 * drop them, and OpenCode sessions exported from opencode.db. Runs that resume
 * the same session share it, so the entry keeps every such run's records.
 */
async function buildExportedRunSessionSources(
  runEventSources: LogSource[],
  environment: ResolvedDiagnosticsAgentEnvironment,
  scratchDir: string,
): Promise<LogSource[]> {
  const files = new Map<string, { source: LogSource; windows: AgentSessionTimeWindow[] }>();
  const openCodeSessions = new Map<string, AgentSessionTimeWindow[]>();
  const xdg = openCodeXdgDataHome(environment);
  const openCodeDb = openCodeDatabaseExists(xdg);
  for (const runSource of runEventSources) {
    const session = await readRunAgentSession(runSource.absolutePath);
    if (!session) continue;
    const found = await buildAgentSessionSources(session, {
      homeDir: homedir(), claudeConfigDir: environment.claudeConfigDir, codexHome: environment.codexHome,
    });
    for (const { agent: _agent, ...source } of found) {
      const file = files.get(source.absolutePath);
      if (file) file.windows.push(session);
      else files.set(source.absolutePath, { source, windows: [session] });
    }
    if (found.length > 0 || !openCodeDb) continue;
    const windows = openCodeSessions.get(session.sessionId);
    if (windows) windows.push(session);
    else openCodeSessions.set(session.sessionId, [session]);
  }
  const sources: LogSource[] = [];
  for (const { source, windows } of files.values()) {
    let selected: string;
    try {
      selected = await readAgentSessionWindow(source.absolutePath, windows,
        { maxBytes: source.tailBytes ?? AGENT_SESSION_TAIL_BYTES });
    } catch {
      continue;
    }
    if (!selected) continue;
    const absolutePath = join(scratchDir, `${sources.length}.jsonl`);
    await writeFile(absolutePath, selected);
    sources.push({ ...source, absolutePath });
  }
  for (const [sessionId, windows] of openCodeSessions) {
    let exported = '';
    try { exported = exportOpenCodeSession(xdg, sessionId, windows, null); } catch { continue; }
    if (!exported) continue;
    // Rows are already limited to the windows; this only stubs oversized lines.
    const span = selectAgentSessionLines(Math.min(...windows.map((w) => w.startMs)), Math.max(...windows.map((w) => w.endMs)));
    const absolutePath = join(scratchDir, `${sessionId}.jsonl`);
    await writeFile(absolutePath, span(exported.split('\n')).join('\n'));
    sources.push({ name: `agent-sessions/opencode/${sessionId}.jsonl`, absolutePath, kind: 'text', tailBytes: AGENT_SESSION_TAIL_BYTES });
  }
  return sources;
}

export function createDiagnosticsExportHandler(options: DiagnosticsHandlerOptions): RequestHandler {
  const evidence = options.evidence ?? getDiagnosticsEvidence() ?? createDiagnosticsEvidence();
  return async (_req, res) => {
    const scratchDir = await mkdtemp(join(tmpdir(), 'od-diagnostics-sessions-'));
    try {
      const versionInfo = await readCurrentAppVersionInfo().catch(() => null);
      const home = homedir();
      const agentEnvironment = await resolveDiagnosticsAgentEnvironment(options.dataDir);
      const browserUse = collectBrowserUseDiscoveryFacts();
      const runEventSources = await buildRunEventLogSources(options.runsDir);
      const sources = [
        ...(await buildSidecarLogSources(options.runtime)),
        ...runEventSources,
        ...(await buildExportedRunSessionSources(runEventSources, agentEnvironment, scratchDir)),
        ...(await buildAgentCliLogSources({
          homeDir: home,
          dataDir: options.dataDir ?? null,
          amrOpenCodeHome: agentEnvironment.amrOpenCodeHome,
          claudeConfigDir: agentEnvironment.claudeConfigDir,
          codexHome: agentEnvironment.codexHome,
          xdgDataHome: agentEnvironment.openCodeXdgDataHome ?? process.env.XDG_DATA_HOME ?? null,
        })),
      ];
      await evidence.refresh();
      if (options.dataDir) {
        const paths = diagnosticsEvidencePaths(options.dataDir);
        for (const [name, absolutePath] of [['latest', paths.current], ['previous', paths.previous]] as const) {
          if (await shouldListOptionalSource(absolutePath)) sources.push({
            name: `logs/diagnostics/environment-evidence.${name}.json`, absolutePath, kind: 'json', tailBytes: 256 * 1024,
          });
        }
        const health = daemonHealthPaths(options.dataDir);
        for (const [name, absolutePath] of [['latest', health.current], ['previous', health.previous]] as const) {
          if (await shouldListOptionalSource(absolutePath)) sources.push({
            name: `logs/diagnostics/daemon-health.${name}.json`, absolutePath, kind: 'json', tailBytes: 256 * 1024,
          });
        }
      }
      const username = safeUsername();
      const crashDumpsDir = resolveDesktopCrashDumpsDir(options.runtime);

      // Surface "expected-but-empty" so a reader can tell a collection gap
      // apart from "no runs happened". buildRunEventLogSources returns [] both
      // when the dir is missing AND when persistence is off, adding no manifest
      // entries — without this note an empty bundle looks like a clean run.
      const warnings: string[] = [];
      if (options.runtime == null) warnings.push(STANDALONE_LAUNCH_WARNING);
      if (runEventSources.length > 0) warnings.push(RUN_EVENT_CONTENT_WARNING);
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
        summaries: {
          'automatic-log-upload.json': (() => {
            try { return options.automaticUploadStatus?.() ?? { available: false }; }
            catch { return { available: false, reason: 'status_unavailable' }; }
          })(),
          'environment-evidence.json': evidence.snapshot(),
          // Renderer-side scene for the chat scroll freeze. Always written,
          // even when nothing was posted, so an empty slot reads as a stated
          // fact instead of a missing file. See diagnostics-client-evidence.ts.
          [CHAT_SCROLL_FORENSICS_SUMMARY_FILE]: {
            ...buildChatScrollForensicsSummary(),
            app: {
              version: versionInfo?.version ?? null,
              channel: versionInfo?.channel ?? null,
              packaged: versionInfo?.packaged ?? null,
              platform: versionInfo?.platform ?? null,
              arch: versionInfo?.arch ?? null,
            },
          },
          'recent-api-failures.json': {
            retainedLimit: 100,
            privacy:
              'Request bodies, query strings, messages, credentials, and resource identifiers are not recorded.',
            failures: readRecentApiFailures(),
          },
          'runtime-health.json': {
            daemon: { reachable: true },
            amr: (() => {
              try {
                const status = readVelaLoginStatus(
                  process.env,
                  agentEnvironment.amrConfiguredEnv,
                );
                return {
                  profile: status.profile,
                  userId: diagnosticId(status.user?.id),
                  loggedIn: status.loggedIn,
                  sessionState: status.sessionState,
                  credentialRevision: status.credentialRevision,
                  loginInFlight: status.loginInFlight,
                };
              } catch (error) {
                return {
                  error: error instanceof Error ? error.message : String(error),
                };
              }
            })(),
            coverage: {
              runEventsPresent: runEventSources.length > 0,
              note: runEventSources.length > 0
                ? 'Per-run events were included.'
                : 'The failure may have happened before a run was created; inspect daemon logs and AMR session state.',
            },
          },
        },
        redaction: { username },
        crashReports: {
          // Restrict to OpenDesign's own process names. A generic "Electron"
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
    } finally {
      await rm(scratchDir, { recursive: true, force: true }).catch(() => undefined);
    }
  };
}
