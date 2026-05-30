// @vitest-environment jsdom

// Regression for the streaming-state localization: while sending is disabled
// (e.g. a run is in flight), the Send control stays rendered with the
// localized reason as its tooltip so the message reaches the DOM instead of
// being dropped. Queue remains available for staging the note downstream.

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { PreviewDrawOverlay } from '../../src/components/PreviewDrawOverlay';

afterEach(() => {
  cleanup();
});

describe('PreviewDrawOverlay send disabled (streaming) localization', () => {
  it('surfaces the localized reason on the Send tooltip while keeping Queue operable', () => {
    render(
      <PreviewDrawOverlay active sendDisabled sendDisabledReason="Task running">
        <div data-testid="content" />
      </PreviewDrawOverlay>,
    );

    const note = document.querySelector('.preview-draw-note-input') as HTMLInputElement;
    fireEvent.change(note, { target: { value: 'looks good' } });

    const send = screen.getByRole('button', { name: 'Send' });
    const queue = screen.getByRole('button', { name: 'Queue' });
    // The localized reason reaches the DOM as the button's tooltip...
    expect(send.getAttribute('title')).toBe('Task running');
    // ...and Queue stays operable so the mark can be staged for the next turn.
    expect((send as HTMLButtonElement).disabled).toBe(true);
    expect((queue as HTMLButtonElement).disabled).toBe(false);
  });
});
