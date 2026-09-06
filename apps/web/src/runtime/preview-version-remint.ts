import type { PreviewRuntimeDocumentIdentity } from '@open-design/contracts/runtime/preview-runtime';

export const PREVIEW_VERSION_AUTOMATIC_REMINT_LIMIT = 2;

export interface PreviewVersionRemintFailure extends PreviewRuntimeDocumentIdentity {
  navigationAttempt: number;
}

export type PreviewVersionRemintDecision = 'remint' | 'duplicate' | 'exhausted';

/**
 * Bounds immediate VERSION_CHANGED recovery without conflating it with the
 * five-second Runtime handshake timeout. A content generation gets a small
 * automatic budget; an exact failed attempt is consumed at most once.
 */
export class PreviewVersionRemintBudget {
  readonly #limit: number;
  #contentGeneration: string | null = null;
  #automaticRemints = 0;
  readonly #handledAttempts = new Set<string>();

  constructor(limit = PREVIEW_VERSION_AUTOMATIC_REMINT_LIMIT) {
    this.#limit = Math.max(0, Math.floor(limit));
  }

  consume(
    contentGeneration: string,
    failure: PreviewVersionRemintFailure,
  ): PreviewVersionRemintDecision {
    this.#selectGeneration(contentGeneration);
    const attemptKey = [
      failure.sessionId,
      failure.documentVersion,
      String(failure.navigationAttempt),
    ].join('\0');
    if (this.#handledAttempts.has(attemptKey)) return 'duplicate';
    this.#handledAttempts.add(attemptKey);
    if (this.#automaticRemints >= this.#limit) return 'exhausted';
    this.#automaticRemints += 1;
    return 'remint';
  }

  reset(contentGeneration: string): void {
    this.#contentGeneration = contentGeneration;
    this.#automaticRemints = 0;
    this.#handledAttempts.clear();
  }

  #selectGeneration(contentGeneration: string): void {
    if (this.#contentGeneration === contentGeneration) return;
    this.reset(contentGeneration);
  }
}
