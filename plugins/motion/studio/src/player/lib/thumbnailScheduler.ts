import { TIMELINE_VIEWPORT_BUDGETS, type TimelineViewportBudgets } from "./timelineViewportBudgets";

export type ThumbnailPriority = "overscan" | "visible" | "interaction";
export type ThumbnailJobKind = "video" | "image" | "composition" | "waveform";

export type ThumbnailValue =
  | { kind: "image"; url: string; aspect: number }
  | { kind: "filmstrip"; urls: readonly string[]; aspect: number }
  | { kind: "waveform"; peaks: readonly number[] };

export interface ThumbnailLoadedResult {
  value: ThumbnailValue;
  /** Estimated decoded/object-URL bytes retained by this result. */
  weight: number;
  dispose?: () => void;
}

export interface ThumbnailRequest {
  key: string;
  projectId: string;
  sessionEpoch: number;
  kind: ThumbnailJobKind;
  priority: ThumbnailPriority;
  /** Rich work is paused while the timeline is fast-scrolling. */
  rich?: boolean;
  /** For work whose result nobody reads: it is dropped, not cached, once its last lease ends. */
  discardWhenReleased?: boolean;
  load: (signal: AbortSignal) => Promise<ThumbnailLoadedResult>;
}

export type ThumbnailSnapshot =
  | { status: "idle" | "queued" | "loading" }
  | { status: "ready"; value: ThumbnailValue }
  | { status: "error"; error: Error };

export interface ThumbnailLease {
  updatePriority(priority: ThumbnailPriority): void;
  release(): void;
}

export interface ThumbnailSchedulerDiagnostics {
  queued: number;
  active: number;
  leases: number;
  cacheEntries: number;
  cacheBytes: number;
  waveformCacheEntries: number;
  waveformCacheBytes: number;
  activeByKind: Readonly<Record<ThumbnailJobKind, number>>;
}

type EntryState = "queued" | "loading" | "ready" | "error";

interface ThumbnailEntry {
  request: ThumbnailRequest;
  scopedKey: string;
  state: EntryState;
  leases: Map<number, ThumbnailPriority>;
  listeners: Map<number, () => void>;
  controller: AbortController | null;
  value?: ThumbnailValue;
  error?: Error;
  failedAt?: number;
  weight: number;
  dispose?: () => void;
  disposed: boolean;
  cached: boolean;
  lastAccess: number;
  snapshot: ThumbnailSnapshot;
  /** Aborted by the preview-reload hold, to run again once the hold lifts. */
  preempted: boolean;
}

const PRIORITY_SCORE: Readonly<Record<ThumbnailPriority, number>> = {
  overscan: 0,
  visible: 1,
  interaction: 2,
};

const EMPTY_SNAPSHOT: ThumbnailSnapshot = Object.freeze({ status: "idle" });

function concurrencyBucket(kind: ThumbnailJobKind): "video" | "composition" | "general" {
  if (kind === "video") return "video";
  if (kind === "composition") return "composition";
  return "general";
}

function errorFrom(reason: unknown): Error {
  return reason instanceof Error ? reason : new Error(String(reason));
}

export function createThumbnailKey(parts: Readonly<Record<string, string | number | undefined>>) {
  return Object.entries(parts)
    .filter((entry): entry is [string, string | number] => entry[1] !== undefined)
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([name, value]) => `${encodeURIComponent(name)}=${encodeURIComponent(String(value))}`)
    .join("&");
}

export function createThumbnailRequestIdentity(
  request: Pick<ThumbnailRequest, "key" | "projectId" | "sessionEpoch" | "kind" | "rich">,
) {
  return createThumbnailKey({
    project: request.projectId,
    session: request.sessionEpoch,
    request: request.key,
    kind: request.kind,
    rich: request.rich ? 1 : 0,
  });
}

/** Sole client owner for thumbnail work, cached resources, and cleanup. */
export class ThumbnailScheduler {
  private readonly entries = new Map<string, ThumbnailEntry>();
  private readonly budgets: Readonly<TimelineViewportBudgets>;
  private nextLeaseId = 1;
  private nextSequence = 1;
  private scrolling = false;
  private previewReloading = false;
  private playbackActive = false;
  private pageHidden = false;
  private cacheBytes = 0;
  private waveformCacheBytes = 0;
  private readonly activeByBucket = { video: 0, composition: 0, general: 0 };
  private readonly activeByKind: Record<ThumbnailJobKind, number> = {
    video: 0,
    image: 0,
    composition: 0,
    waveform: 0,
  };
  private readonly now: () => number;

