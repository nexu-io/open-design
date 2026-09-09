import {
  scanHtmlHeadForStreamingInjection,
  type HtmlHeadScanResult,
} from './html-stream-injection.js';

export interface HtmlPreviewPolicyRequest {
  filePath: string;
  documentVersion: string;
  /** Stable logical source identity when filePath is a request-local snapshot. */
  cacheKey?: string;
}

export interface HtmlPreviewPolicy {
  documentVersion: string;
  sandboxProfile: 'normal' | 'powered';
  deck: boolean;
  guards: {
    storage: boolean;
    focus: boolean;
    redirect: boolean;
  };
  scan: HtmlHeadScanResult;
}

interface PolicyEntry {
  documentVersion: string;
  promise: Promise<HtmlPreviewPolicy>;
  settled: boolean;
  token: symbol;
}

export interface HtmlPreviewPolicyIndexOptions {
  scan?: (filePath: string) => Promise<HtmlHeadScanResult>;
  maxEntries?: number;
}

const DEFAULT_MAX_ENTRIES = 256;

function policyFromScan(
  documentVersion: string,
  scan: HtmlHeadScanResult,
): HtmlPreviewPolicy {
  return {
    documentVersion,
    sandboxProfile: scan.needsPoweredPreview ? 'powered' : 'normal',
    deck: scan.hasDeckStageElement
      || scan.hasFrameworkDeckId
      || scan.hasExplicitDeckSlideElement
      || scan.hasLegacyDeckScreenSlides,
    guards: {
      storage: scan.needsSandboxShim || !scan.complete,
      focus: scan.needsFocusGuard || !scan.complete,
      redirect: scan.needsRedirectGuard || !scan.complete,
    },
    scan,
  };
}

export class HtmlPreviewPolicyIndex {
  readonly #entries = new Map<string, PolicyEntry>();
  readonly #scan: (filePath: string) => Promise<HtmlHeadScanResult>;
  readonly #maxEntries: number;

  constructor(options: HtmlPreviewPolicyIndexOptions = {}) {
    this.#scan = options.scan ?? scanHtmlHeadForStreamingInjection;
    this.#maxEntries = Math.max(1, Math.floor(options.maxEntries ?? DEFAULT_MAX_ENTRIES));
  }

  get(request: HtmlPreviewPolicyRequest): Promise<HtmlPreviewPolicy> {
    const cacheKey = request.cacheKey ?? request.filePath;
    const current = this.#entries.get(cacheKey);
    if (current?.documentVersion === request.documentVersion) {
      this.#touch(cacheKey, current);
      return current.promise;
    }

    const token = Symbol(request.documentVersion);
    const promise = this.#scan(request.filePath)
      .then((scan) => policyFromScan(request.documentVersion, scan))
      .then((policy) => {
        const active = this.#entries.get(cacheKey);
        if (active?.token === token) {
          active.settled = true;
          this.#prune();
        }
        return policy;
      })
      .catch((error: unknown) => {
        if (this.#entries.get(cacheKey)?.token === token) {
          this.#entries.delete(cacheKey);
        }
        throw error;
      });
    const entry: PolicyEntry = {
      documentVersion: request.documentVersion,
      promise,
      settled: false,
      token,
    };
    this.#entries.set(cacheKey, entry);
    this.#prune();
    return promise;
  }

  /**
   * Start exact-version classification before a foreground preview needs it.
   * Failures remain retryable through get(); background callers deliberately
   * do not own or observe the scan promise.
   */
  prewarm(request: HtmlPreviewPolicyRequest): void {
    void this.get(request).catch(() => undefined);
  }

  invalidate(filePath: string): void {
    this.#entries.delete(filePath);
  }

  clear(): void {
    this.#entries.clear();
  }

  #touch(filePath: string, entry: PolicyEntry): void {
    this.#entries.delete(filePath);
    this.#entries.set(filePath, entry);
  }

  #prune(): void {
    while (this.#entries.size > this.#maxEntries) {
      const oldestSettled = [...this.#entries].find(([, entry]) => entry.settled);
      if (!oldestSettled) return;
      this.#entries.delete(oldestSettled[0]);
    }
  }
}
