import { chmod, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir, userInfo } from 'node:os';
import { dirname, join } from 'node:path';
import { randomUUID } from 'node:crypto';

import { describe, expect, it } from 'vitest';
import JSZip from 'jszip';

import {
  APP_KEYS,
  SIDECAR_MODES,
  SIDECAR_SOURCES,
  type LegacySidecarRuntimeLayout,
} from '@open-design/sidecar-proto';
import type { SidecarRuntimeContext } from '@open-design/sidecar';

import {
  STANDALONE_LAUNCH_WARNING,
  createDiagnosticsExportHandler,
} from '../src/diagnostics-export.js';

interface MockResponse {
  status(code: number): MockResponse;
  setHeader(name: string, value: string): MockResponse;
  end(payload: Buffer): void;
  json(payload: unknown): void;
  capturedStatus?: number;
  capturedPayload?: Buffer;
  capturedJson?: unknown;
}

function mockResponse(): MockResponse {
  const res: MockResponse = {
    status(code) { res.capturedStatus = code; return res; },
    setHeader() { return res; },
    end(payload) { res.capturedPayload = payload; },
    json(payload) { res.capturedJson = payload; },
  };
  return res;
}

interface DiagnosticsManifestFile {
  name: string;
}

describe('diagnostics export handler — non-sidecar launch', () => {
  // Reviewer-requested regression spec: `runDaemonCliStartup()` calls
  // `startDaemonRuntime()` without a runtime context, so plain `od` users
  // hit the diagnostics handler with `options.runtime == null`. The bundle
  // must still produce a valid zip AND surface a manifest warning that
  // file-based logs were not captured, so the operator can tell the
  // diff between "no logs because plain launch" and "no logs because
  // something genuinely broke."
  it('emits a standalone-launch warning when runtime is null', async () => {
    const handler = createDiagnosticsExportHandler({ runtime: null, projectRoot: '/tmp/test-project' });
    const res = mockResponse();
    // Express RequestHandler signature wants three args; the handler only
    // reads `res`, so casting through `unknown` keeps the test focused.
    await handler({} as never, res as never, () => undefined);

    expect(res.capturedStatus).toBe(200);
    expect(res.capturedPayload).toBeInstanceOf(Buffer);
    const zip = await JSZip.loadAsync(res.capturedPayload!);
    const manifestRaw = await zip.file('summary/manifest.json')!.async('string');
    const manifest = JSON.parse(manifestRaw) as {
      warnings: string[];
      files: DiagnosticsManifestFile[];
      extra?: {
        browserUse?: {
          registryPath?: string;
          socketCount?: number;
          candidateCount?: number;
          staleCount?: number;
          probeFailureCategory?: string;
        };
      };
    };
    expect(manifest.warnings).toContain(STANDALONE_LAUNCH_WARNING);
    expect(manifest.extra?.browserUse).toMatchObject({
      registryPath: expect.stringContaining('codex-browser-use'),
      probeFailureCategory: expect.any(String),
    });
    expect(typeof manifest.extra?.browserUse?.socketCount).toBe('number');
    expect(typeof manifest.extra?.browserUse?.candidateCount).toBe('number');
    expect(typeof manifest.extra?.browserUse?.staleCount).toBe('number');
    // Standalone launches intentionally omit sidecar-managed daemon/web/desktop
    // log files, but real developer machines may still contribute matching
    // macOS crash reports from /Library/Logs/DiagnosticReports. Keep the test
    // focused on the contract that no sidecar log files are bundled.
    expect(
      manifest.files.filter((file) => file.name.startsWith('logs/')),
    ).toEqual([]);
  });

  it('reports the AMR session from the Settings-backed agent environment', async () => {
    const dataDir = join(tmpdir(), `od-diag-amr-settings-${randomUUID()}`);
    const runtimeKey = 'settings-only-runtime-key';
    try {
      await mkdir(dataDir, { recursive: true });
      await writeFile(
        join(dataDir, 'app-config.json'),
        JSON.stringify({
          agentCliEnv: {
            amr: {
              OPEN_DESIGN_AMR_PROFILE: 'local',
              VELA_LINK_URL: 'https://settings-only.example.test/link',
              VELA_RUNTIME_KEY: runtimeKey,
            },
          },
        }),
        'utf8',
      );

      const handler = createDiagnosticsExportHandler({
        runtime: null,
        projectRoot: '/tmp/test-project',
        dataDir,
      });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const runtimeHealthRaw = await zip.file('summary/runtime-health.json')!.async('string');
      const runtimeHealth = JSON.parse(runtimeHealthRaw) as {
        amr: {
          profile?: string;
          loggedIn?: boolean;
          sessionState?: string;
          credentialRevision?: string;
        };
      };
      expect(runtimeHealth.amr).toMatchObject({
        profile: 'local',
        loggedIn: true,
        sessionState: 'authenticated',
        credentialRevision: expect.any(String),
      });
      expect(runtimeHealthRaw).not.toContain(runtimeKey);
    } finally {
      await rm(dataDir, { recursive: true, force: true });
    }
  });
});

