import type { HubEventsSubscriber } from './hub-events-subscriber.js';

export interface WorkspaceHubSubscriptionManagerOptions {
  start(workspaceId: string): HubEventsSubscriber;
  /** Hard process cap; overflow workspaces recover through the poll floor. */
  maxSubscribers?: number;
}

/**
 * Owns the process-wide set of Vela workspace event streams.
 *
 * Every live stream is backed by an explicit, leased billing interest. A
 * daemon-global UI selection is deliberately not a subscription authority:
 * one tab switching to B must not stop another tab's A stream.
 */
export class WorkspaceHubSubscriptionManager {
  private billingWorkspaceIds = new Set<string>();
  private readonly eventWorkspaceReferences = new Map<string, number>();
  private readonly subscribers = new Map<string, HubEventsSubscriber>();
  private disposed = false;
  private readonly maxSubscribers: number;

  constructor(private readonly options: WorkspaceHubSubscriptionManagerOptions) {
    this.maxSubscribers = Math.max(1, options.maxSubscribers ?? 8);
  }

  setBillingInterests(workspaceIds: Iterable<string>): void {
    this.assertUsable();
    const next = new Set(
      [...workspaceIds]
        .map((workspaceId) => workspaceId.trim())
        .filter(Boolean),
    );
    if (sameSet(this.billingWorkspaceIds, next)) return;
    this.billingWorkspaceIds = next;
    this.reconcile();
  }

  activeWorkspaceIds(): string[] {
    return [...this.subscribers.keys()].sort();
  }

  /**
   * Keep an upstream carrier for a locally connected Workspace EventSource.
   * The returned release is idempotent because Express may emit both `finish`
   * and `close` for one response.
   */
  retainEventInterest(workspaceIdInput: string): () => void {
    this.assertUsable();
    const workspaceId = workspaceIdInput.trim();
    if (!workspaceId) return () => undefined;
    this.eventWorkspaceReferences.set(
      workspaceId,
      (this.eventWorkspaceReferences.get(workspaceId) ?? 0) + 1,
    );
    this.reconcile();
    let released = false;
    return () => {
      if (released || this.disposed) return;
      released = true;
      const remaining = (this.eventWorkspaceReferences.get(workspaceId) ?? 1) - 1;
      if (remaining > 0) {
        this.eventWorkspaceReferences.set(workspaceId, remaining);
      } else {
        this.eventWorkspaceReferences.delete(workspaceId);
      }
      this.reconcile();
    };
  }

  /** Re-resolve every live stream after the signed-in credential changes. */
  refreshEndpoints(): void {
    this.assertUsable();
    for (const subscriber of this.subscribers.values()) {
      subscriber.refreshEndpoint();
    }
  }

  dispose(): void {
    if (this.disposed) return;
    this.disposed = true;
    for (const subscriber of this.subscribers.values()) subscriber.stop();
    this.subscribers.clear();
    this.billingWorkspaceIds.clear();
    this.eventWorkspaceReferences.clear();
  }

  private reconcile(): void {
    // A visible browser stream gets first claim on the bounded upstream pool;
    // billing-only interests then fill the remaining capacity.
    const ordered = [
      ...this.eventWorkspaceReferences.keys(),
      ...this.billingWorkspaceIds,
    ];
    const desired = new Set<string>();
    for (const workspaceId of ordered) {
      if (desired.size >= this.maxSubscribers) break;
      desired.add(workspaceId);
    }
    for (const [workspaceId, subscriber] of this.subscribers) {
      if (desired.has(workspaceId)) continue;
      subscriber.stop();
      this.subscribers.delete(workspaceId);
    }
    for (const workspaceId of desired) {
      if (this.subscribers.has(workspaceId)) continue;
      this.subscribers.set(workspaceId, this.options.start(workspaceId));
    }
  }

  private assertUsable(): void {
    if (this.disposed) {
      throw new Error('workspace hub subscription manager is disposed');
    }
  }
}

export function createWorkspaceHubSubscriptionManager(
  options: WorkspaceHubSubscriptionManagerOptions,
): WorkspaceHubSubscriptionManager {
  return new WorkspaceHubSubscriptionManager(options);
}

function sameSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false;
  for (const value of left) {
    if (!right.has(value)) return false;
  }
  return true;
}
