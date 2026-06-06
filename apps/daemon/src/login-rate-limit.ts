const MAX_ATTEMPTS = 5;
const WINDOW_MS = 60 * 1000;

interface Attempt {
  count: number;
  firstAt: number;
}

const attempts = new Map<string, Attempt>();

export function checkRateLimit(ip: string): { allowed: boolean; retryAfterMs: number } {
  prune();
  const entry = attempts.get(ip);
  if (!entry) {
    attempts.set(ip, { count: 1, firstAt: Date.now() });
    return { allowed: true, retryAfterMs: 0 };
  }
  if (Date.now() - entry.firstAt > WINDOW_MS) {
    entry.count = 1;
    entry.firstAt = Date.now();
    return { allowed: true, retryAfterMs: 0 };
  }
  entry.count++;
  if (entry.count > MAX_ATTEMPTS) {
    const retryAfterMs = WINDOW_MS - (Date.now() - entry.firstAt);
    return { allowed: false, retryAfterMs: Math.max(retryAfterMs, 0) };
  }
  return { allowed: true, retryAfterMs: 0 };
}

function prune() {
  const now = Date.now();
  for (const [ip, entry] of attempts) {
    if (now - entry.firstAt > WINDOW_MS) {
      attempts.delete(ip);
    }
  }
}

export function startCleanupInterval(): NodeJS.Timeout {
  return setInterval(prune, WINDOW_MS);
}
