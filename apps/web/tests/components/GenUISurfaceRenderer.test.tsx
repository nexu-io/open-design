// @vitest-environment jsdom

// Plan §3.C3 / §3.C4 — GenUISurfaceRenderer unit test.
//
// Confirms:
//   - confirmation surface renders Continue / Cancel buttons; each
//     forwards the matching boolean through onAnswered.
//   - oauth-prompt surface forwards { authorized: true, connectorId }
//     for the connector route, matching the daemon's
//     genui_surfaces.value_json contract from spec §10.3.1.

import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { GenUISurfaceRenderer } from '../../src/components/GenUISurfaceRenderer';
import type { GenUISurfaceSpec } from '@open-design/contracts';

afterEach(() => cleanup());

describe('GenUISurfaceRenderer', () => {
  it('confirmation surface emits true on Continue and false on Cancel', async () => {
    const surface: GenUISurfaceSpec = {
      id: 'media-spend-approval',
      kind: 'confirmation',
      persist: 'run',
      prompt: 'Approve generating up to 4 image variants?',
    };
    const onAnswered = vi.fn();
    render(
      <GenUISurfaceRenderer
        pending={{ surface, runId: 'run-1' }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.click(screen.getByTestId('genui-confirm'));
    await waitFor(() => expect(onAnswered).toHaveBeenCalledWith(true));
    fireEvent.click(screen.getByTestId('genui-cancel'));
    await waitFor(() => expect(onAnswered).toHaveBeenLastCalledWith(false));
  });

  it('oauth-prompt surface forwards the connectorId on Authorize', async () => {
    const surface: GenUISurfaceSpec = {
      id: '__auto_connector_slack',
      kind: 'oauth-prompt',
      persist: 'project',
      capabilitiesRequired: ['connector:slack'],
      oauth: { route: 'connector', connectorId: 'slack' },
    };
    const onAnswered = vi.fn();
    render(
      <GenUISurfaceRenderer
        pending={{ surface, runId: 'run-1' }}
        onAnswered={onAnswered}
      />,
    );
    fireEvent.click(screen.getByTestId('genui-authorize'));
    await waitFor(() =>
      expect(onAnswered).toHaveBeenCalledWith({
        authorized: true,
        connectorId: 'slack',
      }),
    );
  });
});
