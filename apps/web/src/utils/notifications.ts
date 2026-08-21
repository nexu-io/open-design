import type { Dict } from '../i18n/types';
import type { NotificationsConfig } from '../types';

export type SoundId = string;

export interface SoundOption {
  id: SoundId;
  labelKey: keyof Dict;
}

export const SUCCESS_SOUNDS: SoundOption[] = [
  { id: 'ding', labelKey: 'settings.notifySoundDing' },
  { id: 'chime', labelKey: 'settings.notifySoundChime' },
  { id: 'two-tone-up', labelKey: 'settings.notifySoundTwoToneUp' },
  { id: 'pluck', labelKey: 'settings.notifySoundPluck' },
];

export const FAILURE_SOUNDS: SoundOption[] = [
  { id: 'buzz', labelKey: 'settings.notifySoundBuzz' },
  { id: 'two-tone-down', labelKey: 'settings.notifySoundTwoToneDown' },
  { id: 'thud', labelKey: 'settings.notifySoundThud' },
];

export const DEFAULT_SUCCESS_SOUND_ID: SoundId = 'ding';
export const DEFAULT_FAILURE_SOUND_ID: SoundId = 'buzz';

type AudioCtxCtor = typeof AudioContext;
type NotificationOptionsWithBrowserExtensions = NotificationOptions & {
  renotify?: boolean;
};

let ctx: AudioContext | null = null;
const activeNotifications = new Set<Notification>();
const SERVICE_WORKER_URL = '/od-notifications-sw.js';
const COMPLETION_FEEDBACK_GESTURE_EVENT = 'od:completion-feedback-gesture';

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  const Ctor: AudioCtxCtor | undefined =
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioCtxCtor }).webkitAudioContext;
  if (!Ctor) return null;
  if (!ctx) {
    try {
      ctx = new Ctor();
    } catch {
      return null;
    }
  }
  if (ctx && ctx.state === 'suspended') {
    void ctx.resume().catch(() => {
      // Autoplay policy can refuse — fall through silently. The next
      // user-gesture-driven call will retry.
    });
  }
  return ctx;
}

interface ToneSpec {
  freq: number;
  type: OscillatorType;
  start: number;
  duration: number;
  gain?: number;
  // Optional lowpass cutoff applied via a BiquadFilter for plucky textures.
  lowpass?: number;
}

function playTones(c: AudioContext, tones: ToneSpec[]): void {
  const now = c.currentTime;
  for (const tone of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = tone.type;
    osc.frequency.value = tone.freq;
    const peak = tone.gain ?? 0.18;
    const startAt = now + tone.start;
    const endAt = startAt + tone.duration;
    // Short attack to avoid clicks; exponential-ish decay via linear ramp
    // to a near-zero value (exponentialRamp can't reach 0).
    gain.gain.setValueAtTime(0.0001, startAt);
    gain.gain.linearRampToValueAtTime(peak, startAt + Math.min(0.005, tone.duration * 0.2));
    gain.gain.exponentialRampToValueAtTime(0.0001, endAt);

    let last: AudioNode = osc;
    if (tone.lowpass) {
      const lp = c.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.value = tone.lowpass;
      osc.connect(lp);
      last = lp;
    }
    last.connect(gain);
    gain.connect(c.destination);
    osc.start(startAt);
    osc.stop(endAt + 0.02);
  }
}

const SOUND_PLAYERS: Record<SoundId, (c: AudioContext) => void> = {
  ding: (c) => {
    playTones(c, [{ freq: 880, type: 'sine', start: 0, duration: 0.25, gain: 0.22 }]);
  },
  chime: (c) => {
    playTones(c, [
      { freq: 880, type: 'triangle', start: 0, duration: 0.4, gain: 0.18 },
      { freq: 1320, type: 'triangle', start: 0, duration: 0.4, gain: 0.12 },
    ]);
  },
  'two-tone-up': (c) => {
    playTones(c, [
      { freq: 660, type: 'square', start: 0, duration: 0.08, gain: 0.16 },
      { freq: 990, type: 'square', start: 0.09, duration: 0.08, gain: 0.16 },
    ]);
  },
  pluck: (c) => {
    playTones(c, [
      { freq: 220, type: 'sawtooth', start: 0, duration: 0.15, gain: 0.22, lowpass: 1200 },
    ]);
  },
  buzz: (c) => {
    playTones(c, [
      { freq: 165, type: 'square', start: 0, duration: 0.06, gain: 0.2 },
      { freq: 165, type: 'square', start: 0.1, duration: 0.06, gain: 0.2 },
      { freq: 165, type: 'square', start: 0.2, duration: 0.06, gain: 0.2 },
    ]);
  },
  'two-tone-down': (c) => {
    playTones(c, [
      { freq: 880, type: 'sine', start: 0, duration: 0.12, gain: 0.2 },
      { freq: 440, type: 'sine', start: 0.13, duration: 0.12, gain: 0.2 },
    ]);
  },
  thud: (c) => {
    playTones(c, [{ freq: 80, type: 'sine', start: 0, duration: 0.12, gain: 0.32 }]);
  },
};

