import { readFileSync } from "node:fs";
import { stripTypeScriptTypes } from "node:module";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { API } from "@typescript/native/unstable/sync";
import * as ts from "@typescript/native/unstable/ast";
import type { Node, SourceFile } from "@typescript/native/unstable/ast";
import { describe, expect, it, vi } from "vitest";
import { createStartupTiming, attachStartupReadyIpc } from "../../src/main/startup-timing.js";

function withMainSource<T>(relativePath: string, run: (ast: SourceFile) => T): T {
  const file = fileURLToPath(new URL(`../../src/main/${relativePath}`, import.meta.url));
  const compiler = new API();
  try {
    using snapshot = compiler.updateSnapshot({ openFiles: [file] });
    const ast = snapshot.getDefaultProjectForFile(file)?.program.getSourceFile(file);
    if (!ast) throw new Error(`Native TypeScript could not parse ${file}`);
    return run(ast);
  } finally {
    compiler.close();
  }
}

function fixture() {
  let clock = 100;
  const events: { event: string; properties: Record<string, unknown> }[] = [];
  const timing = createStartupTiming({
    startupType: "cold", startedAt: "2026-10-16T00:00:00.000Z", startTime: 0,
    now: () => clock, id: (() => { let n = 0; return () => `id-${++n}`; })(),
    report: async (event, properties) => { events.push({ event, properties }); },
  });
  return { timing, events, advance: (ms: number) => { clock += ms; } };
}

describe("process entry to business Ready", () => {
  it("retains early stages, measures monotonically and requires business readiness AND window reveal", () => {
    const { timing, events, advance } = fixture();
    timing.mark("electron_ready");
    advance(50);
    timing.mark("daemon_ready");
    advance(25);
    timing.mark("web_ready");
    const context = timing.context();
    expect(timing.businessReady({ ...context, required_data_ready: true, actions_ready: true })).toBe(true);
    expect(events.map(e => e.event)).toEqual(["client_launch_attempt"]);
    advance(25);
    timing.mark("window_revealed");
    timing.mark("window_revealed");
    timing.businessReady({ ...context, required_data_ready: true, actions_ready: true });
    expect(events.map(e => e.event)).toEqual(["client_launch_attempt", "client_business_ready", "client_launch_result"]);
    expect(events[2]?.properties).toMatchObject({
      ...context, startup_type: "cold", outcome: "ready", duration_ms: 200,
      measurement_start: "process_entry", os_launch_time_available: false,
      stage_offsets_ms: { electron_ready: 100, daemon_ready: 150, web_ready: 175, business_ready: 175, window_revealed: 200 },
      stage_durations_ms: { electron_ready: 100, daemon_ready: 50, web_ready: 25, business_ready: 0, window_revealed: 25 },
    });
    expect(events[0]?.properties.event_id).not.toBe(events[1]?.properties.event_id);
  });

  it("never treats mount/load or stale/incomplete signals as Ready", () => {
    const { timing, events } = fixture();
    timing.mark("window_revealed");
    expect(timing.businessReady({ ...timing.context(), required_data_ready: false, actions_ready: true })).toBe(false);
    expect(timing.businessReady({ ...timing.context(), launch_attempt_id: "stale", required_data_ready: true, actions_ready: true })).toBe(false);
    expect(timing.businessReady(null)).toBe(false);
    expect(events).toHaveLength(1);
    timing.finish("cancelled", "quit_before_ready");
    expect(events.at(-1)?.properties).toMatchObject({ outcome: "cancelled", duration_ms: 100, failure_stage: "window_revealed" });
    expect(timing.businessReady({ ...timing.context(), required_data_ready: true, actions_ready: true })).toBe(false);
  });

  it("records one failure with missing phases absent rather than zero", () => {
    const { timing, events } = fixture();
    timing.mark("daemon_spawning");
    timing.finish("failed", "daemon-start");
    timing.finish("cancelled", "quit_before_ready");
    expect(events).toHaveLength(2);
    expect(events[1]?.properties).toMatchObject({ outcome: "failed", reason: "daemon-start", failure_stage: "daemon_spawning" });
    expect((events[1]?.properties.stage_offsets_ms as object)).not.toHaveProperty("web_ready");
  });

  it("does not let a rejected reporter affect launch or Ready", async () => {
    const timing = createStartupTiming({ startupType: "warm", report: async () => { throw new Error("offline"); } });
    timing.mark("window_revealed");
    expect(timing.businessReady({ ...timing.context(), required_data_ready: true, actions_ready: true })).toBe(true);
    await timing.flush();
  });

  it("buffers early events until a reporter is armed without changing their time", async () => {
    const report = vi.fn(async (_event: string, _properties: Record<string, unknown>) => undefined);
    const timing = createStartupTiming({ startupType: "cold", startedAt: "2026-10-16T00:00:00.000Z", now: () => 500 });
    timing.finish("failed", "daemon-start");
    timing.setReporter(report);
    timing.setReporter(report);
    await timing.flush();
    expect(report).toHaveBeenCalledTimes(2);
    expect(report.mock.calls[0]).toEqual(["client_launch_attempt", expect.objectContaining({ occurred_at: "2026-10-16T00:00:00.000Z" })]);
    expect(report.mock.calls[1]).toEqual(["client_launch_result", expect.objectContaining({ duration_ms: 500 })]);
  });

  it("keeps a warm process launch at the main process origin", () => {
    const report = vi.fn(async (_event: string, _properties: Record<string, unknown>) => undefined);
    const timing = createStartupTiming({ startupType: "warm", now: () => 500, report });
    timing.finish("cancelled", "quit_before_ready");
    expect(report.mock.calls[1]).toEqual(["client_launch_result", expect.objectContaining({
      measurement_start: "process_entry", startup_type: "warm", launch_type: "warm", duration_ms: 500,
    })]);
  });
});

