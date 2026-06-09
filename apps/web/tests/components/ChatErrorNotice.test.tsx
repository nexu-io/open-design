// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatErrorNotice } from '../../src/components/ChatErrorNotice';

afterEach(() => {
  cleanup();
});

describe('ChatErrorNotice', () => {
  it('formats sub-second retryDelayMs values as milliseconds, not seconds', () => {
    render(
      <ChatErrorNotice
        error={{
          message: 'Gemini hit a provider quota or rate limit.',
          retryDelayMs: 500,
        }}
      />,
    );

    expect(screen.getByText('Retry after about 1s.')).toBeTruthy();
    expect(screen.queryByText('Retry after about 500s.')).toBeNull();
  });
});