  constructor(
    budgets: Readonly<TimelineViewportBudgets> = TIMELINE_VIEWPORT_BUDGETS,
    now: () => number = Date.now,
  ) {
    this.budgets = budgets;
    this.now = now;
  }

  acquire(request: ThumbnailRequest, listener: () => void): ThumbnailLease {
    const scopedKey = createThumbnailRequestIdentity(request);
    let entry = this.entries.get(scopedKey);
    if (
      entry?.state === "error" &&
      entry.failedAt !== undefined &&
      this.now() - entry.failedAt >= this.budgets.metadataFailureTtlMs
    ) {
      this.deleteEntry(scopedKey, entry);
      entry = this.entries.get(scopedKey);
    }
    if (!entry) {
      entry = {
        request,
        scopedKey,
        state: "queued",
        leases: new Map(),
        listeners: new Map(),
        controller: null,
        weight: 0,
        disposed: false,
        cached: false,
        lastAccess: this.nextSequence++,
        snapshot: Object.freeze({ status: "queued" }),
        preempted: false,
      };
      this.entries.set(scopedKey, entry);
    }

    const leaseId = this.nextLeaseId++;
    entry.leases.set(leaseId, request.priority);
    entry.listeners.set(leaseId, listener);
    entry.lastAccess = this.nextSequence++;
    this.pump();

    let released = false;
    return {
      updatePriority: (priority) => {
        const current = this.entries.get(scopedKey);
        if (!current || !current.leases.has(leaseId)) return;
        current.leases.set(leaseId, priority);
        current.lastAccess = this.nextSequence++;
        this.pump();
      },
      release: () => {
        if (released) return;
        released = true;
        const current = this.entries.get(scopedKey);
        if (!current) return;
        current.leases.delete(leaseId);
        current.listeners.delete(leaseId);
        if (current.leases.size === 0) {
          if (current.state === "queued") {
            this.deleteEntry(scopedKey, current);
          } else if (current.state === "loading") {
            current.controller?.abort();
            this.deleteEntry(scopedKey, current);
          } else if (current.state === "ready" && !current.cached) {
            this.deleteEntry(scopedKey, current);
          }
        }
        this.evict();
      },
    };
  }

  getSnapshot(
    request: Pick<ThumbnailRequest, "key" | "projectId" | "sessionEpoch" | "kind" | "rich">,
  ): ThumbnailSnapshot {
    const entry = this.entries.get(createThumbnailRequestIdentity(request));
    if (!entry) return EMPTY_SNAPSHOT;
    return entry.snapshot;
  }

  setScrolling(scrolling: boolean): void {
    if (this.scrolling === scrolling) return;
    this.scrolling = scrolling;
    if (!scrolling) this.pump();
  }

  /** Holds composition renders while the preview loads: same server, and the preview is what the person awaits. */
  setPreviewReloading(reloading: boolean): void {
    if (this.previewReloading === reloading) return;
    this.previewReloading = reloading;
    if (!reloading) {
      this.pump();
      return;
    }
    for (const entry of this.entries.values()) {
      if (entry.state !== "loading" || entry.request.kind !== "composition") continue;
      this.preempt(entry);
    }
  }

  setPlaybackActive(active: boolean): void {
    if (this.playbackActive === active) return;
    this.playbackActive = active;
    if (!active) this.pump();
  }

  setPageHidden(hidden: boolean): void {
    if (this.pageHidden === hidden) return;
    this.pageHidden = hidden;
    if (!hidden) {
      this.pump();
      return;
    }
    for (const entry of this.entries.values()) {
      if (entry.state === "loading") this.preempt(entry);
    }
  }

  private preempt(entry: ThumbnailEntry): void {
    entry.preempted = true;
    entry.controller?.abort();
  }

  /** Evict project cache entries that are no longer owned by mounted consumers. */
  invalidateProject(projectId: string): void {
    for (const [key, entry] of this.entries) {
      if (entry.request.projectId !== projectId) continue;
      if (entry.leases.size > 0) continue;
      entry.controller?.abort();
      this.deleteEntry(key, entry);
    }
  }

  getDiagnostics(): ThumbnailSchedulerDiagnostics {
    let queued = 0;
    let active = 0;
    let leases = 0;
    let cacheEntries = 0;
    let waveformCacheEntries = 0;
    for (const entry of this.entries.values()) {
      if (entry.state === "queued") queued++;
      if (entry.state === "loading") active++;
      if (entry.cached) {
        if (entry.request.kind === "waveform") waveformCacheEntries++;
        else cacheEntries++;
      }
      leases += entry.leases.size;
    }
    return {
      queued,
      active,
      leases,
      cacheEntries,
      cacheBytes: this.cacheBytes,
      waveformCacheEntries,
      waveformCacheBytes: this.waveformCacheBytes,
      activeByKind: { ...this.activeByKind },
    };
  }

