// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { RunModelIdentity } from '../../src/components/chat/RunModelIdentity';
import { modelProvenance } from '../../src/runtime/chat/run-model';

afterEach(cleanup);

it('shows the selected and reported models for the most recent attempt', () => {
  const identity = modelProvenance([
    { kind: 'status', label: 'starting', agentId: 'amr', requestedModel: 'old', dispatchedModel: 'old' },
    { kind: 'status', label: 'provider_model', detail: 'old-observed' },
    { kind: 'status', label: 'starting', agentId: 'amr', requestedModel: 'requested', dispatchedModel: 'requested' },
    { kind: 'status', label: 'model_fallback', dispatchedModel: 'fallback' },
    { kind: 'status', label: 'provider_model', detail: 'actual' },
  ]);
  render(<RunModelIdentity identity={identity} />);
  expect(screen.getByTestId('run-model-identity').textContent).toBe('requested → fallback (selected) · Model actual');
});

it('leaves actual unknown on a new attempt and on legacy history without evidence', () => {
  const { rerender } = render(<RunModelIdentity identity={modelProvenance([
    { kind: 'status', label: 'provider_model', detail: 'old-observed' },
    { kind: 'status', label: 'starting', agentId: 'claude', requestedModel: 'retry' },
    { kind: 'status', label: 'initializing', detail: 'unconfirmed' },
  ])} />);
  expect(screen.getByTestId('run-model-identity').textContent).toBe('retry (selected)');
  rerender(<RunModelIdentity identity={modelProvenance([
    { kind: 'status', label: 'starting', detail: 'claude' },
    { kind: 'status', label: 'initializing', detail: 'unconfirmed' },
  ])} />);
  expect(screen.queryByTestId('run-model-identity')).toBeNull();
});

it('does not carry a previous provider response over a model fallback', () => {
  const identity = modelProvenance([
    { kind: 'status', label: 'starting', agentId: 'amr', requestedModel: 'original', dispatchedModel: 'original' },
    { kind: 'status', label: 'provider_model', detail: 'original-observed' },
    { kind: 'status', label: 'model_fallback', dispatchedModel: 'fallback' },
  ]);
  render(<RunModelIdentity identity={identity} />);
  expect(screen.getByTestId('run-model-identity').textContent).toBe('original → fallback (selected)');
});
