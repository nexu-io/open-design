import {
  fetchProjectScopedPreviewNavigation,
  renewProjectPreviewBaseScope,
  type ProjectScopedPreviewNavigation,
  type ProjectScopedPreviewNavigationResult,
} from '../providers/registry';

export interface ProjectPreviewNavigationRequest {
  projectId: string;
  fileName: string;
  /** Exact file/reload/authority identity supplied by the viewer. */
  revisionKey: string;
  authorizationKey: string;
}

export interface ProjectPreviewNavigationCacheOptions {
  maxEntries?: number;
  refreshAheadMs?: number;
  now?: () => number;
  mint?: (
    projectId: string,
    fileName: string,
  ) => Promise<ProjectScopedPreviewNavigationResult>;
  renew?: (projectId: string, href: string) => Promise<number | null>;
}

const DEFAULT_MAX_ENTRIES = 64;
export const PROJECT_PREVIEW_NAVIGATION_REFRESH_AHEAD_MS = 5 * 60 * 1000;

function requestKey(request: ProjectPreviewNavigationRequest): string {
  return [
    request.authorizationKey,
    request.projectId,
    request.fileName,
    request.revisionKey,
  ].join('\0');
}

/**
 * Reuse one scoped navigation capability for an exact file version so an LRU
 * iframe can reattach to the same session instead of minting a new origin.
 * Near expiry, renew the existing scope in place; only a failed renewal mints
 * a replacement that the PreviewSession will stage atomically.
 */
export class ProjectPreviewNavigationCache {
  readonly #maxEntries: number;
  readonly #refreshAheadMs: number;
  readonly #now: () => number;
  readonly #mint: NonNullable<ProjectPreviewNavigationCacheOptions['mint']>;
  readonly #renew: NonNullable<ProjectPreviewNavigationCacheOptions['renew']>;
  readonly #settled = new Map<string, ProjectScopedPreviewNavigation>();
  readonly #inFlight = new Map<string, Promise<ProjectScopedPreviewNavigationResult>>();
  #epoch = 0;

  constructor(options: ProjectPreviewNavigationCacheOptions = {}) {
    this.#maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
    this.#refreshAheadMs = Math.max(
      0,
      options.refreshAheadMs ?? PROJECT_PREVIEW_NAVIGATION_REFRESH_AHEAD_MS,
    );
    this.#now = options.now ?? Date.now;
    this.#mint = options.mint ?? fetchProjectScopedPreviewNavigation;
    this.#renew = options.renew ?? renewProjectPreviewBaseScope;
  }

  get(request: ProjectPreviewNavigationRequest): Promise<ProjectScopedPreviewNavigationResult> {
    const key = requestKey(request);
    const cached = this.#settled.get(key);
    if (cached && cached.renewalScope.expiresAt - this.#now() > this.#refreshAheadMs) {
      this.#touch(key, cached);
      return Promise.resolve(cached);
    }
    const existing = this.#inFlight.get(key);
    if (existing) return existing;

    const epoch = this.#epoch;
    const promise = this.#refresh(request, key, cached, epoch).finally(() => {
      if (this.#inFlight.get(key) === promise) this.#inFlight.delete(key);
    });
    this.#inFlight.set(key, promise);
    return promise;
  }

  clear(): void {
    this.#epoch += 1;
    this.#settled.clear();
    this.#inFlight.clear();
  }

  async #refresh(
    request: ProjectPreviewNavigationRequest,
    key: string,
    cached: ProjectScopedPreviewNavigation | undefined,
    epoch: number,
  ): Promise<ProjectScopedPreviewNavigationResult> {
    if (cached) {
      const expiresAt = await this.#renew(
        request.projectId,
        cached.renewalScope.href,
      );
      if (expiresAt !== null && expiresAt > this.#now()) {
        const renewed = {
          ...cached,
          renewalScope: { ...cached.renewalScope, expiresAt },
        };
        if (epoch === this.#epoch) this.#touch(key, renewed);
        return renewed;
      }
    }

    const minted = await this.#mint(request.projectId, request.fileName);
    if (!minted) return minted;
    if (minted.renewalScope.expiresAt <= this.#now()) return null;
    if (epoch === this.#epoch) this.#touch(key, minted);
    return minted;
  }

  #touch(key: string, navigation: ProjectScopedPreviewNavigation): void {
    this.#settled.delete(key);
    this.#settled.set(key, navigation);
    while (this.#settled.size > this.#maxEntries) {
      const oldest = this.#settled.keys().next().value as string | undefined;
      if (oldest === undefined) break;
      this.#settled.delete(oldest);
    }
  }
}

export const projectPreviewNavigationCache = new ProjectPreviewNavigationCache();
