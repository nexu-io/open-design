import {
  STANDALONE_PROTOCOL_VERSION,
  STANDALONE_UPDATER_SCHEMA_VERSION,
  createStandaloneHandoffEnvelope,
  validateStandaloneUpdaterActionRequest,
  validateStandaloneUpdaterActionResult,
  validateStandaloneUpdaterSnapshot,
  validateStandaloneUpdaterWaitRequest,
  type StandaloneUpdaterActionRequest,
  type StandaloneUpdaterActionResult,
  type StandaloneUpdaterProviderDescriptor,
  type StandaloneUpdaterProviderPort,
  type StandaloneUpdaterSnapshot,
  type StandaloneUpdaterWaitRequest,
} from "@open-design/standalone-proto";
import { describe, expect, it } from "vitest";

const handoff = createStandaloneHandoffEnvelope({
  descriptor: {
    release: { version: "0.19.0-beta.10" },
    standalone: {
      digest: `sha256:${"a".repeat(64)}`,
      protocolVersion: STANDALONE_PROTOCOL_VERSION,
      version: "0.19.0-beta.10",
    },
  },
  scope: { channel: "beta", generation: 3, namespace: "release-beta" },
});

function provider(
  owner: "shell" | "standalone",
  incarnation: string,
): StandaloneUpdaterProviderDescriptor {
  return owner === "shell"
    ? {
        attachmentId: "electron-a",
        handoff,
        hostScope: "electron-updater-a",
        incarnation,
        owner,
        providerId: "electron-update",
        schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      }
    : {
        handoff,
        incarnation,
        owner,
        providerId: "standalone-update",
        schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      };
}

class FakeUpdaterProvider implements StandaloneUpdaterProviderPort {
  readonly receipts = new Map<string, StandaloneUpdaterActionResult>();
  invocationCount = 0;
  private readonly waiters = new Set<(snapshot: StandaloneUpdaterSnapshot) => void>();
  private snapshot: StandaloneUpdaterSnapshot;

  constructor(readonly descriptor: StandaloneUpdaterProviderDescriptor) {
    this.snapshot = validateStandaloneUpdaterSnapshot({
      actions: [{ emphasis: "primary", id: "apply", label: "Apply update" }],
      presentation: { title: "Update ready" },
      provider: descriptor,
      revision: 1,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      state: "ready",
    }, { provider: descriptor });
  }

  async readSnapshot(): Promise<StandaloneUpdaterSnapshot> {
    return this.snapshot;
  }

  async waitForChange(raw: StandaloneUpdaterWaitRequest): Promise<StandaloneUpdaterSnapshot> {
    const request = validateStandaloneUpdaterWaitRequest(raw, { provider: this.descriptor });
    if (this.snapshot.revision > request.afterRevision) return this.snapshot;
    return await new Promise<StandaloneUpdaterSnapshot>((resolve) => {
      const onChange = (snapshot: StandaloneUpdaterSnapshot) => {
        clearTimeout(timeout);
        this.waiters.delete(onChange);
        resolve(snapshot);
      };
      const timeout = setTimeout(() => {
        this.waiters.delete(onChange);
        resolve(this.snapshot);
      }, request.timeoutMs);
      this.waiters.add(onChange);
    });
  }

  async invoke(raw: StandaloneUpdaterActionRequest): Promise<StandaloneUpdaterActionResult> {
    const request = validateStandaloneUpdaterActionRequest(raw, { provider: this.descriptor });
    const existing = this.receipts.get(request.requestId);
    if (existing != null) return existing;
    this.invocationCount += 1;
    const result = validateStandaloneUpdaterActionResult({
      actionId: request.actionId,
      operationId: `${this.descriptor.providerId}-handoff`,
      outcome: "accepted",
      provider: this.descriptor,
      requestId: request.requestId,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
    }, {
      actionId: request.actionId,
      provider: this.descriptor,
      requestId: request.requestId,
    });
    this.receipts.set(request.requestId, result);
    this.snapshot = validateStandaloneUpdaterSnapshot({
      actions: [],
      presentation: { title: "Update handed off" },
      provider: this.descriptor,
      revision: this.snapshot.revision + 1,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      state: "handed-off",
    }, { provider: this.descriptor });
    for (const notify of [...this.waiters]) notify(this.snapshot);
    return result;
  }
}

function action(
  descriptor: StandaloneUpdaterProviderDescriptor,
  requestId = "update-action-1",
): StandaloneUpdaterActionRequest {
  return {
    actionId: "apply",
    provider: descriptor,
    requestId,
    schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
  };
}

describe("updater provider contract demo", () => {
  it("keeps Shell and Standalone providers independent while exposing one projection shape", async () => {
    const shell = new FakeUpdaterProvider(provider("shell", "shell-incarnation-1"));
    const standalone = new FakeUpdaterProvider(provider("standalone", "standalone-incarnation-1"));

    await shell.invoke(action(shell.descriptor));

    expect((await shell.readSnapshot()).state).toBe("handed-off");
    expect((await standalone.readSnapshot()).state).toBe("ready");
    expect(standalone.invocationCount).toBe(0);
  });

  it("wakes bounded waiters on revision change and deduplicates within one incarnation", async () => {
    const shell = new FakeUpdaterProvider(provider("shell", "shell-incarnation-1"));
    const waiting = shell.waitForChange({
      afterRevision: 1,
      provider: shell.descriptor,
      schemaVersion: STANDALONE_UPDATER_SCHEMA_VERSION,
      timeoutMs: 1_000,
    });

    const first = await shell.invoke(action(shell.descriptor));
    const duplicate = await shell.invoke(action(shell.descriptor));

    await expect(waiting).resolves.toMatchObject({ revision: 2, state: "handed-off" });
    expect(duplicate).toEqual(first);
    expect(shell.invocationCount).toBe(1);
  });

  it("fences stale providers and scopes request dedupe to the provider incarnation", async () => {
    const previous = new FakeUpdaterProvider(provider("shell", "shell-incarnation-1"));
    const current = new FakeUpdaterProvider(provider("shell", "shell-incarnation-2"));

    await expect(current.invoke(action(previous.descriptor))).rejects.toThrow(/provider incarnation/u);
    await previous.invoke(action(previous.descriptor));
    await current.invoke(action(current.descriptor));

    expect(previous.invocationCount).toBe(1);
    expect(current.invocationCount).toBe(1);
  });
});