describe('diagnostics export handler — packaged (runtime) layout', () => {
  // Regression for the namespaceRoot off-by-one that left every packaged
  // bundle without daemon/web logs (the agent-run flow lives in the daemon
  // log). In packaged builds the orchestrator launches each child with
  // `base = <namespaceRoot>/runtime` while the logs live a level up at
  // `<namespaceRoot>/logs`. The old `resolveNamespaceRoot(base, namespace)`
  // resolved the daemon log to `<namespaceRoot>/runtime/<namespace>/logs/...`
  // → ENOENT, so the bundle silently captured nothing.
  it('captures the daemon log from the real <namespaceRoot>/logs tree', async () => {
    const root = join(tmpdir(), `od-diag-${randomUUID()}`);
    const namespaceRoot = join(root, 'namespaces', 'release-stable');
    const daemonLogPath = join(namespaceRoot, 'logs', APP_KEYS.DAEMON, 'latest.log');
    const marker = 'DAEMON-LOG-MARKER critique runId=rc100-poster';
    try {
      await mkdir(dirname(daemonLogPath), { recursive: true });
      await writeFile(daemonLogPath, `${marker}\n`, 'utf8');

      const runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> = {
        app: APP_KEYS.DAEMON,
        // packaged launches children with base == <namespaceRoot>/runtime
        base: join(namespaceRoot, 'runtime'),
        mode: SIDECAR_MODES.RUNTIME,
        namespace: 'release-stable',
        source: SIDECAR_SOURCES.PACKAGED,
      };

      const handler = createDiagnosticsExportHandler({ runtime, projectRoot: '/tmp/test-project' });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);

      // The log must be present with its real contents, not a missing-file
      // placeholder.
      const daemonEntry = zip.file('logs/daemon/latest.log');
      expect(daemonEntry).not.toBeNull();
      expect(await daemonEntry!.async('string')).toContain(marker);

      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: { name: string; bytes: number; error?: string }[];
      };
      const daemonFile = manifest.files.find((f) => f.name === 'logs/daemon/latest.log');
      expect(daemonFile?.error).toBeUndefined();
      expect(daemonFile?.bytes ?? 0).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // The daemon's latest.log is truncated on every packaged launch, so after an
  // incident-triggered relaunch the bundle used to contain only the ~70 lines
  // written since the restart — the incident-time log was gone. The packaged
  // launcher now rotates the prior session's log aside as previous.log; the
  // export must pick it up so support bundles cover the window BEFORE the
  // restart.
  it('bundles the rotated previous daemon log so pre-restart forensics survive a relaunch', async () => {
    const root = join(tmpdir(), `od-diag-prev-${randomUUID()}`);
    const namespaceRoot = join(root, 'namespaces', 'release-stable');
    const daemonLogDir = join(namespaceRoot, 'logs', APP_KEYS.DAEMON);
    const previousMarker = 'PREVIOUS-SESSION-MARKER incident-window collab poller storm';
    try {
      await mkdir(daemonLogDir, { recursive: true });
      await writeFile(join(daemonLogDir, 'latest.log'), 'fresh session line\n', 'utf8');
      await writeFile(join(daemonLogDir, 'previous.log'), `${previousMarker}\n`, 'utf8');

      const runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> = {
        app: APP_KEYS.DAEMON,
        base: join(namespaceRoot, 'runtime'),
        mode: SIDECAR_MODES.RUNTIME,
        namespace: 'release-stable',
        source: SIDECAR_SOURCES.PACKAGED,
      };

      const handler = createDiagnosticsExportHandler({ runtime, projectRoot: '/tmp/test-project' });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);

      const previousEntry = zip.file('logs/daemon/previous.log');
      expect(previousEntry).not.toBeNull();
      expect(await previousEntry!.async('string')).toContain(previousMarker);

      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: { name: string; bytes: number; error?: string }[];
      };
      const previousFile = manifest.files.find((f) => f.name === 'logs/daemon/previous.log');
      expect(previousFile?.error).toBeUndefined();
      expect(previousFile?.bytes ?? 0).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // Guard: previous.log only exists where a rotating launcher (packaged) has
  // produced one. tools-dev appends to latest.log and never rotates, so an
  // unconditional source entry would stamp a missing-file placeholder into
  // every dev bundle — the same noise the renderer.log desktop-only rule
  // exists to avoid. When the file is absent there must be NO manifest entry.
  it('omits previous.log from the manifest entirely when no rotated log exists', async () => {
    const root = join(tmpdir(), `od-diag-noprev-${randomUUID()}`);
    const namespaceRoot = join(root, 'namespaces', 'release-stable');
    const daemonLogDir = join(namespaceRoot, 'logs', APP_KEYS.DAEMON);
    try {
      await mkdir(daemonLogDir, { recursive: true });
      await writeFile(join(daemonLogDir, 'latest.log'), 'first-launch session\n', 'utf8');

      const runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> = {
        app: APP_KEYS.DAEMON,
        base: join(namespaceRoot, 'runtime'),
        mode: SIDECAR_MODES.RUNTIME,
        namespace: 'release-stable',
        source: SIDECAR_SOURCES.PACKAGED,
      };

      const handler = createDiagnosticsExportHandler({ runtime, projectRoot: '/tmp/test-project' });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: { name: string }[];
      };
      expect(manifest.files.map((f) => f.name)).not.toContain('logs/daemon/previous.log');
      expect(zip.file('logs/daemon/previous.log')).toBeNull();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // "Absent" and "unreadable" are different answers and the bundle must not
  // conflate them. A rotated log that EXISTS but cannot be accessed (EACCES on
  // the log directory, an I/O error) previously fell into the same silent
  // omission as first-launch ENOENT, so the one file that would explain an
  // incident vanished with no warning. The collector already models unreadable
  // sources; only a genuine ENOENT may drop the entry.
  // Permission bits do not deny root and do not translate on Windows.
  const skipPermissionTest =
    process.platform === 'win32' || (typeof process.getuid === 'function' && process.getuid() === 0);
  it.skipIf(skipPermissionTest)(
    'records an unreadable rotated log as an error instead of silently dropping it',
    async () => {
      const root = join(tmpdir(), `od-diag-prevdenied-${randomUUID()}`);
      const namespaceRoot = join(root, 'namespaces', 'release-stable');
      const daemonLogDir = join(namespaceRoot, 'logs', APP_KEYS.DAEMON);
      try {
        await mkdir(daemonLogDir, { recursive: true });
        await writeFile(join(daemonLogDir, 'latest.log'), 'fresh session line\n', 'utf8');
        await writeFile(join(daemonLogDir, 'previous.log'), 'pre-restart incident\n', 'utf8');
        // Deny directory traversal: previous.log still EXISTS, but access() and
        // any read of it now fail with EACCES rather than ENOENT.
        await chmod(daemonLogDir, 0o000);

        const runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> = {
          app: APP_KEYS.DAEMON,
          base: join(namespaceRoot, 'runtime'),
          mode: SIDECAR_MODES.RUNTIME,
          namespace: 'release-stable',
          source: SIDECAR_SOURCES.PACKAGED,
        };

        const handler = createDiagnosticsExportHandler({ runtime, projectRoot: '/tmp/test-project' });
        const res = mockResponse();
        await handler({} as never, res as never, () => undefined);

        expect(res.capturedStatus).toBe(200);
        const zip = await JSZip.loadAsync(res.capturedPayload!);
        const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
          files: { name: string; error?: string }[];
          warnings: string[];
        };
        const previousFile = manifest.files.find((f) => f.name === 'logs/daemon/previous.log');
        expect(previousFile).toBeDefined();
        expect(previousFile?.error).toBeTruthy();
        expect(
          manifest.warnings.some((w) => w.startsWith('logs/daemon/previous.log:')),
        ).toBe(true);
      } finally {
        await chmod(daemonLogDir, 0o700).catch(() => undefined);
        await rm(root, { recursive: true, force: true });
      }
    },
  );

  it('reports missing packaged log files under logical log paths without duplicating runtime segments', async () => {
    const root = join(tmpdir(), `od-diag-missing-${randomUUID()}`);
    const namespaceRoot = join(root, 'namespaces', 'release-beta');
    const daemonLogPath = join(namespaceRoot, 'logs', APP_KEYS.DAEMON, 'latest.log');
    try {
      await mkdir(dirname(daemonLogPath), { recursive: true });
      await writeFile(daemonLogPath, 'daemon ok\n', 'utf8');

      const runtime: SidecarRuntimeContext<LegacySidecarRuntimeLayout> = {
        app: APP_KEYS.DAEMON,
        base: join(namespaceRoot, 'runtime'),
        mode: SIDECAR_MODES.RUNTIME,
        namespace: 'release-beta',
        source: SIDECAR_SOURCES.PACKAGED,
      };

      const handler = createDiagnosticsExportHandler({ runtime, projectRoot: '/tmp/test-project' });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: Array<{ name: string; bytes?: number; error?: string }>;
      };
      const fileNames = manifest.files.map((file) => file.name);
      expect(fileNames).toContain('logs/daemon/latest.log');
      expect(fileNames).toContain('logs/web/latest.log');
      expect(fileNames).toContain('logs/desktop/latest.log');
      expect(fileNames.some((name) => name.includes('runtime/release-beta/logs'))).toBe(false);

      const webLog = manifest.files.find((file) => file.name === 'logs/web/latest.log');
      const desktopLog = manifest.files.find((file) => file.name === 'logs/desktop/latest.log');
      expect(webLog?.error).toBeTruthy();
      expect(desktopLog?.error).toBeTruthy();
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

});

describe('diagnostics export handler — run event logs', () => {
  it('bundles recent per-run events.jsonl logs for agent stream forensics', async () => {
    const root = join(tmpdir(), `od-diag-runs-${randomUUID()}`);
    const runsDir = join(root, 'runs');
    const runLogPath = join(runsDir, 'run-3165', 'events.jsonl');
    const marker = 'Agent stalled without emitting any new output for 600s';
    try {
      await mkdir(dirname(runLogPath), { recursive: true });
      await writeFile(
        runLogPath,
        JSON.stringify({
          event: 'agent',
          data: { type: 'raw', line: marker },
        }) + '\n',
        'utf8',
      );

      const handler = createDiagnosticsExportHandler({
        runtime: null,
        projectRoot: '/tmp/test-project',
        runsDir,
      });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const runEntry = zip.file('runs/run-3165/events.jsonl');
      expect(runEntry).not.toBeNull();
      expect(await runEntry!.async('string')).toContain(marker);

      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        files: { name: string; bytes: number; error?: string }[];
        warnings: string[];
      };
      const runFile = manifest.files.find((file) => file.name === 'runs/run-3165/events.jsonl');
      expect(runFile?.error).toBeUndefined();
      expect(runFile?.bytes ?? 0).toBeGreaterThan(0);
      expect(
        manifest.warnings.some((warning) =>
          warning.includes('may contain conversation content and artifact excerpts'),
        ),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('keeps failed run forensics useful while redacting credentials and user paths', async () => {
    const root = join(tmpdir(), `od-diag-runs-sensitive-${randomUUID()}`);
    const runsDir = join(root, 'runs');
    const runLogPath = join(runsDir, 'run-sensitive', 'events.jsonl');
    const username = userInfo().username;
    const homePath = `/Users/${username}/open-design/project`;
    const secretBearer = 'od_bearer_secret_12345';
    const secretQuery = 'query-token-secret';
    const secretApiKey = 'api-key-secret';
    const stderrMarker = 'Agent failed while calling upstream provider';
    try {
      await mkdir(dirname(runLogPath), { recursive: true });
      await writeFile(
        runLogPath,
        [
          {
            event: 'stderr',
            data: {
              chunk: stderrMarker,
            },
          },
          {
            event: 'stderr',
            data: {
              chunk: `Authorization: Bearer ${secretBearer}`,
            },
          },
          {
            event: 'stderr',
            data: {
              chunk: `GET https://provider.example/v1/models?access_token=${secretQuery}`,
            },
          },
          {
            event: 'stderr',
            data: {
              chunk: `provider api_key=${secretApiKey}`,
            },
          },
          {
            event: 'stderr',
            data: {
              chunk: `cwd ${homePath}`,
            },
          },
          {
            event: 'error',
            data: {
              message: 'Provider rejected the request after auth forwarding.',
              code: 'AGENT_EXECUTION_FAILED',
            },
          },
          {
            event: 'diagnostic',
            data: {
              type: 'agent_runtime',
              phase: 'agent-call',
              stderr_present: true,
            },
          },
        ].map((entry) => JSON.stringify(entry)).join('\n') + '\n',
        'utf8',
      );

      const handler = createDiagnosticsExportHandler({
        runtime: null,
        projectRoot: '/tmp/test-project',
        runsDir,
      });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const runEntry = zip.file('runs/run-sensitive/events.jsonl');
      expect(runEntry).not.toBeNull();
      const runLog = await runEntry!.async('string');
      expect(runLog).toContain(stderrMarker);
      expect(runLog).toContain('AGENT_EXECUTION_FAILED');
      expect(runLog).toContain('agent_runtime');
      expect(runLog).toContain('Bearer [REDACTED]');
      expect(runLog).toContain('access_token=[REDACTED]');
      expect(runLog).toContain('api_key=[REDACTED]');
      expect(runLog).toContain('/Users/<USER>/open-design/project');
      expect(runLog).not.toContain(secretBearer);
      expect(runLog).not.toContain(secretQuery);
      expect(runLog).not.toContain(secretApiKey);
      expect(runLog).not.toContain(homePath);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // The 2MB run-event tail used to be a hard byte cut from the file head, so
  // the first kept line was almost always half a JSON object — and a bundle
  // consumer streaming the file through a jsonl parser fell over on line 1.
  // Truncation must advance to the next line boundary so every kept line is
  // complete JSON.
  it('keeps the truncated events.jsonl tail line-aligned so the first line is valid JSON', async () => {
    const root = join(tmpdir(), `od-diag-trunc-${randomUUID()}`);
    const runsDir = join(root, 'runs');
    const runLogPath = join(runsDir, 'run-trunc', 'events.jsonl');
    // Every line is exactly 100 bytes (99 JSON chars + newline). 21000 lines =
    // 2,100,000 bytes > the 2 MiB (2,097,152) tail cap, and the resulting cut
    // offset (2,100,000 - 2,097,152 = 2,848) deterministically lands mid-line
    // (2,848 % 100 = 48) — so an unaligned truncation ALWAYS yields a broken
    // first line rather than passing by luck.
    const lineFor = (seq: number): string =>
      `{"seq":"${String(seq).padStart(6, '0')}","pad":"${'a'.repeat(74)}"}\n`;
    const lineCount = 21_000;
    try {
      await mkdir(dirname(runLogPath), { recursive: true });
      const lines: string[] = [];
      for (let seq = 0; seq < lineCount; seq += 1) lines.push(lineFor(seq));
      await writeFile(runLogPath, lines.join(''), 'utf8');

      const handler = createDiagnosticsExportHandler({
        runtime: null,
        projectRoot: '/tmp/test-project',
        runsDir,
      });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const runEntry = zip.file('runs/run-trunc/events.jsonl');
      expect(runEntry).not.toBeNull();
      const content = await runEntry!.async('string');

      // Tail semantics: the newest events survive, within the byte budget.
      expect(content.length).toBeLessThanOrEqual(2 * 1024 * 1024);
      expect(content).toContain(`"seq":"0${lineCount - 1}"`);

      // The whole point: line 1 of the kept tail must parse as JSON.
      const firstLine = content.slice(0, content.indexOf('\n'));
      expect(() => JSON.parse(firstLine)).not.toThrow();
      const parsed = JSON.parse(firstLine) as { seq: string };
      expect(Number(parsed.seq)).toBeGreaterThan(0);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  // The pathological end of the same contract: ONE event larger than the whole
  // 2 MiB tail budget. No complete line fits in the window at all, so there is
  // nothing to align to — and shipping the middle of that record would put a
  // JSON fragment on line 1, exactly the breakage line alignment exists to
  // prevent. The bundle must say the file was omitted instead of quietly
  // exporting half an object.
  it('omits an event record larger than the tail cap instead of exporting a fragment', async () => {
    const root = join(tmpdir(), `od-diag-giant-${randomUUID()}`);
    const runsDir = join(root, 'runs');
    const runLogPath = join(runsDir, 'run-giant', 'events.jsonl');
    try {
      await mkdir(dirname(runLogPath), { recursive: true });
      // A single record comfortably past the 2 MiB cap, so the tail window
      // holds only the interior of this one line.
      const giant = `{"seq":"000000","pad":"${'a'.repeat(2 * 1024 * 1024 + 64)}"}\n`;
      await writeFile(runLogPath, giant, 'utf8');

      const handler = createDiagnosticsExportHandler({
        runtime: null,
        projectRoot: '/tmp/test-project',
        runsDir,
      });
      const res = mockResponse();
      await handler({} as never, res as never, () => undefined);

      expect(res.capturedStatus).toBe(200);
      const zip = await JSZip.loadAsync(res.capturedPayload!);
      const runEntry = zip.file('runs/run-giant/events.jsonl');
      expect(runEntry).not.toBeNull();
      const content = await runEntry!.async('string');

      // Never a bare fragment of the record.
      expect(content.startsWith('; file unavailable: ')).toBe(true);
      expect(content).not.toContain('"pad":"aaa');

      // ...and the bundle explains itself rather than losing the file silently.
      const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
        warnings: string[];
      };
      expect(
        manifest.warnings.some((w) => w.startsWith('runs/run-giant/events.jsonl:')),
      ).toBe(true);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  });

  it('warns when runsDir is set but no per-run event logs were found', async () => {
    // An empty/absent runs dir adds no manifest file entries, so without an
    // explicit warning an empty bundle is indistinguishable from a healthy run
    // — exactly the gap that made an AMR loop look like "nothing happened."
    const runsDir = join(tmpdir(), `od-diag-empty-runs-${randomUUID()}`);
    const handler = createDiagnosticsExportHandler({
      runtime: null,
      projectRoot: '/tmp/test-project',
      runsDir,
    });
    const res = mockResponse();
    await handler({} as never, res as never, () => undefined);

    expect(res.capturedStatus).toBe(200);
    const zip = await JSZip.loadAsync(res.capturedPayload!);
    const manifest = JSON.parse(await zip.file('summary/manifest.json')!.async('string')) as {
      warnings: string[];
    };
    expect(manifest.warnings.some((w) => w.includes('No per-run event logs found'))).toBe(true);
  });
});
