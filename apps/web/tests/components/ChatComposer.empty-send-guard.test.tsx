// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { armCompletionFeedbackOnFirstGesture } from '../../src/utils/notifications';
import { flushMounts, pressEnter, typeAndSettle } from '../helpers/lexical-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatComposer empty-send guard (recvqaj7eKpxH6)', () => {
  it('disables the send button and no-ops a click on a truly empty composer', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    await flushMounts();

    const btn = screen.getByTestId('chat-send') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSend).not.toHaveBeenCalled();
  });

  it('does not send on Enter with a truly empty composer', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
      />,
    );
    await flushMounts();
    pressEnter();
    expect(onSend).not.toHaveBeenCalled();
  });

  // The "next step" placeholder carousel rotates suggested prompts as ghost
  // text where the editor's own placeholder would sit, whenever the
  // composer is otherwise idle (empty draft, nothing staged) — this is the
  // ordinary steady state of a mid-conversation composer, not a rare edge
  // case. Regression: the send-guard used to treat that ghost text as real
  // payload, so clicking Send on a box the user had never typed into still
  // launched a real turn with the suggested text (recvqaj7eKpxH6).
  it('does not submit the rotating placeholder scenario when the user never typed anything', async () => {
    const onSend = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
        placeholderScenarios={[
          { id: 'follow-up-1', text: 'Make the hero punchier', chipId: 'design-toolbox' },
        ]}
      />,
    );
    await flushMounts();
    // Let the carousel report its first scenario.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });

    const btn = screen.getByTestId('chat-send') as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
    fireEvent.click(btn);
    expect(onSend).not.toHaveBeenCalled();

    // Enter must not bypass it either.
    pressEnter();
    expect(onSend).not.toHaveBeenCalled();
  });

  it('still sends real typed text even while the placeholder carousel is mounted', async () => {
    const onSend = vi.fn();
    const onFeedbackActivation = vi.fn();
    const disposeFeedbackActivation = armCompletionFeedbackOnFirstGesture(
      {
        soundEnabled: false,
        successSoundId: 'ding',
        failureSoundId: 'buzz',
        desktopEnabled: false,
      },
      onFeedbackActivation,
    );
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={onSend}
        onStop={vi.fn()}
        placeholderScenarios={[
          { id: 'follow-up-1', text: 'Make the hero punchier', chipId: 'design-toolbox' },
        ]}
      />,
    );
    await flushMounts();

    await typeAndSettle('Ship the onboarding tweak');
    pressEnter();

    expect(onSend).toHaveBeenCalledTimes(1);
    expect(onSend).toHaveBeenCalledWith('Ship the onboarding tweak', [], [], undefined);
    expect(onFeedbackActivation).toHaveBeenCalledWith({ desktopPermission: null });
    disposeFeedbackActivation();
  });

  it('pauses the typewriter while the empty composer owns the real caret', async () => {
    const { container } = render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        placeholderScenarios={[
          { id: 'follow-up-1', text: 'Make the hero punchier', chipId: 'design-toolbox' },
        ]}
      />,
    );
    await flushMounts();

    const editor = container.querySelector<HTMLElement>('.composer-editable');
    expect(editor).not.toBeNull();
    expect(screen.getByTestId('home-hero-carousel')).toBeTruthy();

    fireEvent.focus(editor!);
    expect(screen.queryByTestId('home-hero-carousel')).toBeNull();

    fireEvent.blur(editor!, { relatedTarget: null });
    expect(screen.getByTestId('home-hero-carousel')).toBeTruthy();
  });
});
