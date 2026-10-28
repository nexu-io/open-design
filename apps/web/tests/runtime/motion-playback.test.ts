// @vitest-environment jsdom
import { afterEach, expect, it, vi } from 'vitest';
import { injectMotionSourcePlayer, MOTION_AUDIO_SYNC_RUNTIME, MOTION_PREVIEW_ACTIVITY, MOTION_PREVIEW_REQUEST } from '@open-design/contracts/runtime/motion-source-player';

type MotionWindow = Window & {
  __odMotionSourcePlayer?: boolean;
  __odMotionPreview?: boolean;
  __odMotionThumbnail?: boolean;
  __timelines?: Record<string, unknown>;
  __odMotionPlayer?: { state(): { playing: boolean }; pause(): void; play(): void; seek(time: number): void; replay(): void; setMuted(value: boolean): void };
};
const motionWindow = window as MotionWindow;
let dispose: (() => void) | undefined;
afterEach(() => {
  window.dispatchEvent(new Event('pagehide'));
  dispose?.();
  delete motionWindow.__odMotionSourcePlayer;
  delete motionWindow.__odMotionPreview;
  delete motionWindow.__odMotionThumbnail;
  delete motionWindow.__odMotionPlayer;
  delete motionWindow.__timelines;
  document.body.innerHTML = '';
  document.head.innerHTML = '';
  vi.restoreAllMocks();
  vi.useRealTimers();
});

function boot(hosted: boolean, playResult: Promise<void> = Promise.resolve(), thumbnail = false) {
  vi.useFakeTimers();
  const listeners = vi.spyOn(window, 'addEventListener');
  const post = vi.spyOn(window.parent, 'postMessage').mockImplementation(() => {});
  document.head.innerHTML = '<meta name="od-motion-output" content="video">';
  document.body.innerHTML = '<main data-composition-id="main" data-duration="15" data-width="1920" data-height="1080"><audio src="sound.wav" data-duration="15"></audio></main>';
  const audio = document.querySelector('audio')!;
  let audioPaused = true;
  Object.defineProperties(audio, { paused: { get: () => audioPaused }, readyState: { value: 4 } });
  vi.spyOn(audio, 'play').mockImplementation(() => { audioPaused = false; return playResult; });
  vi.spyOn(audio, 'pause').mockImplementation(() => { audioPaused = true; });
  let time = 0, paused = false;
  const timeline = {
    time: () => time, duration: () => 15, timeScale: () => 1,
    repeat: () => 0, delay: () => 0, paused: () => paused,
    seek: (value: number) => { time = value; },
    play: () => { paused = false; }, pause: () => { paused = true; },
  };
  motionWindow.__timelines = { main: timeline };
  motionWindow.__odMotionPreview = hosted;
  motionWindow.__odMotionThumbnail = thumbnail;
  const html = injectMotionSourcePlayer(document.documentElement.outerHTML);
  const script = /<script data-od-motion-source-player[^>]*>([\s\S]*?)<\/script>/.exec(html)![1];
  window.eval(script!);
  document.dispatchEvent(new Event('DOMContentLoaded'));
  dispose = () => {
    for (const [type, listener, options] of listeners.mock.calls) window.removeEventListener(type, listener, options);
  };
  const id = (post.mock.calls.find(([data]) => data.type === MOTION_PREVIEW_REQUEST)?.[0] as {id?: string} | undefined)?.id;
  const activity = (active: boolean, instance = id, source: MessageEventSource | null = window.parent, muted = false) => {
    window.dispatchEvent(new MessageEvent('message', {source, data:{type:MOTION_PREVIEW_ACTIVITY, id:instance, active, muted}}));
  };
  return { audio, timeline, activity, simulateDelayedStart: () => { audioPaused = false; }, player: motionWindow.__odMotionPlayer! };
}

it('keeps a hosted motion source and its audio paused until the host confirms it is active', () => {
  const { audio, timeline, player } = boot(true);
  expect(player.state().playing).toBe(false);
  expect(timeline.paused()).toBe(true);
  expect(audio.paused).toBe(true);
});

