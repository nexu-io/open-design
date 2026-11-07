// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { flushMounts } from '../helpers/lexical-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatComposer project mode picker (restored)', () => {
  it('exposes a session-mode picker in project chat', async () => {
    const onSessionModeChange = vi.fn();
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        sessionMode="design"
        onSessionModeChange={onSessionModeChange}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    await flushMounts();

    expect(screen.getByTestId('composer-mode-trigger')).toBeTruthy();
  });
});
