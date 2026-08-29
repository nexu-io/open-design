// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { PresenceBar } from '../src/collab/PresenceBar.js';

afterEach(cleanup);

describe('PresenceBar', () => {
  it('renders self first with an online marker plus present teammates', () => {
    render(
      <PresenceBar
        selfMemberId="me"
        selfMember={{ memberId: 'me', name: 'Me' }}
        members={[
          { memberId: 'me', name: 'Me' },
          { memberId: 'm1', name: 'Ma Shu', role: 'member' },
          { memberId: 'm2', name: 'Yuan Xi', role: 'admin' },
        ]}
      />,
    );
    const self = screen.getByText('ME');
    expect(self).toBeTruthy();
    expect(self.getAttribute('data-self')).toBe('true');
    expect(screen.getByText('MS')).toBeTruthy();
    expect(screen.getByText('YX')).toBeTruthy();
    expect(screen.getByRole('group').getAttribute('aria-label')).toContain('3 collaborators online, including you');

    fireEvent.click(screen.getByRole('button', { name: /3 collaborators online/ }));

    expect(screen.getByRole('dialog', { name: 'Online collaborators' })).toBeTruthy();
    expect(screen.getByText('3 online')).toBeTruthy();
    expect(screen.getByText('Me')).toBeTruthy();
    expect(screen.getByText('Ma Shu')).toBeTruthy();
    expect(screen.getByText('Yuan Xi')).toBeTruthy();
    expect(screen.getByText('Member · You are viewing this project')).toBeTruthy();
    expect(screen.getByText('Admin · Viewing this project')).toBeTruthy();
  });

  it('collapses past the max into a +N overflow chip', () => {
    render(
      <PresenceBar
        max={2}
        members={[
          { memberId: 'a', name: 'Aa' },
          { memberId: 'b', name: 'Bb' },
          { memberId: 'c', name: 'Cc' },
          { memberId: 'd', name: 'Dd' },
        ]}
      />,
    );
    expect(screen.getByText('+2')).toBeTruthy();
  });

  // Acceptance #19: alone in your own project, the bar showed your own avatar
  // and captioned it "you are viewing this project" — a roster of just you says
  // nothing. It has to come back the moment a teammate joins.
  it('renders nothing when the only member present is the viewer', () => {
    const { container } = render(
      <PresenceBar
        selfMemberId="me"
        selfMember={{ memberId: 'me', name: 'Me' }}
        members={[]}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('reappears with self first as soon as a teammate joins', () => {
    render(
      <PresenceBar
        selfMemberId="me"
        selfMember={{ memberId: 'me', name: 'Me' }}
        members={[{ memberId: 'other', name: 'Amy' }]}
      />,
    );
    expect(screen.getByText('ME')).toBeTruthy();
    expect(screen.getByText('AM')).toBeTruthy();
    expect(screen.getByRole('group').getAttribute('aria-label')).toContain('including you');
  });

  it('enriches a sparse presence roster from the Team member directory', () => {
    render(
      <PresenceBar
        members={[{ memberId: 'member-peer' }]}
        resolveMember={(memberId) =>
          memberId === 'member-peer'
            ? {
                memberId,
                displayName: 'Ma Shu',
                role: 'admin',
              }
            : null}
      />,
    );

    const avatar = screen.getByText('MS');
    expect(avatar.getAttribute('title')).toBe('Ma Shu');
    expect(avatar.getAttribute('data-role')).toBe('admin');
  });

  it('prefers the authoritative directory name over stale heartbeat metadata', () => {
    render(
      <PresenceBar
        members={[
          {
            memberId: 'member-renamed',
            name: 'Old Heartbeat Name',
            role: 'member',
          },
        ]}
        resolveMember={(memberId) => ({
          memberId,
          displayName: 'New Directory Name',
          role: 'admin',
        })}
      />,
    );

    const avatar = screen.getByText('ND');
    expect(avatar.getAttribute('title')).toBe('New Directory Name');
    expect(avatar.getAttribute('data-role')).toBe('admin');
    expect(screen.queryByText('OH')).toBeNull();
  });

  it('hides a sparse other member until the directory resolves it', () => {
    const { container, rerender } = render(
      <PresenceBar
        selfMember={{ memberId: 'self', name: 'Viewer' }}
        selfMemberId="self"
        members={[{ memberId: 'opaque-workspace-member-id' }]}
        resolveMember={() => null}
      />,
    );
    expect(container.firstChild).toBeNull();
    expect(screen.queryByText('OP')).toBeNull();

    rerender(
      <PresenceBar
        selfMember={{ memberId: 'self', name: 'Viewer' }}
        selfMemberId="self"
        members={[{ memberId: 'opaque-workspace-member-id' }]}
        resolveMember={(memberId) =>
          memberId === 'opaque-workspace-member-id'
            ? {
                memberId,
                displayName: 'Resolved Teammate',
                role: 'member',
              }
            : null}
      />,
    );
    expect(screen.getByText('RT')).toBeTruthy();
    expect(screen.queryByText('OP')).toBeNull();
  });

  it('rejects an opaque self fallback until a real self name arrives', () => {
    const resolveMember = (memberId: string) =>
      memberId === 'opaque-self-member-id'
        ? {
            memberId,
            displayName: memberId,
            role: 'member' as const,
          }
        : {
            memberId,
            displayName: 'Visible Peer',
            role: 'admin' as const,
          };
    const { rerender } = render(
      <PresenceBar
        selfMember={{ memberId: 'opaque-self-member-id' }}
        selfMemberId="opaque-self-member-id"
        members={[{ memberId: 'peer-member-id' }]}
        resolveMember={resolveMember}
      />,
    );

    expect(screen.getByText('VP')).toBeTruthy();
    expect(screen.queryByTitle('opaque-self-member-id')).toBeNull();

    rerender(
      <PresenceBar
        selfMember={{ memberId: 'opaque-self-member-id', name: 'Real Viewer' }}
        selfMemberId="opaque-self-member-id"
        members={[{ memberId: 'peer-member-id' }]}
        resolveMember={resolveMember}
      />,
    );
    expect(screen.getByText('RV')).toBeTruthy();
    expect(screen.queryByTitle('opaque-self-member-id')).toBeNull();
  });
});
