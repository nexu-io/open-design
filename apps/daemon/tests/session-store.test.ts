import { describe, expect, it } from 'vitest';
import { createSession, isValidSession, extractSessionCookie, revokeSession } from '../src/session-store.js';

describe('session-store', () => {
  it('createSession returns token and cookie name', () => {
    const result = createSession();
    expect(result.token).toBeDefined();
    expect(typeof result.token).toBe('string');
    expect(result.cookieName).toBe('od_session');
  });

  it('valid session returns true', () => {
    const { token } = createSession();
    expect(isValidSession(token)).toBe(true);
  });

  it('invalid session returns false', () => {
    expect(isValidSession('nonexistent-token')).toBe(false);
  });

  it('revoked session is no longer valid', () => {
    const { token } = createSession();
    revokeSession(token);
    expect(isValidSession(token)).toBe(false);
  });

  it('extractSessionCookie returns token from valid header', () => {
    const { token } = createSession();
    const extracted = extractSessionCookie(`od_session=${token}; other=value`);
    expect(extracted).toBe(token);
  });

  it('extractSessionCookie returns null for missing cookie', () => {
    expect(extractSessionCookie(undefined)).toBeNull();
    expect(extractSessionCookie('other=value')).toBeNull();
  });

  it('extractSessionCookie handles cookie at end of header', () => {
    const { token } = createSession();
    const extracted = extractSessionCookie(`other=value; od_session=${token}`);
    expect(extracted).toBe(token);
  });

  it('evicts oldest session when maxSessions exceeded', () => {
    const firstToken = createSession().token;
    expect(isValidSession(firstToken)).toBe(true);

    for (let i = 1; i < 100; i++) {
      createSession();
    }

    createSession();
    expect(isValidSession(firstToken)).toBe(false);
  });
});