it("the real IPC authorization rejects subframes, pets, foreign origins and destroyed senders", () => {
  const callback = withMainSource("index.ts", (ast) => {
    let found = "";
    function visit(node: Node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "authorize") found = node.initializer.getText(ast);
      node.forEachChild(visit);
    }
    visit(ast);
    return found;
  });
  expect(callback).not.toBe("");
  const js = stripTypeScriptTypes(`const authorize = ${callback};`);
  const authorize = runInNewContext(`${js}\nauthorize`, {
    URL, BrowserWindow: { fromWebContents: (sender: unknown) => ({ webContents: sender }) },
    desktop: { status: () => ({ url: "od://app/" }), ownsWebContents: (id: number) => id === 1 },
  }) as (event: unknown) => boolean;
  const mainFrame = {};
  const event = { sender: { id: 1, mainFrame, isDestroyed: () => false, getURL: () => "od://app/" }, senderFrame: mainFrame };
  expect(authorize(event)).toBe(true);
  expect(authorize({ ...event, senderFrame: {} })).toBe(false);
  expect(authorize({ ...event, sender: { ...event.sender, id: 2, getURL: () => "od://app/pet" } })).toBe(false);
  expect(authorize({ ...event, sender: { ...event.sender, getURL: () => "od://app/project/a" } })).toBe(true);
  for (const url of ["https://foreign.invalid/", "not-a-url"]) {
    expect(authorize({ ...event, sender: { ...event.sender, getURL: () => url } })).toBe(false);
  }
  expect(authorize({ ...event, sender: { ...event.sender, isDestroyed: () => true } })).toBe(false);
});

it("the real desktop reveal callback records a phase without declaring business Ready", () => {
  const callback = withMainSource("index.ts", (ast) => {
    let found = "";
    function visit(node: Node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "onMainWindowReady") found = node.initializer.getText(ast);
      node.forEachChild(visit);
    }
    visit(ast);
    return found;
  });
  expect(callback).not.toBe("");
  const { timing, events } = fixture();
  const js = stripTypeScriptTypes(`const reveal = ${callback}; reveal();`);
  runInNewContext(js, {
    startupTiming: timing, recordIncomingUpdateLifecycle: vi.fn(),
    recordIncomingUpdateStageResults: vi.fn(),
    process: { getSystemVersion: () => 'test-os', platform: 'darwin', arch: 'arm64' },
    options: {}, updater: { config: {} },
  });
  timing.finish("cancelled", "quit_before_ready");
  expect(events.at(-1)?.properties.stage_offsets_ms).toHaveProperty("window_revealed");
  expect(events.some(e => e.event === "client_business_ready")).toBe(false);
});

