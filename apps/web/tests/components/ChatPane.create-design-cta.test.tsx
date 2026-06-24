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

describe('ChatPane create-design CTA', () => {
  it('shows the CTA and fires the handler when the parent supplies one (design-system project)', () => {
    const onCreateDesignFromActiveSystem = vi.fn();
    const { container } = renderPane({ onCreateDesignFromActiveSystem });

    expect(container.querySelector('[data-testid="ds-create-design-cta"]')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: /createDesignFromSystemCta/ }));
    expect(onCreateDesignFromActiveSystem).toHaveBeenCalledTimes(1);
  });

  it('hides the CTA when no handler is supplied (regular design project that merely uses a system)', () => {
    // The parent only passes onCreateDesignFromActiveSystem for design-system-level
    // projects. A regular design project leaves it undefined even though it carries
    // an active design system as context — the CTA must stay hidden there.
    const { container } = renderPane({
      hasActiveDesignSystem: true,
      activeDesignSystem: {
        id: 'user:acme',
        title: 'Acme Design System',
        category: 'brand',
        summary: 'x',
      },
    });
    expect(container.querySelector('[data-testid="ds-create-design-cta"]')).toBeNull();
  });

  it('hides the CTA once the conversation has messages (empty-state only)', () => {
    const { container } = renderPane({
      onCreateDesignFromActiveSystem: vi.fn(),
      messages: [{ id: 'user-1', role: 'user', content: 'hi', createdAt: 1 }],
    });
    expect(container.querySelector('[data-testid="ds-create-design-cta"]')).toBeNull();
  });
});
