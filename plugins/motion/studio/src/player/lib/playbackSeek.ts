export function shouldResumeForwardPlaybackAfterSeek(input: {
  keepPlaying: boolean;
  wasReverseShuttle: boolean;
  storeWasPlaying: boolean;
  duration: number;
  nextTime: number;
  playLocked: boolean;
}): boolean {
  return (
    !input.playLocked &&
    input.keepPlaying &&
    !input.wasReverseShuttle &&
    input.storeWasPlaying &&
    (input.duration <= 0 || input.nextTime < input.duration)
  );
}

export function shouldStopAfterSeek(input: {
  keepPlaying: boolean;
  wasReverseShuttle: boolean;
}): boolean {
  return !input.keepPlaying || input.wasReverseShuttle;
}
