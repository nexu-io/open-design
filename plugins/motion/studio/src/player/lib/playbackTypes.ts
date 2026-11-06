/**
 * Shared type definitions for the timeline playback subsystem.
 * Kept in a separate module so adapter, DOM, and hook modules can all import
 * from here without creating circular dependencies.
 */

import type { RuntimeTimelineClipIdentity } from "@hyperframes/core";

export interface PlaybackAdapter {
  play: () => void;
  pause: () => void;
  seek: (time: number, options?: { keepPlaying?: boolean }) => void;
  getTime: () => number;
  getDuration: () => number;
  isPlaying: () => boolean;
}

export type RuntimePlaybackAdapter = PlaybackAdapter & {
  renderSeek?: (time: number) => void;
};

export interface StaticSeekPlaybackClock {
  now: () => number;
  requestAnimationFrame: (callback: FrameRequestCallback) => number;
  cancelAnimationFrame: (handle: number) => void;
}

export interface TimelineLike {
  play: () => void;
  pause: () => void;
  seek: (time: number) => void;
  time: () => number;
  duration: () => number;
  isActive: () => boolean;
  labels?: Record<string, number>;
  getLabels?: () => Record<string, number>;
}

export interface ClipManifestClip extends RuntimeTimelineClipIdentity {
  zIndex?: number;
  stackingContextId?: string | null;
  compositionAncestors?: string[];
  playbackStart?: number;
  playbackRate?: number;
}

export interface ClipManifest {
  protocolVersion?: number;
  compositionContractVersion?: number;
  capabilities?: readonly string[];
  fps?: { numerator: number; denominator: number };
  durationSeconds?: number;
  clips: ClipManifestClip[];
  scenes: Array<{ id: string; label: string; start: number; duration: number }>;
  durationInFrames: number;
  compositionWidth?: number;
  compositionHeight?: number;
}

export type IframeWindow = Window & {
  __player?: RuntimePlaybackAdapter;
  __playerReady?: boolean;
  __timeline?: TimelineLike;
  __timelines?: Record<string, TimelineLike>;
  __clipManifest?: ClipManifest;
  __hfWaitForSeekCompletion?: () => Promise<void>;
  /** Declared runtime-side in core's window.d.ts, which this package cannot see.
   *  Every member stays optional and is optional-called, so a runtime that
   *  predates the hook degrades to a no-op instead of throwing. */
  __hf?: {
    leasePausedMedia?: (el: HTMLMediaElement) => void;
    releasePausedMedia?: (el: HTMLMediaElement) => void;
    setLoopStart?: (seconds: number | null) => void;
  };
};
