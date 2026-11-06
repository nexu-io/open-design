import type {
  WorkspaceBillingInterestResponse,
  WorkspaceBillingInterestScope,
} from '@open-design/contracts';

const RENEW_FLOOR_MS = 5_000;
const RENEW_CEILING_MS = 20_000;
const RENEW_RETRY_DELAYS_MS = [1_000, 2_000, 5_000, 10_000, 20_000] as const;

interface OwnerInterest extends WorkspaceBillingInterestScope {
  ownerId: string;
}

/**
 * Renderer-lifetime full interest-set lease.
 *
 * Hooks only retain/release exact scopes. This registry is the sole writer of
 * the renderer's daemon declaration, so ambient and project-scoped hooks can
 * coexist without racing one global "current workspace" generation.
 */
class WorkspaceBillingInterestRegistry {
  private readonly owners = new Map<string, OwnerInterest>();
  private generation = 0n;
  private signature = '';
  private declaredSignature = '';
  private acceptedGeneration: bigint | null = null;
  private clientId = createClientId();
  private inFlight: Promise<void> | null = null;
  private inFlightSignature = '';
  private inFlightGeneration: bigint | null = null;
  private renewTimer: ReturnType<typeof setTimeout> | null = null;
  private renewRetryAttempt = 0;
  private unsupported = false;
  private disposed = false;

  retain(ownerId: string, scope: WorkspaceBillingInterestScope): () => void {
    const normalized: OwnerInterest = {
      ownerId,
      workspaceId: scope.workspaceId.trim(),
      workspaceMemberId: scope.workspaceMemberId.trim(),
    };
    if (!normalized.workspaceId || !normalized.workspaceMemberId) {
      return () => undefined;
    }
    this.owners.set(ownerId, normalized);
    this.bumpGenerationIfChanged();
    void this.flush();
    return () => this.release(ownerId);
  }

  async ensureDeclared(): Promise<void> {
    await this.flush();
  }

  headersFor(scope: WorkspaceBillingInterestScope): Record<string, string> {
    const normalized = `${scope.workspaceId.trim()}\0${scope.workspaceMemberId.trim()}`;
    const declared = this.scopes().some(
      (candidate) =>
        `${candidate.workspaceId}\0${candidate.workspaceMemberId}` === normalized,
    );
    return (
      declared &&
      !this.unsupported &&
      this.declaredSignature === this.signature &&
      this.acceptedGeneration != null
    )
      ? {
          'x-od-workspace-runtime-client-id': this.clientId,
          'x-od-workspace-runtime-generation': this.acceptedGeneration.toString(),
        }
      : {};
  }

  reset(): void {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.renewTimer = null;
    this.owners.clear();
    this.generation = 0n;
    this.signature = '';
    this.declaredSignature = '';
    this.acceptedGeneration = null;
    this.clientId = createClientId();
    this.inFlight = null;
    this.inFlightSignature = '';
    this.inFlightGeneration = null;
    this.renewRetryAttempt = 0;
    this.unsupported = false;
    this.disposed = false;
  }

  private release(ownerId: string): void {
    if (!this.owners.delete(ownerId)) return;
    this.bumpGenerationIfChanged();
    void this.flush();
  }

  private bumpGenerationIfChanged(): void {
    const signature = JSON.stringify(this.scopes());
    if (signature === this.signature) return;
    this.signature = signature;
    this.generation += 1n;
  }

  private scopes(): WorkspaceBillingInterestScope[] {
    const deduped = new Map<string, WorkspaceBillingInterestScope>();
    for (const owner of this.owners.values()) {
      const key = `${owner.workspaceId}\0${owner.workspaceMemberId}`;
      deduped.set(key, {
        workspaceId: owner.workspaceId,
        workspaceMemberId: owner.workspaceMemberId,
      });
    }
    return [...deduped.values()].sort((left, right) =>
      `${left.workspaceId}\0${left.workspaceMemberId}`.localeCompare(
        `${right.workspaceId}\0${right.workspaceMemberId}`,
      ),
    );
  }

