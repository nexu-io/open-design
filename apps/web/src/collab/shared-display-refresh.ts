type Refresh = (token: string) => Promise<void>;
interface Schedule {
  listeners: Set<Refresh>;
  lastCompletedAt: number | null;
  activeToken: string | null;
  lastEvent: string | null;
  dirty: boolean;
  running: boolean;
  timer: ReturnType<typeof setTimeout> | null;
}

/**
 * One leading/trailing refresh per exact read identity, shared by every mounted
 * consumer. Events received during a slow read or cooldown retain one trailing
 * refresh; new events never postpone its boundary. The interval starts after
 * the preceding read completes, so a queued/slow read cannot race the upstream
 * catch-up window. Unmount cancels pending work
 * but retains the cooldown until it expires, so remount cannot reset the limit.
 */
export function createSharedDisplayRefresh(intervalMs: number) {
  const schedules = new Map<string, Schedule>();
  let sequence = 0;

  function clearTimer(schedule: Schedule) {
    if (schedule.timer !== null) clearTimeout(schedule.timer);
    schedule.timer = null;
  }

  function advance(key: string, schedule: Schedule): void {
    if (schedules.get(key) !== schedule || schedule.running) return;
    clearTimer(schedule);
    const remaining = schedule.lastCompletedAt === null
      ? 0 : Math.max(0, schedule.lastCompletedAt + intervalMs - Date.now());
    if (!schedule.listeners.size) {
      schedule.dirty = false;
      if (!remaining) schedules.delete(key);
      else schedule.timer = setTimeout(() => advance(key, schedule), remaining);
      return;
    }
    if (!schedule.dirty) return;
    if (remaining) {
      schedule.timer = setTimeout(() => advance(key, schedule), remaining);
      return;
    }
    schedule.dirty = false;
    schedule.running = true;
    const token = `display-refresh:${++sequence}`;
    schedule.activeToken = token;
    void Promise.allSettled([...schedule.listeners].map(async (refresh) => refresh(token)))
      .finally(() => {
        schedule.running = false;
        schedule.activeToken = null;
        schedule.lastCompletedAt = Date.now();
        advance(key, schedule);
      });
  }

  return {
    retain(key: string, refresh: Refresh): () => void {
      let schedule = schedules.get(key);
      if (!schedule) {
        schedule = { listeners: new Set(), lastCompletedAt: null, activeToken: null, lastEvent: null,
          dirty: false, running: false, timer: null };
        schedules.set(key, schedule);
      }
      schedule.listeners.add(refresh);
      // A consumer mounting during the read joins its existing transport key;
      // it must receive the result without waiting for another event/window.
      if (schedule.activeToken) void refresh(schedule.activeToken).catch(() => {});
      const retained = schedule;
      return () => {
        retained.listeners.delete(refresh);
        const current = schedules.get(key);
        if (current?.listeners === retained.listeners && !current.listeners.size) {
          current.dirty = false;
          clearTimer(current);
          advance(key, current);
        }
      };
    },
    invalidate(key: string, event: string): void {
      const schedule = schedules.get(key);
      if (!schedule?.listeners.size || schedule.lastEvent === event) return;
      schedule.lastEvent = event;
      schedule.dirty = true;
      advance(key, schedule);
    },
    activeToken(key: string): string | undefined {
      return schedules.get(key)?.activeToken ?? undefined;
    },
    /** A verified user/subscription action retires the ordinary cooldown and
     * in-flight generation. Its owner must reject that generation's late data. */
    force(key: string): void {
      const previous = schedules.get(key);
      if (!previous?.listeners.size) return;
      clearTimer(previous);
      const next: Schedule = { listeners: previous.listeners, lastCompletedAt: null,
        activeToken: null, lastEvent: null, dirty: true, running: false, timer: null };
      schedules.set(key, next);
      advance(key, next);
    },
    cancelPending(key: string): void {
      const schedule = schedules.get(key);
      if (!schedule) return;
      schedule.dirty = false;
      clearTimer(schedule);
    },
    reset(): void {
      for (const schedule of schedules.values()) clearTimer(schedule);
      schedules.clear();
    },
  };
}