it("exposes correlation and accepts Ready only from the authorized main frame, disposing both handlers", () => {
  const handlers = new Map<string, (event: unknown, payload?: unknown) => unknown>();
  const ipc = { handle: (name: string, fn: (event: unknown, payload?: unknown) => unknown) => { handlers.set(name, fn); }, removeHandler: vi.fn() };
  const { timing, events } = fixture();
  timing.mark("window_revealed");
  const allowed = {};
  const dispose = attachStartupReadyIpc({ ipc, timing: () => timing, authorize: event => event === allowed });
  expect(handlers.get("od:startup:context")?.({})).toBeNull();
  expect(handlers.get("od:startup:context")?.(allowed)).toEqual(timing.context());
  const signal = { ...timing.context(), required_data_ready: true, actions_ready: true };
  expect(handlers.get("od:startup:business-ready")?.({}, signal)).toBe(false);
  expect(events).toHaveLength(1);
  expect(handlers.get("od:startup:business-ready")?.(allowed, signal)).toBe(true);
  dispose();
  expect(ipc.removeHandler.mock.calls.flat()).toEqual(["od:startup:context", "od:startup:business-ready"]);
});

it('uses the main process origin even for a warm process launch and serializes all three durations', async () => {
  const { parseClientMetricEvent, buildClientTelemetryParams } = await import('@open-design/contracts/analytics');
  let clock = 500;
  const reports: { event: string; properties: Record<string, unknown> }[] = [];
  const timing = createStartupTiming({ startupType: 'cold', launchType: 'warm', now: () => clock,
    report: async (event, properties) => { reports.push({ event, properties }); } });
  timing.mark('window_revealed'); clock = 600;
  timing.businessReady({ ...timing.context(), readiness_point: 'first_visible' });
  clock = 800;
  timing.businessReady({ ...timing.context(), readiness_point: 'interactive_ready', required_data_ready: true, actions_ready: true });
  expect(reports.at(-1)?.properties).toMatchObject({ launch_type: 'warm', launch_to_window_shown: 500,
    launch_to_first_visible: 600, launch_to_interactive: 800, duration_ms: 800, result: 'ready' });
  for (const { event, properties } of reports) {
    const common = buildClientTelemetryParams(properties, { eventId: 'event', deviceId: 'install', appVersion: '1.0.0',
      clientType: 'desktop', captureSource: 'desktop/test', env: 'test', reportedAt: new Date().toISOString() });
    expect(parseClientMetricEvent(event, { ...properties, ...common })).not.toBeNull();
  }
});

it('the actual preload bridge invokes only the two startup IPC channels', async () => {
  const property = withMainSource('preload.cts', (ast) => {
    let found = '';
    function visit(node: Node) {
      if (ts.isPropertyAssignment(node) && node.name.getText(ast) === 'startup') found = node.getText(ast);
      node.forEachChild(visit);
    }
    visit(ast);
    return found;
  });
  const invoke = vi.fn(async () => true);
  const code = stripTypeScriptTypes(`({ ${property} }).startup`);
  const bridge = runInNewContext(code, { ipcRenderer: { invoke } }) as {
    context(): Promise<unknown>; signal(value: unknown): Promise<unknown>;
  };
  await bridge.context();
  const signal = { launch_attempt_id: 'launch', app_session_id: 'session', readiness_point: 'first_visible' };
  await bridge.signal(signal);
  expect(invoke.mock.calls).toEqual([['od:startup:context'], ['od:startup:business-ready', signal]]);
});


it("does not time same-process headless window restoration or its retry", async () => {
  const code = withMainSource("index.ts", (ast) => ast.statements
    .filter((node) => ts.isFunctionDeclaration(node)
      && ["runDesktopMain", "createDesktopStartupTiming"].includes(node.name?.text ?? ""))
    .map((node) => node.getText(ast).replace(/^export /, "")).join("\n"));
  const marker = vi.fn(() => ({ launchType: "cold", end: vi.fn() }));
  const report = vi.fn(async () => undefined);
  let calls = 0;
  const run = runInNewContext(stripTypeScriptTypes(`${code}; runDesktopMain;`), {
    createStartupTiming, beginLaunchMarker: marker,
    app: { getPath: () => "unused", getVersion: () => "1.0.0", once: vi.fn() }, process: { once: vi.fn() },
    runDesktopMainWithTiming: async (_runtime: unknown, _options: unknown, timing: ReturnType<typeof createStartupTiming>) => {
      timing.setReporter(report);
      timing.mark("window_revealed");
      timing.businessReady({ ...timing.context(), required_data_ready: true, actions_ready: true });
      if (++calls === 1) throw new Error("restore failed");
      return "restored";
    },
  }) as (runtime: unknown, options: unknown) => Promise<unknown>;
  await expect(run({}, { startupTiming: null })).rejects.toThrow("restore failed");
  await expect(run({}, { startupTiming: null })).resolves.toBe("restored");
  expect(marker).not.toHaveBeenCalled();
  expect(report).not.toHaveBeenCalled();
});
