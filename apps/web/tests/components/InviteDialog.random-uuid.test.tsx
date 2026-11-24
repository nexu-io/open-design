// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';

import { InviteDialog } from '../../src/components/InviteDialog';
import { workspaceContextFixture } from '../helpers/workspace-context';

const TEAM_CONTEXT = workspaceContextFixture({
  workspaceId: 'workspace-team',
  workspaceMemberId: 'member-inviter',
});

const V4_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const originalCrypto = globalThis.crypto;

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  Object.defineProperty(globalThis, 'crypto', {
    value: originalCrypto,
    configurable: true,
    writable: true,
  });
});

describe('InviteDialog — randomUUID fallback (#9359)', () => {
  it('still submits invites with generated idempotency keys when crypto.randomUUID is unavailable', async () => {
    // Non-secure context shape (plain-HTTP self-hosted / LAN install): the
    // dialog's row idempotencyKey and invite batchId both come from
    // `randomUUID()` — a bare `crypto.randomUUID()` call would throw here.
    Object.defineProperty(globalThis, 'crypto', {
      value: {
        randomUUID: undefined,
        getRandomValues: originalCrypto.getRandomValues.bind(originalCrypto),
      },
      configurable: true,
      writable: true,
    });

    const fetchSpy = vi.fn(async () =>
      new Response(JSON.stringify({ results: [{ ok: true }] }), { status: 200 }),
    );
    vi.stubGlobal('fetch', fetchSpy);

    render(<InviteDialog open onClose={() => {}} workspaceContext={TEAM_CONTEXT} />);
    const email = screen.getAllByRole('textbox')[0]!;
    // Typing the email rotates the row's idempotencyKey through randomUUID().
    fireEvent.change(email, { target: { value: 'teammate@example.com' } });
    fireEvent.click(screen.getByRole('button', { name: /发送邀请|send invitations|确认并邀请|invite/i }));

    await vi.waitFor(() => expect(fetchSpy).toHaveBeenCalled());
    const init = fetchSpy.mock.calls[0]?.[1] as RequestInit | undefined;
    const body = JSON.parse(String(init?.body)) as {
      invites: Array<{ email: string; idempotencyKey: string }>;
    };
    expect(body.invites[0]?.email).toBe('teammate@example.com');
    expect(body.invites[0]?.idempotencyKey).toMatch(V4_RE);
  });
});