  private pump(): void {
    if (this.pageHidden) return;
    const queued = Array.from(this.entries.values())
      .filter((entry) => entry.state === "queued" && entry.leases.size > 0)
      .sort((left, right) => {
        const priorityDelta = this.entryPriority(right) - this.entryPriority(left);
        return priorityDelta || left.lastAccess - right.lastAccess;
      });

    for (const entry of queued) {
      if (this.isHeld(entry)) continue;
      const bucket = concurrencyBucket(entry.request.kind);
      if (this.activeByBucket[bucket] >= this.bucketLimit(bucket)) continue;
      this.start(entry, bucket);
    }
  }

  private isHeld(entry: ThumbnailEntry): boolean {
    const { kind, rich } = entry.request;
    if (this.scrolling && rich) return true;
    if (this.previewReloading && kind === "composition") return true;
    return (
      this.playbackActive &&
      kind === "video" &&
      this.entryPriority(entry) < PRIORITY_SCORE.interaction
    );
  }

  private start(entry: ThumbnailEntry, bucket: "video" | "composition" | "general"): void {
    entry.state = "loading";
    entry.snapshot = Object.freeze({ status: "loading" });
    const controller = new AbortController();
    entry.controller = controller;
    this.activeByBucket[bucket]++;
    this.activeByKind[entry.request.kind]++;
    let slotFree = false;
    const freeSlot = () => {
      if (slotFree) return;
      slotFree = true;
      this.activeByBucket[bucket]--;
      this.activeByKind[entry.request.kind]--;
      queueMicrotask(() => this.pump());
    };
    controller.signal.addEventListener("abort", freeSlot, { once: true });
    this.notify(entry);

    const pending = this.loadWithTimeout(entry, controller);
    void pending
      .then((result) => this.acceptResult(entry, controller, result))
      .catch((reason: unknown) => {
        if (this.entries.get(entry.scopedKey) !== entry) return;
        if (controller.signal.aborted && entry.leases.size === 0) {
          this.deleteEntry(entry.scopedKey, entry);
          return;
        }
        if (this.requeuePreempted(entry)) return;
        entry.state = "error";
        entry.error = errorFrom(reason);
        entry.failedAt = this.now();
        entry.snapshot = Object.freeze({ status: "error", error: entry.error });
        this.notify(entry);
        this.evictFailures();
      })
      .finally(() => {
        if (entry.controller === controller) entry.controller = null;
        freeSlot();
        this.pump();
      });
  }

  private acceptResult(
    entry: ThumbnailEntry,
    controller: AbortController,
    result: ThumbnailLoadedResult,
  ): void {
    if (controller.signal.aborted || this.entries.get(entry.scopedKey) !== entry) {
      this.safeDispose(result.dispose);
      this.requeuePreempted(entry);
      return;
    }
    this.validateResult(result);
    entry.state = "ready";
    entry.value = result.value;
    entry.weight = result.weight;
    entry.dispose = result.dispose;
    this.cacheResult(entry);
    entry.snapshot = Object.freeze({ status: "ready", value: result.value });
    this.notify(entry);
    this.evict();
    if (!entry.cached && entry.leases.size === 0) this.deleteEntry(entry.scopedKey, entry);
  }

  private requeuePreempted(entry: ThumbnailEntry): boolean {
    if (!entry.preempted || this.entries.get(entry.scopedKey) !== entry) return false;
    entry.preempted = false;
    entry.state = "queued";
    entry.snapshot = Object.freeze({ status: "queued" });
    this.notify(entry);
    return true;
  }

  private validateResult(result: ThumbnailLoadedResult): void {
    if (Number.isFinite(result.weight) && result.weight >= 0) return;
    this.safeDispose(result.dispose);
    throw new RangeError("Thumbnail result weight must be finite and non-negative");
  }

  private cacheResult(entry: ThumbnailEntry): void {
    const isWaveform = entry.request.kind === "waveform";
    const byteBudget = isWaveform
      ? this.budgets.waveformCacheBytes
      : this.budgets.thumbnailCacheBytes;
    entry.cached = !entry.request.discardWhenReleased && entry.weight <= byteBudget;
    if (!entry.cached) return;
    if (isWaveform) this.waveformCacheBytes += entry.weight;
    else this.cacheBytes += entry.weight;
  }

  private entryPriority(entry: ThumbnailEntry): number {
    let score = -1;
    for (const priority of entry.leases.values()) {
      score = Math.max(score, PRIORITY_SCORE[priority]);
    }
    return score;
  }

