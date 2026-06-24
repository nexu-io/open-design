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

const intro = {
  sourceLabel: 'open-design.ai',
  systemTitle: 'Open Design',
  extracting: false,
};

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

describe('ChatPane design-system extraction panel', () => {
  it('renders the synthesized extraction turn and next-step CTAs on a design-system project', () => {
    const onContinueBrandEnrichment = vi.fn();
    const onCreateDesignFromActiveSystem = vi.fn();
    const { container } = renderPane({
      designSystemIntro: intro,
      brandEnrichmentEligible: true,
      onContinueBrandEnrichment,
      onCreateDesignFromActiveSystem,
    });

    // The panel replaces the generic "Start a conversation" starters.
    expect(container.querySelector('[data-testid="ds-extraction-panel"]')).not.toBeNull();
    expect(container.querySelector('.chat-examples')).toBeNull();
    // Synthesized turn renders the user request + the completed agent line.
    expect(container.textContent).toContain('chat.dsExtractUser');
    expect(container.textContent).toContain('chat.dsExtractDone');

    // Both featured CTAs fire the canonical handlers.
    fireEvent.click(screen.getByTestId('ds-next-step-ai-optimize'));
    expect(onContinueBrandEnrichment).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId('ds-next-step-create-design'));
    expect(onCreateDesignFromActiveSystem).toHaveBeenCalledTimes(1);
  });

  it('shows the loading state and hides next steps while extraction runs', () => {
    const { container } = renderPane({
      designSystemIntro: { ...intro, extracting: true },
      brandEnrichmentEligible: true,
      onContinueBrandEnrichment: vi.fn(),
      onCreateDesignFromActiveSystem: vi.fn(),
    });

    expect(container.querySelector('[data-testid="ds-extraction-panel"]')).not.toBeNull();
    expect(container.textContent).toContain('chat.dsExtractRunning');
    expect(screen.queryByTestId('ds-next-step-create-design')).toBeNull();
  });

  it('falls back to the generic empty state when there is no extraction intro', () => {
    const { container } = renderPane({});
    expect(container.querySelector('[data-testid="ds-extraction-panel"]')).toBeNull();
    expect(container.querySelector('.chat-examples')).not.toBeNull();
  });
});
