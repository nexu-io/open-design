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
        this.#pendingPresentationRevision = null;
        this.#sendCapabilityCommand();
        break;
      case 'od:preview:capabilities-applied':
        if (message.enabledCapabilities.join('\0') === this.#lastCommandKey) {
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

  #sendCapabilityCommand(): boolean {
    if (this.#available === null) return false;
    const desired = new Set(this.#desired);
    const enabledCapabilities = this.#available.filter((capability) => desired.has(capability));
    const commandKey = enabledCapabilities.join('\0');
    if (commandKey === this.#lastCommandKey) return false;
    this.#lastCommandKey = commandKey;
    this.#pendingPresentationRevision = null;
    this.#target.postMessage(createPreviewRuntimeSetCapabilitiesMessage({
      ...this.#identity,
      enabledCapabilities,
    }), '*');
    return true;
  }
}
