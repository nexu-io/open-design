// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatSurfaceHeader } from '../../src/components/chat/ChatSurface';

describe('ChatSurfaceHeader', () => {
  afterEach(() => cleanup());

  it('hides redundant status labels by explicit state, not translated text', () => {
    const { rerender } = render(
      <ChatSurfaceHeader
        title="Reading ×2"
        status={{ label: 'Terminé', tone: 'done', hideLabel: true }}
      />,
    );

    expect(screen.queryByText('Terminé')).toBeNull();

    rerender(
      <ChatSurfaceHeader
        title="Question"
        status={{ label: 'Answered', tone: 'done' }}
      />,
    );

    expect(screen.getByText('Answered')).toBeTruthy();
  });
});
