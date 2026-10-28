import type { OwnedProjectContentUpdate, OwnedProjectContentUpdateRequest } from '@open-design/contracts';
import type { ResourceHubPrincipal } from './resource-principal.js';
import type { PublishedResourceVersion } from './publish-scheduler.js';
import { ownedContentScopeKey, type OwnedContentRecord, type OwnedContentScope, type OwnedContentStore } from './owned-content-store.js';

const DAY_MS = 24 * 60 * 60 * 1_000;

export interface OwnedContentSyncDeps {
  store: OwnedContentStore;
  head(scope: OwnedContentScope): Promise<number | null>;
  hasContent(scope: OwnedContentScope): Promise<boolean>;
  isSupported(scope: OwnedContentScope): boolean;
  isBusy(projectId: string): boolean;
  fingerprint(scope: OwnedContentScope): Promise<string>;
  apply(scope: OwnedContentScope, expectedVersion: number): Promise<{ version: number; fingerprint: string }>;
  publicationScope(projectId: string, principal?: ResourceHubPrincipal | null): OwnedContentScope | null;
  onChange(scope: OwnedContentScope): void;
  onApplied?(scope: OwnedContentScope, version: number): void | Promise<void>;
  now?: () => number;
}

/** One daemon authority for owner replacement, shared by page entry, SSE and CLI. */
export function createOwnedContentSync(deps: OwnedContentSyncDeps) {
  const now = deps.now ?? Date.now;
  const applying = new Set<string>();
  const publications = new Map<string, number>();
  const inFlight = new Map<string, Promise<OwnedProjectContentUpdate>>();
  const states = new Map<string, OwnedProjectContentUpdate>();

  function snapshot(scope: OwnedContentScope, state?: OwnedProjectContentUpdate['state'], errorCode?: OwnedProjectContentUpdate['errorCode']): OwnedProjectContentUpdate {
    const record = deps.store.read(scope);
    const pending = record.latestVersion != null && record.latestVersion > (record.localVersion ?? -1);
    const suppressed = (record.promptSuppressedUntil ?? 0) > now();
    return {
      state: state ?? (pending ? suppressed ? 'suppressed'
        : record.ignoredVersion === record.latestVersion ? 'ignored' : 'confirmation_required' : 'up_to_date'),
      latestVersion: record.latestVersion, localVersion: record.localVersion,
      promptSuppressedUntil: record.promptSuppressedUntil != null && record.promptSuppressedUntil > now() ? record.promptSuppressedUntil : null,
      updatedAt: now(), ...(errorCode ? { errorCode } : {}),
    };
  }

  function publish(scope: OwnedContentScope, state?: OwnedProjectContentUpdate['state'], errorCode?: OwnedProjectContentUpdate['errorCode']) {
    const update = snapshot(scope, state, errorCode);
    states.set(ownedContentScopeKey(scope), update);
    deps.onChange(scope);
    return update;
  }

  function updateRecord(scope: OwnedContentScope, patch: Partial<OwnedContentRecord>) {
    deps.store.write(scope, { ...deps.store.read(scope), ...patch });
  }

  async function perform(scope: OwnedContentScope, request: OwnedProjectContentUpdateRequest, hintedVersion?: number): Promise<OwnedProjectContentUpdate> {
    if (!deps.isSupported(scope)) return publish(scope, 'unsupported', 'PROJECT_DIRECTORY_UNSUPPORTED');
    if (scope.ownerMemberId !== scope.viewerMemberId) throw new Error('owned content requires the current owner');
    if (request.action === 'reset-preference') {
      updateRecord(scope, { promptSuppressedUntil: null, ignoredVersion: null });
      return publish(scope);
    }
    const head = hintedVersion ?? await deps.head(scope);
    if (head != null && (!Number.isSafeInteger(head) || head < 0)) throw new Error('invalid published version');
    const old = deps.store.read(scope);
    const latest = head == null ? old.latestVersion : Math.max(old.latestVersion ?? -1, head);
    updateRecord(scope, { latestVersion: latest });
    const record = deps.store.read(scope);
    const hasContent = await deps.hasContent(scope);
    if (latest == null || (hasContent && latest <= (record.localVersion ?? -1))) return publish(scope, 'up_to_date');
    if (request.action === 'dismiss') {
      // Reminder silence covers all heads, so it does not depend on accepting an exact head.
      if (request.version !== latest && !request.dontPromptFor24h) return publish(scope);
      updateRecord(scope, request.dontPromptFor24h
        ? { promptSuppressedUntil: now() + DAY_MS, ignoredVersion: null }
        : { ignoredVersion: (record.promptSuppressedUntil ?? 0) > now() ? null : latest });
      return publish(scope);
    }
    const accepted = request.action === 'accept' && request.version === latest;
    if (request.action === 'accept' && !accepted) {
      return publish(scope, 'confirmation_required');
    }
    if (request.manual && request.action === 'check') {
      updateRecord(scope, { ignoredVersion: null });
    }
    // Existing files are replaced only by explicit exact-head acceptance.
    if (hasContent && !accepted) return publish(scope, request.manual ? 'confirmation_required' : undefined);
    if (applying.has(scope.projectId) || deps.isBusy(scope.projectId) || (publications.get(scope.projectId) ?? 0) > 0) return publish(scope, 'busy', 'PROJECT_BUSY');
    applying.add(scope.projectId);
    publish(scope, 'downloading');
    try {
      // Acceptance is one replacement, independent of any existing reminder silence.
      const received = await deps.apply(scope, latest);
      if (received.version !== latest) throw new Error('published version changed; check again');
      updateRecord(scope, {
        localVersion: received.version,
        latestVersion: Math.max(deps.store.read(scope).latestVersion ?? -1, received.version),
        fingerprint: received.fingerprint, ignoredVersion: null,
        ...(accepted && request.dontPromptFor24h ? { promptSuppressedUntil: now() + DAY_MS } : {}),
      });
      await deps.onApplied?.(scope, received.version);
      return publish(scope);
    } finally { applying.delete(scope.projectId); }
  }

  async function request(
    scope: OwnedContentScope,
    input: OwnedProjectContentUpdateRequest,
    hintedVersion?: number,
    propagateError = false,
  ): Promise<OwnedProjectContentUpdate> {
    const key = ownedContentScopeKey(scope);
    const pending = inFlight.get(key);
    if (pending) {
      try {
        await pending;
      } catch (error) {
        const update = publishFailure(scope, error);
        if (propagateError) throw error;
        return update;
      }
      if (input.action !== 'check' || input.manual || (hintedVersion != null && hintedVersion > (deps.store.read(scope).latestVersion ?? -1))) {
        return request(scope, input, hintedVersion, propagateError);
      }
      return read(scope);
    }
    let task!: Promise<OwnedProjectContentUpdate>;
    task = perform(scope, input, hintedVersion)
      .finally(() => { if (inFlight.get(key) === task) inFlight.delete(key); });
    inFlight.set(key, task);
    try {
      return await task;
    } catch (error) {
      const update = publishFailure(scope, error);
      if (propagateError) throw error;
      return update;
    }
  }

  function publishFailure(scope: OwnedContentScope, error: unknown): OwnedProjectContentUpdate {
    const code = typeof error === 'object' && error != null && 'code' in error ? error.code : null;
    return code === 'PROJECT_BUSY'
      ? publish(scope, 'busy', 'PROJECT_BUSY')
      : code === 'PROJECT_DIRECTORY_UNSUPPORTED'
        ? publish(scope, 'unsupported', 'PROJECT_DIRECTORY_UNSUPPORTED')
        : publish(scope, 'failed', 'PROJECT_SYNC_FAILED');
  }

  function read(scope: OwnedContentScope): OwnedProjectContentUpdate {
    const previous = states.get(ownedContentScopeKey(scope));
    // Derive consent states afresh so expiry re-offers even an unchanged pending head.
    const transient = previous && ['downloading', 'busy', 'failed', 'unsupported'].includes(previous.state);
    return previous ? { ...snapshot(scope, transient ? previous.state : undefined, transient ? previous.errorCode : undefined), updatedAt: previous.updatedAt } : snapshot(scope);
  }

  return {
    request, read,
    isApplying: (projectId: string) => applying.has(projectId),
    localVersion: (scope: OwnedContentScope) => deps.store.read(scope).localVersion,
    async shouldPublish(projectId: string, principal?: ResourceHubPrincipal): Promise<boolean> {
      if (applying.has(projectId)) return false;
      const scope = deps.publicationScope(projectId, principal);
      if (!scope || !deps.isSupported(scope)) return true;
      const record = deps.store.read(scope);
      // A missing checkpoint is not a startup publish. Actual later edits can publish.
      return record.fingerprint == null || record.fingerprint !== await deps.fingerprint(scope);
    },
    async withPublication(projectId: string, principal: ResourceHubPrincipal | null | undefined, operation: () => Promise<PublishedResourceVersion | null>): Promise<PublishedResourceVersion | null> {
      if (applying.has(projectId)) throw Object.assign(new Error('project is receiving cloud content'), { code: 'PROJECT_BUSY' });
      publications.set(projectId, (publications.get(projectId) ?? 0) + 1);
      try {
        const scope = deps.publicationScope(projectId, principal);
        const supported = scope && deps.isSupported(scope);
        const before = supported ? await deps.fingerprint(scope) : null;
        const result = await operation();
        if (result && supported && scope) {
          const after = await deps.fingerprint(scope);
          const record = deps.store.read(scope);
          updateRecord(scope, {
            localVersion: Math.max(record.localVersion ?? -1, result.version),
            latestVersion: Math.max(record.latestVersion ?? -1, result.version),
            ...(before === after ? { fingerprint: after } : {}),
          });
          publish(scope);
        }
        return result;
      } finally {
        const count = (publications.get(projectId) ?? 1) - 1;
        if (count === 0) publications.delete(projectId); else publications.set(projectId, count);
      }
    },
  };
}

export type OwnedContentSync = ReturnType<typeof createOwnedContentSync>;
