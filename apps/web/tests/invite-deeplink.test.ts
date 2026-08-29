import { describe, expect, it } from 'vitest';
import {
  buildInviteDeeplink,
  parseInviteDeeplink,
  resolveWorkspaceInviteError,
  type InviteDeeplinkPayload,
} from '@open-design/contracts';

const PAYLOAD: InviteDeeplinkPayload = {
  workspaceId: 'ws-1',
  memberId: 'mem-9',
  inviteId: 'inv-42',
  nonce: 'nonce-abc',
};

describe('parseInviteDeeplink / buildInviteDeeplink', () => {
  it('round-trips a well-formed continuation deeplink', () => {
    const url = buildInviteDeeplink(PAYLOAD);
    expect(url.startsWith('opendesign://workspace/invite/continue?')).toBe(true);
    expect(parseInviteDeeplink(url)).toEqual(PAYLOAD);
  });

  it('parses the documented baseline URL shape', () => {
    const url =
      'opendesign://workspace/invite/continue?workspace_id=ws-1&member_id=mem-9&invite_id=inv-42&nonce=nonce-abc';
    expect(parseInviteDeeplink(url)).toEqual(PAYLOAD);
  });

  it('ignores extra query params (e.g. a signature)', () => {
    const url = `${buildInviteDeeplink(PAYLOAD)}&sig=deadbeef&ts=123`;
    expect(parseInviteDeeplink(url)).toEqual(PAYLOAD);
  });

  it('tolerates a trailing slash on the path', () => {
    const url =
      'opendesign://workspace/invite/continue/?workspace_id=ws-1&member_id=mem-9&invite_id=inv-42&nonce=nonce-abc';
    expect(parseInviteDeeplink(url)).toEqual(PAYLOAD);
  });

  it('rejects a URL missing any required field', () => {
    for (const drop of ['workspace_id', 'member_id', 'invite_id', 'nonce']) {
      const params = new URLSearchParams({
        workspace_id: 'ws-1',
        member_id: 'mem-9',
        invite_id: 'inv-42',
        nonce: 'nonce-abc',
      });
      params.delete(drop);
      const url = `opendesign://workspace/invite/continue?${params.toString()}`;
      expect(parseInviteDeeplink(url)).toBeNull();
    }
  });

  it('rejects a required field that is present but empty', () => {
    const url =
      'opendesign://workspace/invite/continue?workspace_id=ws-1&member_id=&invite_id=inv-42&nonce=nonce-abc';
    expect(parseInviteDeeplink(url)).toBeNull();
  });

  it('rejects the wrong scheme, host, or path', () => {
    expect(
      parseInviteDeeplink(
        'https://workspace/invite/continue?workspace_id=ws-1&member_id=mem-9&invite_id=inv-42&nonce=n',
      ),
    ).toBeNull();
    expect(
      parseInviteDeeplink(
        'opendesign://team/invite/continue?workspace_id=ws-1&member_id=mem-9&invite_id=inv-42&nonce=n',
      ),
    ).toBeNull();
    expect(
      parseInviteDeeplink(
        'opendesign://workspace/invite/accept?workspace_id=ws-1&member_id=mem-9&invite_id=inv-42&nonce=n',
      ),
    ).toBeNull();
  });

  it('rejects garbage input', () => {
    expect(parseInviteDeeplink('not a url')).toBeNull();
    expect(parseInviteDeeplink('')).toBeNull();
  });

  it('preserves values that need URL encoding', () => {
    const payload: InviteDeeplinkPayload = {
      workspaceId: 'ws/1',
      memberId: 'mem 9',
      inviteId: 'inv=42',
      nonce: 'a&b?c',
    };
    expect(parseInviteDeeplink(buildInviteDeeplink(payload))).toEqual(payload);
  });
});

describe('resolveWorkspaceInviteError', () => {
  it('prefers an explicit body code', () => {
    expect(resolveWorkspaceInviteError({ status: 409, code: 'workspace_seat_limit_reached' })).toBe(
      'workspace_seat_limit_reached',
    );
    expect(resolveWorkspaceInviteError({ status: 409, code: 'workspace_subscription_locked' })).toBe(
      'workspace_subscription_locked',
    );
  });

  it('infers from HTTP status when no code is present', () => {
    expect(resolveWorkspaceInviteError({ status: 410 })).toBe('invite_expired');
    expect(resolveWorkspaceInviteError({ status: 404 })).toBe('workspace_not_found');
    expect(resolveWorkspaceInviteError({ status: 403 })).toBe('workspace_forbidden');
    // 409 is ambiguous without a code → the common consume conflict.
    expect(resolveWorkspaceInviteError({ status: 409 })).toBe('invite_consumed');
  });

  it('returns null for an unrecognized failure', () => {
    expect(resolveWorkspaceInviteError({ status: 500 })).toBeNull();
    expect(resolveWorkspaceInviteError({ status: 200, code: 'bogus' })).toBeNull();
  });
});
