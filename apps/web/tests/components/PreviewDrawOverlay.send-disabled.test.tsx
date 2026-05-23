// @vitest-environment jsdom

// Regression for the streaming-state localization: while sending is disabled
// (e.g. a run is in flight), the Send control stays rendered and operable
// (send-while-running is intentionally allowed and queued downstream), but it
// surfaces the localized reason as its tooltip so the message reaches the DOM
// instead of being dropped.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';

afterEach(() => {
  cleanup();
});

describe('PreviewDrawOverlay send disabled (streaming) localization', () => {
  it('surfaces the localized reason on the Send tooltip while keeping Send operable', () => {
    render(
      <PreviewDrawOverlay active sendDisabled sendDisabledReason="Task running">
        <div data-testid="content" />
      </PreviewDrawOverlay>,
    );

    const note = document.querySelector('.preview-draw-note-input') as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'looks good' } });

    const send = screen.getByText('Send').closest('button') as HTMLButtonElement;
    // The localized reason reaches the DOM as the button's tooltip...
    expect(send.getAttribute('title')).toBe('Task running');
    // ...and the control stays operable (send-while-running is queued, not blocked).
    expect(send.disabled).toBe(false);
  });
});
