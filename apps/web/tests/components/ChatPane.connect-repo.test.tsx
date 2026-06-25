// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { forwardRef, useImperativeHandle } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import type { Conversation, ProjectMetadata } from '../../src/types';

const composerMocks = vi.hoisted(() => ({
  focus: vi.fn(),
  restoreDraft: vi.fn(),
  setDraft: vi.fn(),
}));

vi.mock('../../src/i18n', () => ({
  useI18n: () => ({ locale: 'en', setLocale: () => undefined, t: (key: string) => key }),
  useT: () => (key: string) => key,
}));

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef((_props, ref) => {
    useImperativeHandle(ref, () => ({
      focus: composerMocks.focus,
      restoreDraft: composerMocks.restoreDraft,
      setDraft: composerMocks.setDraft,
    }));
    return <output data-testid="composer" />;
  }),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const conversations: Conversation[] = [
  { id: 'conv-1', projectId: 'project-1', title: 'Conversation 1', createdAt: 1, updatedAt: 1 },
];

const projectMetadata: ProjectMetadata = { kind: 'prototype' };

function renderPane(extra: Partial<React.ComponentProps<typeof ChatPane>>) {
  return render(
    <ChatPane
      projectKindForTracking="prototype"
      messages={[]}
      streaming={false}
      error={null}
      projectId="project-1"
      projectFiles={[]}
      onEnsureProject={async () => 'project-1'}
      onSend={vi.fn()}
      onStop={vi.fn()}
      conversations={conversations}
      activeConversationId="conv-1"
      onSelectConversation={vi.fn()}
      onDeleteConversation={vi.fn()}
      projectMetadata={projectMetadata}
      {...extra}
    />,
  );
}

describe('ChatPane connect-repo CTA', () => {
  it('fires onConnectRepo with the Connect GitHub label when the repo evidence is incomplete', () => {
    const onConnectRepo = vi.fn();
    const { container } = renderPane({ connectRepoNeeded: true, githubConnected: false, onConnectRepo });

    expect(container.querySelector('.chat-connect-repo')).not.toBeNull();
    const connectButton = screen.getByRole('button', { name: /ds\.repoConnectButton/ });
    fireEvent.click(connectButton);

    expect(onConnectRepo).toHaveBeenCalledTimes(1);
  });

  it('shows a disabled pending button until the connector status resolves', () => {
    const onConnectRepo = vi.fn();
    // githubConnected omitted -> undefined -> status still loading.
    renderPane({ connectRepoNeeded: true, onConnectRepo });

    const pendingButton = screen.getByRole('button', { name: /ds\.repoConnectPendingButton/ });
    expect((pendingButton as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(pendingButton);
    expect(onConnectRepo).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: /ds\.repoConnectButton/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /ds\.repoImportButton/ })).toBeNull();
  });

  it('switches to an Import repo action when GitHub is already connected', () => {
    const onConnectRepo = vi.fn();
    const { container } = renderPane({ connectRepoNeeded: true, githubConnected: true, onConnectRepo });

    expect(container.querySelector('.chat-connect-repo')).not.toBeNull();
    expect(screen.getByText('ds.repoConnectedTitle')).toBeTruthy();
    const importButton = screen.getByRole('button', { name: /ds\.repoImportButton/ });
    fireEvent.click(importButton);

    expect(onConnectRepo).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: /ds\.repoConnectButton/ })).toBeNull();
  });

  it('prefills the composer when the parent pushes a draft signal', () => {
    renderPane({
      connectRepoNeeded: true,
      githubConnected: true,
      onConnectRepo: vi.fn(),
      composerDraftSignal: { text: 'Pull the linked repo', nonce: 1 },
    });

    expect(composerMocks.setDraft).toHaveBeenCalledWith('Pull the linked repo');
  });

  it('hides the CTA when the project does not need a repo connection', () => {
    const { container } = renderPane({ connectRepoNeeded: false, onOpenSettings: vi.fn() });
    expect(container.querySelector('.chat-connect-repo')).toBeNull();
  });

  it('hides the CTA once the conversation has messages', () => {
    const { container } = renderPane({
      connectRepoNeeded: true,
      onOpenSettings: vi.fn(),
      messages: [{ id: 'user-1', role: 'user', content: 'hi', createdAt: 1 }],
    });
    expect(container.querySelector('.chat-connect-repo')).toBeNull();
  });
});
