import crypto from "node:crypto";

const SESSION_COOKIE_NAME = "od_session";
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const MAX_SESSIONS = 100;

interface SessionEntry {
  token: string;
  createdAt: number;
}

const sessions = new Map<string, SessionEntry>();

export function createSession(): { token: string; cookieName: string } {
  if (sessions.size >= MAX_SESSIONS) {
    let oldest = '';
    let oldestTime = Infinity;
    for (const [t, e] of sessions) {
      if (e.createdAt < oldestTime) { oldest = t; oldestTime = e.createdAt; }
    }
    if (oldest) sessions.delete(oldest);
  }
  const token = crypto.randomBytes(32).toString("base64url");
  sessions.set(token, { token, createdAt: Date.now() });
  return { token, cookieName: SESSION_COOKIE_NAME };
}

export function isValidSession(token: string): boolean {
  const entry = sessions.get(token);
  if (!entry) return false;
  if (Date.now() - entry.createdAt > SESSION_TTL_MS) {
    sessions.delete(token);
    return false;
  }
  return true;
}

export function extractSessionCookie(
  cookieHeader: string | undefined,
): string | null {
  if (!cookieHeader) return null;
  const prefix = SESSION_COOKIE_NAME + "=";
  for (const part of cookieHeader.split(";")) {
    const trimmed = part.trim();
    if (trimmed.startsWith(prefix)) {
      return trimmed.slice(prefix.length);
    }
  }
  return null;
}

export function revokeSession(token: string): void {
  sessions.delete(token);
}

export function clearAllSessions(): void {
  sessions.clear();
}

export function startCleanupInterval(): NodeJS.Timeout {
  return setInterval(() => {
    const now = Date.now();
    for (const [token, entry] of sessions) {
      if (now - entry.createdAt > SESSION_TTL_MS) {
        sessions.delete(token);
      }
    }
  }, 60 * 60 * 1000);
}