  private bucketLimit(bucket: "video" | "composition" | "general"): number {
    if (bucket === "video") return this.budgets.concurrentVideoDecodes;
    if (bucket === "composition") return this.budgets.concurrentCompositionFetches;
    return this.budgets.concurrentMetadataJobs;
  }

  private evict(): void {
    this.evictPartition(false);
    this.evictPartition(true);
  }

  private evictPartition(waveform: boolean): void {
    const cached = Array.from(this.entries.values()).filter(
      (entry) => entry.cached && (entry.request.kind === "waveform") === waveform,
    );
    const perProject = new Map<string, number>();
    for (const entry of cached) {
      perProject.set(entry.request.projectId, (perProject.get(entry.request.projectId) ?? 0) + 1);
    }
    cached.sort((left, right) => left.lastAccess - right.lastAccess);

    let cacheEntries = cached.length;
    for (const entry of cached) {
      const projectEntries = perProject.get(entry.request.projectId) ?? 0;
      if (!this.isCacheOverBudget(waveform, cacheEntries, projectEntries)) continue;
      this.uncache(entry);
      cacheEntries--;
      perProject.set(entry.request.projectId, projectEntries - 1);
      if (entry.leases.size === 0) this.deleteEntry(entry.scopedKey, entry);
    }
  }

  private isCacheOverBudget(
    waveform: boolean,
    cacheEntries: number,
    projectEntries: number,
  ): boolean {
    const entryBudget = waveform
      ? this.budgets.waveformCacheEntries
      : this.budgets.thumbnailCacheEntries;
    const byteBudget = waveform
      ? this.budgets.waveformCacheBytes
      : this.budgets.thumbnailCacheBytes;
    const cacheBytes = waveform ? this.waveformCacheBytes : this.cacheBytes;
    const projectOverBudget =
      !waveform && projectEntries > this.budgets.thumbnailCacheEntriesPerProject;
    return cacheEntries > entryBudget || cacheBytes > byteBudget || projectOverBudget;
  }

  private uncache(entry: ThumbnailEntry): void {
    entry.cached = false;
    if (entry.request.kind === "waveform") this.waveformCacheBytes -= entry.weight;
    else this.cacheBytes -= entry.weight;
  }

  private notify(entry: ThumbnailEntry): void {
    for (const listener of new Set(entry.listeners.values())) listener();
  }

  private loadWithTimeout(
    entry: ThumbnailEntry,
    controller: AbortController,
  ): Promise<ThumbnailLoadedResult> {
    let load: Promise<ThumbnailLoadedResult>;
    try {
      load = entry.request.load(controller.signal);
    } catch (reason) {
      load = Promise.reject(reason);
    }

    return new Promise((resolve, reject) => {
      let settled = false;
      const timeout = setTimeout(() => {
        if (settled) return;
        settled = true;
        const message = `Thumbnail load timed out after ${this.budgets.thumbnailLoadTimeoutMs}ms`;
        controller.abort(new DOMException(message, "TimeoutError"));
        reject(new Error(message));
      }, this.budgets.thumbnailLoadTimeoutMs);

      load.then(
        (result) => {
          if (settled) {
            this.safeDispose(result.dispose);
            return;
          }
          settled = true;
          clearTimeout(timeout);
          resolve(result);
        },
        (reason: unknown) => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          reject(reason);
        },
      );
    });
  }

  private deleteEntry(key: string, entry: ThumbnailEntry): void {
    if (this.entries.get(key) !== entry) return;
    this.entries.delete(key);
    entry.snapshot = EMPTY_SNAPSHOT;
    this.notify(entry);
    if (entry.cached) {
      entry.cached = false;
      if (entry.request.kind === "waveform") this.waveformCacheBytes -= entry.weight;
      else this.cacheBytes -= entry.weight;
    }
    if (!entry.disposed) {
      entry.disposed = true;
      this.safeDispose(entry.dispose);
    }
    entry.listeners.clear();
    entry.leases.clear();
  }

  private evictFailures(): void {
    const failed = Array.from(this.entries.values())
      .filter((entry) => entry.state === "error" && entry.leases.size === 0)
      .sort((left, right) => left.lastAccess - right.lastAccess);
    const overflow = failed.length - this.budgets.thumbnailCacheEntries;
    for (const entry of failed.slice(0, Math.max(0, overflow))) {
      this.deleteEntry(entry.scopedKey, entry);
    }
  }

  private safeDispose(dispose: (() => void) | undefined): void {
    try {
      dispose?.();
    } catch {
      // Cleanup is best-effort; one broken resource must not block the remaining cleanup.
    }
  }
}

export const thumbnailScheduler = new ThumbnailScheduler();
