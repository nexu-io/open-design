import { readFile, readdir, rename, rm, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { userInfo } from 'node:os';
import { buildAutomaticDiagnostics, DIAGNOSTIC_MAX_BYTES, redactJsonValue,
  type AutomaticDiagnosticManifest, type LogSource } from '@open-design/diagnostics';
import { DiagnosticOutbox, type DiagnosticIncident } from '../storage/diagnostic-outbox.js';
import { DiagnosticRelay, DiagnosticRelayError, type DiagnosticDevice } from '../integrations/diagnostic-relay.js';
import { DiagnosticConsentFence } from './diagnostic-consent.js';

export interface FaultEvidence {
  sourceId: string; kind: string; at: number;
  runId?: string; agentId?: string; projectId?: string; conversationId?: string;
  attempt?: number; errorCode?: string; detail?: unknown;
}
interface Options {
  dataRoot: string; relayOrigin: string | null;
  consent(): boolean;
  sources(evidence: FaultEvidence): Promise<LogSource[]>;
  baselineSources?(): Promise<LogSource[]>;
  context?(): unknown;
  onDelivered?(incidentId: string, receipt: string, evidence: FaultEvidence): void;
  fetcher?: typeof fetch;
}

export class AutomaticDiagnostics {
  readonly outbox: DiagnosticOutbox;
  private timer?: ReturnType<typeof setInterval>;
  private active: Promise<void> | null = null;
  private controller = new AbortController();
  private stopped = false;
  private readonly relay: DiagnosticRelay | null;
  private readonly consentFence: DiagnosticConsentFence;
  private consentBarrier: Promise<void> = Promise.resolve();
  constructor(private readonly options: Options) {
    this.outbox = new DiagnosticOutbox(options.dataRoot);
    this.consentFence = new DiagnosticConsentFence(this.outbox.directory, this.hasConsent());
    this.relay = options.relayOrigin ? new DiagnosticRelay(options.relayOrigin, () => this.allowed(), options.fetcher) : null;
  }
  private allowed(): boolean {
    return !this.stopped && this.hasConsent();
  }
  private hasConsent(): boolean {
    try { return this.options.consent(); } catch { return false; }
  }
  record(evidence: FaultEvidence): string | null {
    if (!this.allowed()) return null;
    try {
      const summary = JSON.stringify(redactJsonValue({ ...evidence, context: this.options.context?.(),
        platform: process.platform, arch: process.arch, nodeVersion: process.version }));
      // Keep synchronous incident registration small even if a runtime emits a huge payload.
      const bounded = Buffer.byteLength(summary) <= 64 * 1024 ? summary : JSON.stringify({
        sourceId: evidence.sourceId, kind: evidence.kind, at: evidence.at,
        runId: evidence.runId, agentId: evidence.agentId, errorCode: evidence.errorCode,
        partial: true, reason: 'incident_summary_truncated',
      });
      const item = this.outbox.enqueue(evidence.sourceId, bounded, evidence.at);
      void this.tick();
      return item.id;
    } catch { console.warn('[diagnostics] incident persistence unavailable'); return null; }
  }
  start(): void {
    this.outbox.recoverRuns(this.hasConsent());
    if (this.consentFence.needsBaseline) this.baselineConsent();
    this.timer = setInterval(() => { void this.tick(); }, 15_000);
    this.timer.unref();
    void this.tick();
  }
  trackRun(runId: string, evidence: FaultEvidence): void {
    if (!this.allowed()) return;
    try { this.outbox.trackRun(runId, JSON.stringify(redactJsonValue(evidence))); }
    catch { console.warn('[diagnostics] active run persistence unavailable'); }
  }
  finishRun(runId: string): void {
    try { this.outbox.finishRun(runId); } catch { /* leave restart recovery evidence */ }
  }
  recovered(runId: string, at: number): void {
    if (!this.allowed()) return;
    try { this.outbox.noteRecovery(runId, at); void this.tick(); }
    catch { console.warn('[diagnostics] recovery persistence unavailable'); }
  }
  /** Called synchronously after preference persistence, before any further transport step. */
  consentChanged(): void {
    if (!this.hasConsent()) this.controller.abort();
    const changed = this.consentFence.change(this.hasConsent());
    if (this.allowed()) {
      if (changed) this.baselineConsent();
      return;
    }
    try { this.outbox.prune(Date.now(), false); } catch { /* retry cleanup on next tick */ }
    void this.tick();
  }
  private baselineConsent(): void {
    this.consentBarrier = (async () => {
      if (this.options.baselineSources) await this.consentFence.baseline(await this.options.baselineSources());
    })().catch(() => { /* unknown pre-boundary files are omitted conservatively */ });
  }
  tick(): Promise<void> {
    if (this.active) return this.active;
    if (this.stopped) return Promise.resolve();
    this.active = this.drain().catch(() => {
      console.warn('[diagnostics] background delivery deferred');
    }).finally(() => { this.active = null; });
    return this.active;
  }
  private async cleanup(reserve = 0): Promise<void> {
    const removed = this.outbox.prune(Date.now(), this.hasConsent(), reserve);
    for (const id of removed) {
      await rm(join(this.outbox.directory, id), { recursive: true, force: true });
      await rm(join(this.outbox.directory, `${id}.tmp`), { recursive: true, force: true });
    }
    // Reconcile orphaned staging files left between filesystem writes and SQLite commits.
    const known = new Set(this.outbox.ids());
    for (const entry of await readdir(this.outbox.directory, { withFileTypes: true })) {
      if (entry.isDirectory() && /^[a-f0-9-]{36}(\.tmp)?$/.test(entry.name) && !known.has(entry.name.replace(/\.tmp$/, ''))) {
        await rm(join(this.outbox.directory, entry.name), { recursive: true, force: true });
      }
    }
  }
  private async device(item: DiagnosticIncident, signal: AbortSignal): Promise<DiagnosticDevice> {
    const file = join(this.outbox.directory, 'device.json');
    let device: DiagnosticDevice | undefined;
    try {
      const value = JSON.parse(await readFile(file, 'utf8'));
      if (value.origin === this.options.relayOrigin && typeof value.device_id === 'string' && typeof value.device_token === 'string') device = value;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw new DiagnosticRelayError('device_identity_unreadable', 0, true);
    }
    if (item.deviceId && item.deviceId !== device?.device_id) throw new DiagnosticRelayError('device_identity_lost', 0, true);
    if (!device) {
      device = await this.relay!.register(signal);
      await writeFile(`${file}.tmp`, JSON.stringify({ ...device, origin: this.options.relayOrigin }), { mode: 0o600 });
      await rename(`${file}.tmp`, file);
    }
    if (!this.outbox.bindDevice(item, device.device_id)) throw new DiagnosticRelayError('stale_incident');
    return device;
  }
  private async drain(): Promise<void> {
    await this.consentBarrier;
    await this.cleanup();
    if (!this.allowed()) return;
    this.controller = new AbortController();
    const signal = this.controller.signal;
    // A bounded batch yields to normal daemon work even during a fault storm.
    for (let count = 0; count < 8 && this.allowed(); count++) {
      const item = this.outbox.claim(); if (!item) break;
      const directory = join(this.outbox.directory, item.id);
      const heartbeat = setInterval(() => {
        try { if (!this.outbox.renew(item)) this.controller.abort(); }
        catch { this.controller.abort(); }
      }, 20_000);
      heartbeat.unref();
      try {
        if (item.state === 'collect') {
          await this.cleanup(DIAGNOSTIC_MAX_BYTES);
          if (this.outbox.get(item.id)?.state !== 'collect') continue;
          const staging = `${directory}.tmp`;
          await rm(staging, { recursive: true, force: true });
          await rm(directory, { recursive: true, force: true });
          const evidence = JSON.parse(item.summary) as FaultEvidence;
          let username: string | undefined; try { username = userInfo().username; } catch { /* optional */ }
          const { manifest } = await buildAutomaticDiagnostics({ directory: staging, incidentId: item.id,
            summary: evidence, sources: await this.consentFence.apply(await this.options.sources(evidence)), redaction: { username }, signal });
          signal.throwIfAborted();
          if (!this.allowed()) throw new DiagnosticRelayError('consent_disabled', 0, true);
          await rm(directory, { recursive: true, force: true });
          await rename(staging, directory);
          if (!this.outbox.prepared(item, JSON.stringify(manifest), manifest.compressedBytes)) {
            await rm(directory, { recursive: true, force: true });
          }
        } else {
          if (!this.relay) throw new DiagnosticRelayError('relay_not_configured');
          const device = await this.device(item, signal);
          const receipt = await this.relay.upload(device, JSON.parse(item.manifest!) as AutomaticDiagnosticManifest, directory, signal);
          if (this.allowed() && this.outbox.delivered(item, receipt)) this.options.onDelivered?.(item.id, receipt, JSON.parse(item.summary) as FaultEvidence);
        }
      } catch (error) {
        await rm(`${directory}.tmp`, { recursive: true, force: true });
        if (error instanceof DiagnosticRelayError && error.permanent) {
          this.outbox.discard(item.id, error.code);
          await rm(directory, { recursive: true, force: true });
          await rm(`${directory}.tmp`, { recursive: true, force: true });
        } else {
          const delay = Math.max(error instanceof DiagnosticRelayError ? error.retryAfterMs : 0,
            Math.min(3600_000, 1000 * 2 ** Math.min(item.attempts, 12)));
          this.outbox.defer(item, Date.now() + delay, error instanceof DiagnosticRelayError ? error.code : 'collection_or_network_failure');
        }
      } finally {
        clearInterval(heartbeat);
      }
    }
    await this.cleanup();
  }
  async stop(): Promise<void> {
    if (this.stopped) return;
    this.stopped = true;
    if (this.timer) clearInterval(this.timer);
    this.controller.abort();
    await this.active;
    this.outbox.close();
  }
}