it('keeps standalone motion autoplay unchanged', () => {
  const { audio, timeline, player } = boot(false);
  expect(player.state().playing).toBe(true);
  expect(timeline.paused()).toBe(false);
  expect(audio.paused).toBe(false);
});

it('loops the thumbnail timeline while keeping its soundtrack paused and permanently muted', async () => {
  const { audio, timeline, player, activity } = boot(true, Promise.resolve(), true);
  activity(true);
  expect(player.state().playing).toBe(true);
  expect(timeline.paused()).toBe(false);
  expect(audio.paused).toBe(true);
  expect(audio.muted).toBe(true);
  expect(audio.play).not.toHaveBeenCalled();
  timeline.seek(15);
  await vi.advanceTimersByTimeAsync(34);
  expect(timeline.time()).toBe(0);
  expect(timeline.paused()).toBe(false);
  player.setMuted(false);
  expect(audio.muted).toBe(true);
  expect(audio.play).not.toHaveBeenCalled();
  activity(false);
  expect(timeline.paused()).toBe(true);
});

it('pauses audio and the timeline while hidden, blocks play while inactive and resumes when active', async () => {
  const { audio, timeline, player, activity } = boot(true);
  activity(true);
  expect(audio.paused).toBe(false);
  activity(false);
  player.play();
  await vi.advanceTimersByTimeAsync(1000);
  expect(player.state().playing).toBe(false);
  expect(timeline.paused()).toBe(true);
  expect(audio.paused).toBe(true);
  activity(true);
  expect(player.state().playing).toBe(true);
  expect(audio.paused).toBe(false);
});

it('preserves a user pause across hiding and reactivation', () => {
  const { audio, player, activity } = boot(true);
  activity(true);
  player.pause();
  activity(false);
  activity(true);
  expect(player.state().playing).toBe(false);
  expect(audio.paused).toBe(true);
});

it('does not activate on a stale document ID or a different message source', () => {
  const { audio, activity } = boot(true);
  activity(true, 'previous-document');
  activity(true, undefined, null);
  expect(audio.paused).toBe(true);
});

it('stops a late audio start after the preview was deactivated', async () => {
  let resolve!: () => void;
  const pending = new Promise<void>(r => { resolve = r; });
  const { audio, activity, simulateDelayedStart } = boot(true, pending);
  activity(true);
  expect(audio.play).toHaveBeenCalled();
  expect(vi.mocked(audio.play).mock.results[0]?.value).toBe(pending);
  activity(false);
  expect(motionWindow.__odMotionPlayer?.state().playing).toBe(false);
  simulateDelayedStart();
  resolve();
  await vi.waitFor(() => expect(audio.paused).toBe(true));
  expect(audio.paused).toBe(true);
});


it('does not seek audio for transient or oscillating visual clock drift', async () => {
  const { audio, timeline } = boot(false);
  const seek = vi.spyOn(audio, 'currentTime', 'set');
  for (const delta of [.4, -.4, .5, -.5, 0]) {
    audio.currentTime = 5;
    timeline.seek(5 + delta);
    seek.mockClear();
    await vi.advanceTimersByTimeAsync(100);
    expect(seek).not.toHaveBeenCalled();
  }
});

it('waits for seek completion and sustained drift before correcting playback', async () => {
  const { audio, timeline } = boot(false);
  timeline.seek(5);
  audio.currentTime = 4;
  let seeking = true;
  Object.defineProperty(audio, 'seeking', { get: () => seeking });
  const seek = vi.spyOn(audio, 'currentTime', 'set');
  await vi.advanceTimersByTimeAsync(2000);
  expect(seek).not.toHaveBeenCalled();
  seeking = false;
  await vi.advanceTimersByTimeAsync(700);
  expect(seek).not.toHaveBeenCalled();
  await vi.advanceTimersByTimeAsync(150);
  expect(seek).toHaveBeenCalledTimes(1);
  expect(audio.currentTime).toBe(5);
});

