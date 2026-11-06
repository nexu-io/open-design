// ponytail: Playback RAF updates the playhead/time display without per-frame React renders.
type TimeListener = (time: number) => void;
const timeListeners = new Set<TimeListener>();
let latestTime = 0;
let seekCount = 0;

export const liveTime = {
  notify: (time: number) => {
    latestTime = time;
    timeListeners.forEach((listener) => listener(time));
  },
  notifySeek: (time: number) => {
    seekCount += 1;
    liveTime.notify(time);
  },
  seekCount: () => seekCount,
  latest: () => latestTime,
  subscribe: (listener: TimeListener) => {
    timeListeners.add(listener);
    return () => timeListeners.delete(listener);
  },
};