export function playSound(id: SoundId): void {
  const c = getCtx();
  if (!c) return;
  const player = SOUND_PLAYERS[id];
  if (!player) return;
  try {
    player(c);
  } catch {
    // A node creation / connection failure should never throw out to UI code.
  }
}

/**
 * Create/resume the shared AudioContext from a trusted user gesture without
 * playing a preview. Later task-completion sounds can then run after the
 * gesture has ended without being rejected by browser autoplay policy.
 */
export function prepareCompletionSound(): void {
  getCtx();
}

export function previewSuccess(id: SoundId): void {
  playSound(id);
}

export function previewFailure(id: SoundId): void {
  playSound(id);
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof Notification === 'undefined') return 'unsupported';
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission === 'granted' || Notification.permission === 'denied') {
    return Notification.permission;
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return 'denied';
  }
}

export interface CompletionFeedbackActivationResult {
  desktopPermission: NotificationPermission | 'unsupported' | null;
}

/**
 * Arm completion feedback until the first real task submission. The submit
 * surfaces dispatch the event synchronously from their click/keyboard handler,
 * preserving the trusted gesture required by browser permission/autoplay APIs
 * without prompting on unrelated app interactions.
 */
export function armCompletionFeedbackOnFirstGesture(
  config: NotificationsConfig,
  onResult: (result: CompletionFeedbackActivationResult) => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  let armed = true;
  function dispose() {
    if (!armed) return;
    armed = false;
    window.removeEventListener(COMPLETION_FEEDBACK_GESTURE_EVENT, activate);
  }
  function activate() {
    if (!armed) return;
    dispose();
    if (config.soundEnabled) prepareCompletionSound();
    if (!config.desktopEnabled) {
      onResult({ desktopPermission: null });
      return;
    }
    void requestNotificationPermission().then((desktopPermission) => {
      onResult({ desktopPermission });
    });
  }
  window.addEventListener(COMPLETION_FEEDBACK_GESTURE_EVENT, activate);
  return dispose;
}

/** Signal a real task submission while still inside its trusted user gesture. */
export function notifyCompletionFeedbackGesture(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new window.Event(COMPLETION_FEEDBACK_GESTURE_EVENT));
}

export interface CompletionNotificationOpts {
  status: 'succeeded' | 'failed';
  title: string;
  body: string;
  onClick?: () => void;
}

export type CompletionNotificationResult =
  | 'shown'
  | 'unsupported'
  | 'permission-denied'
  | 'failed';

function notificationOptionsFor(
  opts: CompletionNotificationOpts,
): NotificationOptionsWithBrowserExtensions {
  const tag = `od-task-${opts.status}`;
  return {
    body: opts.body,
    tag,
    renotify: true,
    data: {
      status: opts.status,
      url: typeof window === 'undefined' ? '/' : window.location.href,
    },
  };
}

async function showViaServiceWorker(
  opts: CompletionNotificationOpts,
): Promise<CompletionNotificationResult | null> {
  if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return null;
  try {
    const registration = await navigator.serviceWorker.register(SERVICE_WORKER_URL);
    const readyRegistration = await navigator.serviceWorker.ready.catch(() => registration);
    if (!readyRegistration.showNotification) return null;
    await readyRegistration.showNotification(opts.title, notificationOptionsFor(opts));
    return 'shown';
  } catch {
    return null;
  }
}

function showViaConstructor(opts: CompletionNotificationOpts): CompletionNotificationResult {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'granted') return 'permission-denied';
  try {
    const note = new Notification(opts.title, notificationOptionsFor(opts));
    activeNotifications.add(note);
    const release = () => {
      note.onclick = null;
      note.onclose = null;
      note.onerror = null;
      activeNotifications.delete(note);
    };
    note.onclick = () => {
      try {
        if (typeof window !== 'undefined') window.focus();
      } catch {
        /* ignore */
      }
      opts.onClick?.();
      try {
        note.close();
      } catch {
        /* ignore */
      }
    };
    note.onclose = release;
    note.onerror = release;
    return 'shown';
  } catch {
    return 'failed';
  }
}

export async function showCompletionNotification(
  opts: CompletionNotificationOpts,
): Promise<CompletionNotificationResult> {
  if (typeof Notification === 'undefined') return 'unsupported';
  if (Notification.permission !== 'granted') return 'permission-denied';
  return (await showViaServiceWorker(opts)) ?? showViaConstructor(opts);
}