it('does not restart audio synchronization for duplicate host activity', () => {
  const { audio, activity } = boot(true);
  activity(true);
  const seek = vi.spyOn(audio, 'currentTime', 'set');
  activity(true);
  activity(true);
  expect(seek).not.toHaveBeenCalled();
});

it('pauses without seeking and performs only the requested seek or replay', async () => {
  const { audio, timeline, player } = boot(false);
  await vi.advanceTimersByTimeAsync(0);
  timeline.seek(4);
  audio.currentTime = 4;
  const seek = vi.spyOn(audio, 'currentTime', 'set');
  player.pause();
  expect(audio.paused).toBe(true);
  expect(seek).not.toHaveBeenCalled();
  player.seek(8);
  expect(audio.currentTime).toBe(8);
  expect(audio.paused).toBe(true);
  expect(seek).toHaveBeenCalledTimes(1);
  seek.mockClear();
  player.replay();
  expect(audio.currentTime).toBe(0);
  expect(audio.paused).toBe(false);
  expect(seek).toHaveBeenCalledTimes(1);
});


function audioSync() {
  vi.useFakeTimers();
  const audio = document.createElement('audio');
  Object.defineProperties(audio, { readyState: { value: 4, configurable: true }, paused: { value: false }, seeking: { value: false, configurable: true } });
  const sync = window.eval(MOTION_AUDIO_SYNC_RUNTIME + ';createMotionAudioSync')(audio) as (target: number, moving: boolean, force?: boolean) => void;
  const seek = vi.spyOn(audio, 'currentTime', 'set');
  return { audio, sync, seek };
}

it('keeps sound continuous through long render stalls and corrects once after recovery', () => {
  const { audio, sync, seek } = audioSync();
  for (let n = 0; n < 8; n++) {
    vi.advanceTimersByTime(550);
    sync(.6, true);
  }
  expect(seek).not.toHaveBeenCalled();
  for (let n = 0; n < 9; n++) { vi.advanceTimersByTime(100); sync(.6, true); }
  expect(seek).toHaveBeenCalledTimes(1);
  expect(audio.currentTime).toBe(.6);
  // Another sustained offset cannot immediately cause a reverse seek.
  for (let n = 0; n < 10; n++) { vi.advanceTimersByTime(100); sync(0, true); }
  expect(seek).toHaveBeenCalledTimes(1);
});

it('retains explicit seeking while paused, before metadata, and during another seek', () => {
  const { audio, sync, seek } = audioSync();
  Object.defineProperty(audio, 'readyState', { value: 0, configurable: true });
  sync(4, false, true);
  expect(seek).not.toHaveBeenCalled();
  Object.defineProperty(audio, 'readyState', { value: 4, configurable: true });
  sync(4, false);
  expect(audio.currentTime).toBe(4);
  Object.defineProperty(audio, 'seeking', { value: true, configurable: true });
  sync(7, false, true);
  expect(audio.currentTime).toBe(7);
});


it('keeps a generating preview visual-only through reload activation, transport controls and a pending play', async () => {
  let resolve!: () => void;
  const pending = new Promise<void>(r => { resolve = r; });
  const { audio, timeline, activity, player, simulateDelayedStart } = boot(true, pending);
  activity(true, undefined, window.parent, true);
  expect(timeline.paused()).toBe(false);
  expect(audio.muted).toBe(true);
  expect(audio.paused).toBe(true);
  expect(audio.play).not.toHaveBeenCalled();
  player.setMuted(false); player.replay();
  await vi.advanceTimersByTimeAsync(100);
  expect(audio.play).not.toHaveBeenCalled();
  activity(false, undefined, window.parent, true);
  expect(timeline.paused()).toBe(true);
  activity(true, undefined, window.parent, true);
  expect(audio.paused).toBe(true);
  activity(true);
  expect(audio.play).toHaveBeenCalledTimes(1);
  activity(true, undefined, window.parent, true);
  simulateDelayedStart(); resolve();
  await vi.advanceTimersByTimeAsync(0);
  expect(audio.paused).toBe(true);
  expect(audio.muted).toBe(true);
});
