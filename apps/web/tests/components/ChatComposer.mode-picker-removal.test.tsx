// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatComposer } from '../../src/components/ChatComposer';
import { flushMounts } from '../helpers/lexical-composer';

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ChatComposer fixed Design mode', () => {
  it('does not expose a session-mode picker in project chat', async () => {
    render(
      <ChatComposer
        projectId="project-1"
        projectFiles={[]}
        streaming={false}
        onEnsureProject={async () => 'project-1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
      />,
    );
    await flushMounts();

    expect(screen.queryByTestId('composer-mode-trigger')).toBeNull();
    expect(screen.queryByTestId('composer-mode-clear')).toBeNull();
  });
});
