import type {
  PreviewRuntimeCapability,
  PreviewRuntimeDocumentIdentity,
  PreviewRuntimeMessage,
} from '@open-design/contracts/runtime/preview-runtime';
import {
  PreviewRuntimeController,
  type PreviewRuntimeMessageEvent,
  type PreviewRuntimeMessageTarget,
} from './preview-runtime-controller';

export interface PreviewSessionDocument extends PreviewRuntimeDocumentIdentity {
  url: string;
  runtimeProtocol: 'universal';
  sandboxProfile: 'normal' | 'powered';
  deck: boolean;
  target: PreviewRuntimeMessageTarget;
}

export interface PreviewSessionSnapshot {
  current: PreviewRuntimeDocumentIdentity | null;
  standby: PreviewRuntimeDocumentIdentity | null;
  standbyReady: boolean;
  standbyCapabilitiesApplied: boolean;
  standbyPresentationStateApplied: boolean;
  suspended: boolean;
}

export interface PreviewSessionCallbacks {
  onStandbyReady?: (document: PreviewSessionDocument) => void;
  onPromoted?: (
    current: PreviewSessionDocument,
    previous: PreviewSessionDocument | null,
  ) => void;
  onStandbyDiscarded?: (document: PreviewSessionDocument) => void;
  onCapabilitiesApplied?: (
    document: PreviewSessionDocument,
    capabilities: readonly PreviewRuntimeCapability[],
  ) => void;
  onStandbyNavigationFailed?: (
    document: PreviewSessionDocument,
    failure: { reason: 'version_changed'; navigationAttempt: number },
  ) => void;
  onSnapshotChanged?: (snapshot: PreviewSessionSnapshot) => void;
}

interface ManagedPreviewDocument {
  document: PreviewSessionDocument;
  controller: PreviewRuntimeController;
  ready: boolean;
  capabilitiesApplied: boolean;
  presentationStateApplied: boolean;
}

/**
 * Own the last-good/standby lifecycle for one retained preview slot.
 *
 * This class intentionally does not mutate iframe URLs or DOM visibility.
 * React owns those nodes; the session only promotes an exact, fenced standby
 * after the exact runtime reaches DOM-ready and acknowledges all host-owned
 * presentation state. Visual appearance is diagnostic only: a valid blank or
 * broken authored page must still become the current file version.
 */
export class PreviewSession {
  readonly #callbacks: PreviewSessionCallbacks;
  #enabledCapabilities: PreviewRuntimeCapability[];
  #current: ManagedPreviewDocument | null = null;
  #standby: ManagedPreviewDocument | null = null;
  #suspended = false;

  constructor(options: {
    enabledCapabilities?: readonly PreviewRuntimeCapability[];
    callbacks?: PreviewSessionCallbacks;
  } = {}) {
    this.#enabledCapabilities = [...(options.enabledCapabilities ?? [])];
    this.#callbacks = options.callbacks ?? {};
  }

  stageDocument(document: PreviewSessionDocument): void {
    if (sameDocument(this.#current?.document, document)) return;
    if (sameDocument(this.#standby?.document, document)) return;
    if (this.#standby) this.#callbacks.onStandbyDiscarded?.(this.#standby.document);

    const managed: ManagedPreviewDocument = {
      document,
      ready: false,
      capabilitiesApplied: false,
      presentationStateApplied: false,
      controller: new PreviewRuntimeController({
        identity: document,
        target: document.target,
        enabledCapabilities: this.#enabledCapabilities,
        callbacks: {
          onCapabilitiesApplied: (capabilities) => {
            managed.capabilitiesApplied = true;
            managed.presentationStateApplied = false;
            this.#callbacks.onCapabilitiesApplied?.(managed.document, capabilities);
            this.#emitSnapshot();
          },
          onNavigationFailed: (failure) => {
            if (this.#standby !== managed) return;
            this.#callbacks.onStandbyNavigationFailed?.(managed.document, failure);
          },
          onReady: () => {
            if (this.#standby !== managed) return;
            managed.ready = true;
            this.#callbacks.onStandbyReady?.(managed.document);
            if (!this.#promoteIfSettled(managed)) this.#emitSnapshot();
          },
          onPresentationStateApplied: () => {
            managed.presentationStateApplied = true;
            if (!this.#promoteIfSettled(managed)) this.#emitSnapshot();
          },
        },
      }),
    };
    this.#standby = managed;
    managed.controller.probe();
    this.#emitSnapshot();
  }

  discardStandby(identity?: PreviewRuntimeDocumentIdentity): void {
    if (!this.#standby) return;
    if (identity && !sameIdentity(this.#standby.document, identity)) return;
    const discarded = this.#standby.document;
    this.#standby = null;
    this.#callbacks.onStandbyDiscarded?.(discarded);
    this.#emitSnapshot();
  }

  setEnabledCapabilities(capabilities: readonly PreviewRuntimeCapability[]): void {
    this.#enabledCapabilities = [...capabilities];
    for (const managed of [this.#current, this.#standby]) {
      if (managed?.controller.setEnabledCapabilities(capabilities)) {
        managed.capabilitiesApplied = false;
        managed.presentationStateApplied = false;
      }
    }
  }

  setSuspended(suspended: boolean): void {
    if (this.#suspended === suspended) return;
    this.#suspended = suspended;
    this.#emitSnapshot();
  }

  /**
   * Ask retained documents to repeat their lifecycle handshake.
   *
   * A pooled real-URL document can finish from Chromium's cache before the
   * React host installs its window message listener. Reprobing after listener
   * installation closes that race without navigating or replacing the frame.
   */
  probe(): void {
    this.#standby?.controller.probe();
    this.#current?.controller.probe();
  }

  handleMessage(event: PreviewRuntimeMessageEvent): PreviewRuntimeMessage | null {
    return this.#standby?.controller.handleMessage(event)
      ?? this.#current?.controller.handleMessage(event)
      ?? null;
  }

  snapshot(): PreviewSessionSnapshot {
    return {
      current: identityOf(this.#current?.document),
      standby: identityOf(this.#standby?.document),
      standbyReady: this.#standby?.ready ?? false,
      standbyCapabilitiesApplied: this.#standby?.capabilitiesApplied ?? false,
      standbyPresentationStateApplied: this.#standby?.presentationStateApplied ?? false,
      suspended: this.#suspended,
    };
  }

  #promote(managed: ManagedPreviewDocument): void {
    if (this.#standby !== managed) return;
    const previous = this.#current?.document ?? null;
    this.#current = managed;
    this.#standby = null;
    this.#callbacks.onPromoted?.(managed.document, previous);
    this.#emitSnapshot();
  }

  #promoteIfSettled(managed: ManagedPreviewDocument): boolean {
    if (!managed.ready || !managed.capabilitiesApplied || !managed.presentationStateApplied) {
      return false;
    }
    this.#promote(managed);
    return true;
  }

  #emitSnapshot(): void {
    this.#callbacks.onSnapshotChanged?.(this.snapshot());
  }
}

function sameIdentity(
  left: PreviewRuntimeDocumentIdentity,
  right: PreviewRuntimeDocumentIdentity,
): boolean {
  return left.sessionId === right.sessionId && left.documentVersion === right.documentVersion;
}

function sameDocument(
  left: PreviewSessionDocument | undefined,
  right: PreviewSessionDocument,
): boolean {
  return left !== undefined && sameIdentity(left, right) && left.target === right.target;
}

function identityOf(
  document: PreviewSessionDocument | undefined,
): PreviewRuntimeDocumentIdentity | null {
  return document
    ? { sessionId: document.sessionId, documentVersion: document.documentVersion }
    : null;
}
