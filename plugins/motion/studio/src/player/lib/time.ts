export const STUDIO_PREVIEW_FPS = 30;

export const clampToDuration = (time: number, duration: number) =>
  Math.max(0, duration > 0 ? Math.min(duration, time) : time);

export function formatTime(time: number): string {
  if (!Number.isFinite(time) || time < 0) return "00:00";
  const mins = Math.floor(time / 60);
  const secs = Math.floor(time % 60);
  // Zero-pad minutes as well as seconds so every readout is a stable-width
  // MM:SS (e.g. "00:44", not "0:44"). Minutes past 99 keep their extra digits
  // ("120:00"); an hours-style H:MM:SS grouping is applied by callers that need
  // it (see formatTimelineTickLabel), never here.
  return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
}

export function secondsToFrame(time: number, fps: number): number {
  if (!Number.isFinite(time) || time <= 0) return 0;
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return Math.round(time * fps);
}

export function frameToSeconds(frame: number, fps: number): number {
  if (!Number.isFinite(frame) || frame <= 0) return 0;
  if (!Number.isFinite(fps) || fps <= 0) return 0;
  return frame / fps;
}

export function stepFrameTime(time: number, deltaFrames: number, fps: number): number {
  const currentFrame = secondsToFrame(time, fps);
  const nextFrame = Math.max(0, currentFrame + deltaFrames);
  return frameToSeconds(nextFrame, fps);
}

export function formatFrameTime(time: number, duration: number, fps: number): string {
  const currentFrame = secondsToFrame(time, fps);
  const totalFrames = secondsToFrame(duration, fps);
  return `${currentFrame}f / ${totalFrames}f`;
}
