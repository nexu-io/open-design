import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import {
  clearAllSessions,
  createSession,
  isValidSession,
  extractSessionCookie,
} from '../src/session-store.js';

describe('session remint after clear', () => {
  afterEach(() => {
    clearAllSessions();
  });

  it('createSession after clearAllSessions produces a valid new session', () => {
    const first = createSession();
    expect(isValidSession(first.token)).toBe(true);

    clearAllSessions();
    // Old session is gone.
    expect(isValidSession(first.token)).toBe(false);

    // Minting a fresh session works.
    const second = createSession();
    expect(isValidSession(second.token)).toBe(true);
    expect(second.token).not.toBe(first.token);
  });

  it('clearAllSessions followed by createSession preserves the cookie name', () => {
    clearAllSessions();
    const session = createSession();
    expect(session.cookieName).toBe('od_session');
  });

  it('multiple clears followed by create always yield a valid session', () => {
    for (let i = 0; i < 5; i++) {
      clearAllSessions();
      const s = createSession();
      expect(isValidSession(s.token)).toBe(true);
    }
  });

  it('session cookie can be extracted from Set-Cookie header value', () => {
    clearAllSessions();
    const { token, cookieName } = createSession();
    const header = `${cookieName}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=86400`;
    expect(extractSessionCookie(header)).toBe(token);
  });
});