  private flush(): Promise<void> {
    if (this.disposed || this.unsupported || typeof window === 'undefined') {
      return Promise.resolve();
    }
    if (this.inFlight) {
      const active = this.inFlight;
      const activeSignature = this.inFlightSignature;
      const activeGeneration = this.inFlightGeneration;
      return active.then(() => {
        if (
          !this.unsupported &&
          this.declaredSignature !== this.signature &&
          (activeSignature !== this.signature ||
            activeGeneration !== this.generation)
        ) {
          return this.flush();
        }
      });
    }
    const generation = this.generation.toString();
    const interests = this.scopes();
    const signature = JSON.stringify(interests);
    this.inFlightSignature = signature;
    this.inFlightGeneration = this.generation;
    const url = `/api/workspace/billing/interests/${encodeURIComponent(this.clientId)}`;
    this.clearRenewTimer();
    let retryImmediately = false;
    const operation = fetch(
      interests.length > 0 ? url : `${url}?generation=${encodeURIComponent(generation)}`,
      interests.length > 0
        ? {
            method: 'PUT',
            cache: 'no-store',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify({ generation, interests }),
          }
        : {
            method: 'DELETE',
            cache: 'no-store',
            keepalive: true,
          },
    )
      .then(async (response) => {
        if (response.status === 404 || response.status === 405) {
          this.unsupported = true;
          this.clearRenewTimer();
          return;
        }
        if (!response.ok) {
          if (response.status === 409) {
            const conflict = await response.json().catch(() => null) as {
              acceptedGeneration?: unknown;
            } | null;
            const accepted =
              typeof conflict?.acceptedGeneration === 'string' &&
              /^(?:0|[1-9]\d*)$/.test(conflict.acceptedGeneration)
                ? BigInt(conflict.acceptedGeneration)
                : null;
            if (accepted != null && accepted >= this.generation) {
              this.generation = accepted + 1n;
              retryImmediately = true;
              return;
            }
          }
          this.scheduleRenewRetry();
          return;
        }
        if (interests.length === 0) {
          this.declaredSignature = signature;
          this.acceptedGeneration = null;
          this.renewRetryAttempt = 0;
          this.clearRenewTimer();
          return;
        }
        const lease = (await response.json()) as WorkspaceBillingInterestResponse;
        if (
          lease.clientId !== this.clientId ||
          lease.acceptedGeneration !== generation ||
          signature !== this.signature
        ) {
          this.scheduleRenewRetry();
          return;
        }
        this.declaredSignature = signature;
        this.acceptedGeneration = BigInt(lease.acceptedGeneration);
        this.renewRetryAttempt = 0;
        this.scheduleRenew(lease.leaseExpiresAt);
      })
      .catch(() => {
        // A declaration is not authoritative until its response is observed.
        // Keep headers disabled and retry even after the prior lease TTL.
        this.scheduleRenewRetry();
      });
    const settled = operation.finally(() => {
      if (this.inFlight !== settled) return;
      this.inFlight = null;
      this.inFlightSignature = '';
      this.inFlightGeneration = null;
    });
    this.inFlight = settled;
    return settled.then(() => {
      if (retryImmediately && !this.unsupported && !this.disposed) {
        return this.flush();
      }
    });
  }

  private scheduleRenew(leaseExpiresAt: string): void {
    this.clearRenewTimer();
    const remaining = Date.parse(leaseExpiresAt) - Date.now();
    const delay = Math.max(
      RENEW_FLOOR_MS,
      Math.min(RENEW_CEILING_MS, Math.floor(remaining / 2)),
    );
    this.renewTimer = setTimeout(() => {
      this.renewTimer = null;
      void this.flush();
    }, delay);
  }

  private scheduleRenewRetry(): void {
    if (this.disposed || this.unsupported || this.scopes().length === 0) return;
    this.clearRenewTimer();
    const index = Math.min(
      this.renewRetryAttempt,
      RENEW_RETRY_DELAYS_MS.length - 1,
    );
    const delay = RENEW_RETRY_DELAYS_MS[index]!;
    this.renewRetryAttempt += 1;
    this.renewTimer = setTimeout(() => {
      this.renewTimer = null;
      void this.flush();
    }, delay);
  }

  private clearRenewTimer(): void {
    if (this.renewTimer) clearTimeout(this.renewTimer);
    this.renewTimer = null;
  }
}

let ownerSequence = 0;
const registry = new WorkspaceBillingInterestRegistry();

export function createWorkspaceBillingInterestOwnerId(): string {
  ownerSequence += 1;
  return `billing-interest-${ownerSequence}`;
}

export function retainWorkspaceBillingInterest(
  ownerId: string,
  scope: WorkspaceBillingInterestScope,
): () => void {
  return registry.retain(ownerId, scope);
}

export function ensureWorkspaceBillingInterestDeclared(): Promise<void> {
  return registry.ensureDeclared();
}

export function workspaceBillingInterestHeaders(
  scope: WorkspaceBillingInterestScope,
): Record<string, string> {
  return registry.headersFor(scope);
}

export function resetWorkspaceBillingInterestRegistry(): void {
  ownerSequence = 0;
  registry.reset();
}

function createClientId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `runtime-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}
