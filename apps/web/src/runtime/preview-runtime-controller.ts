import {
  createPreviewRuntimeProbeMessage,
  createPreviewRuntimePresentationStateBarrierMessage,
  createPreviewRuntimeSetCapabilitiesMessage,
  normalizePreviewRuntimeCapabilities,
  parsePreviewRuntimeMessage,
  previewRuntimeMessageMatchesDocument,
  type PreviewRuntimeCapability,
  type PreviewRuntimeDocumentIdentity,
  type PreviewRuntimeMessage,
} from '@open-design/contracts/runtime/preview-runtime';

export interface PreviewRuntimeMessageTarget {
  postMessage(message: unknown, targetOrigin: string): void;
}

export interface PreviewRuntimeControllerCallbacks {
  onCapabilitiesApplied?: (capabilities: readonly PreviewRuntimeCapability[]) => void;
  onNavigationFailed?: (failure: {
    reason: 'version_changed';
    navigationAttempt: number;
  }) => void;
  onReady?: () => void;
  onPresentationStateApplied?: () => void;
}

export interface PreviewRuntimeMessageEvent {
  source: unknown;
  data: unknown;
}

/**
 * Host-side protocol state for one exact iframe document. It has no React
 * lifecycle of its own: PreviewSession will own the instance and feed window
 * message events to it while the corresponding frame is retained.
 */
export class PreviewRuntimeController {
  readonly #identity: PreviewRuntimeDocumentIdentity;
  readonly #target: PreviewRuntimeMessageTarget;
  readonly #callbacks: PreviewRuntimeControllerCallbacks;
  #available: PreviewRuntimeCapability[] | null = null;
  #desired: PreviewRuntimeCapability[];
  #lastCommandKey: string | null = null;
  #nextCapabilityRevision = 1;
  #pendingCapabilityRevision: number | null = null;
  #nextPresentationRevision = 1;
  #pendingPresentationRevision: number | null = null;

  constructor(options: {
    identity: PreviewRuntimeDocumentIdentity;
    target: PreviewRuntimeMessageTarget;
    enabledCapabilities?: readonly PreviewRuntimeCapability[];
    callbacks?: PreviewRuntimeControllerCallbacks;
  }) {
    this.#identity = options.identity;
    this.#target = options.target;
    this.#desired = normalizePreviewRuntimeCapabilities(options.enabledCapabilities ?? []);
    this.#callbacks = options.callbacks ?? {};
  }

  setEnabledCapabilities(capabilities: readonly PreviewRuntimeCapability[]): boolean {
    this.#desired = normalizePreviewRuntimeCapabilities(capabilities);
    return this.#sendCapabilityCommand();
  }

  probe(): void {
    this.#target.postMessage(createPreviewRuntimeProbeMessage(this.#identity), '*');
  }

  handleMessage(event: PreviewRuntimeMessageEvent): PreviewRuntimeMessage | null {
    if (event.source !== this.#target) return null;
    const message = parsePreviewRuntimeMessage(event.data);
    if (message === null || !previewRuntimeMessageMatchesDocument(message, this.#identity)) return null;

    switch (message.type) {
      case 'od:preview:probe':
        return null;
      case 'od:preview:hello':
        this.#available = message.availableCapabilities;
        this.#lastCommandKey = null;
        this.#pendingCapabilityRevision = null;
        this.#pendingPresentationRevision = null;
        this.#sendCapabilityCommand();
        break;
      case 'od:preview:capabilities-applied':
        // Answered-ness is decided by WHICH command the document replied to,
        // not by what it managed to turn on. A module whose `enable()` throws
        // is honestly left out of the reply, and matching on contents read that
        // honest answer as noise: nothing fired, no barrier was sent, a standby
        // waiting on the acknowledgement was never promoted, and nothing
        // retried or reported. Documents served before the revision existed
        // echo none, and keep the contents match they were built against.
        if (this.#capabilitiesAppliedAnswersOutstandingCommand(message)) {
          this.#pendingCapabilityRevision = null;
          this.#callbacks.onCapabilitiesApplied?.(message.enabledCapabilities);
          const revision = this.#nextPresentationRevision;
          this.#nextPresentationRevision = revision >= Number.MAX_SAFE_INTEGER ? 1 : revision + 1;
          this.#pendingPresentationRevision = revision;
          this.#target.postMessage(createPreviewRuntimePresentationStateBarrierMessage({
            ...this.#identity,
            revision,
          }), '*');
        }
        break;
      case 'od:preview:presentation-state-applied':
        if (message.revision === this.#pendingPresentationRevision) {
          this.#pendingPresentationRevision = null;
          this.#callbacks.onPresentationStateApplied?.();
        }
        break;
      case 'od:preview:navigation-failed':
        this.#callbacks.onNavigationFailed?.({
          reason: message.reason,
          navigationAttempt: message.navigationAttempt,
        });
        break;
      case 'od:preview:ready':
        this.#callbacks.onReady?.();
        break;
      case 'od:preview:set-capabilities':
      case 'od:preview:presentation-state-barrier':
        return null;
    }
    return message;
  }

  /**
   * Whether this reply answers the command still outstanding.
   *
   * The revision is the fence. It survives a document that applied less than it
   * was asked for, which the capability list cannot: comparing lists makes a
   * partial apply indistinguishable from a reply to a superseded command, and
   * the host chose to ignore both.
   */
  #capabilitiesAppliedAnswersOutstandingCommand(
    message: Extract<PreviewRuntimeMessage, { type: 'od:preview:capabilities-applied' }>,
  ): boolean {
    if (message.revision !== undefined) return message.revision === this.#pendingCapabilityRevision;
    return message.enabledCapabilities.join('\0') === this.#lastCommandKey;
  }

  #sendCapabilityCommand(): boolean {
    if (this.#available === null) return false;
    const desired = new Set(this.#desired);
    const enabledCapabilities = this.#available.filter((capability) => desired.has(capability));
    const commandKey = enabledCapabilities.join('\0');
    if (commandKey === this.#lastCommandKey) return false;
    this.#lastCommandKey = commandKey;
    const revision = this.#nextCapabilityRevision;
    this.#nextCapabilityRevision = revision >= Number.MAX_SAFE_INTEGER ? 1 : revision + 1;
    this.#pendingCapabilityRevision = revision;
    this.#pendingPresentationRevision = null;
    this.#target.postMessage(createPreviewRuntimeSetCapabilitiesMessage({
      ...this.#identity,
      enabledCapabilities,
      revision,
    }), '*');
    return true;
  }
}
