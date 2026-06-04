// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { GenerationPreviewStage } from '../../src/components/GenerationPreviewStage';
import { resolveRunFailureUi } from '../../src/runtime/amr-guidance';
import type { GenerationPreviewModel } from '../../src/runtime/generation-preview';

let root: Root | null = null;
let host: HTMLDivElement | null = null;

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  if (root) {
    act(() => root?.unmount());
    root = null;
  }
  host?.remove();
  host = null;
  vi.clearAllMocks();
});

function generatingModel(overrides: Partial<GenerationPreviewModel> = {}): GenerationPreviewModel {
  return {
    startedAt: 0,
    steps: [
      { id: 'understand', status: 'succeeded' },
      { id: 'generate', status: 'running' },
      { id: 'prepare', status: 'pending' },
    ],
    phase: 'generating',
    failed: false,
    errorMessage: null,
    errorCode: null,
    failureUi: null,
    promoteAmrSwitch: false,
    activityLabel: 'Sketching the hero section',
    detailLabel: 'Writing index.html',
    todoProgress: { done: 2, total: 5 },
    ...overrides,
  };
}

// Mirror the production gate in buildGenerationPreviewState so the test
// model matches what the app actually feeds the component.
function failedModel(code: string | null, agentId: string | null): GenerationPreviewModel {
  const failureUi = resolveRunFailureUi(code, agentId);
  return {
    startedAt: 0,
    steps: [
      { id: 'understand', status: 'succeeded' },
      { id: 'generate', status: 'failed' },
      { id: 'prepare', status: 'pending' },
    ],
    phase: 'failed',
    failed: true,
    errorMessage: 'Raw upstream error string',
    errorCode: code,
    failureUi,
    promoteAmrSwitch: failureUi.showSwitchCard && code !== 'UPSTREAM_UNAVAILABLE',
    activityLabel: null,
    detailLabel: null,
    todoProgress: null,
  };
}

function render(model: GenerationPreviewModel, props: Record<string, unknown> = {}): HTMLElement {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root!.render(<GenerationPreviewStage model={model} {...props} />);
  });
  return host;
}

describe('GenerationPreviewStage', () => {
  it('never renders a progress bar while generating', () => {
    const markup = renderToStaticMarkup(<GenerationPreviewStage model={generatingModel()} />);
    expect(markup).not.toContain('role="progressbar"');
    // The step pills and live sub-status carry the progress signal instead.
    expect(markup).toContain('data-testid="generation-preview-stage"');
    expect(markup).toContain('Writing index.html');
    expect(markup).toContain('2/5');
  });

  it('never renders a progress bar on the failed surface', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage model={failedModel('RATE_LIMITED', 'claude')} onRetry={vi.fn()} />,
    );
    expect(markup).not.toContain('role="progressbar"');
  });

  it('names the cause and promotes AMR for a non-AMR rate-limited failure', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage
        model={failedModel('RATE_LIMITED', 'claude')}
        onRetry={vi.fn()}
        amrGuidance={<div data-testid="amr-guidance-card" />}
      />,
    );
    expect(markup).toContain('Too many requests');
    expect(markup).toContain('data-testid="generation-preview-retry"');
    expect(markup).toContain('data-testid="amr-guidance-card"');
  });

  it('does not render the promotion card for an upstream outage', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage
        model={failedModel('UPSTREAM_UNAVAILABLE', 'claude')}
        onRetry={vi.fn()}
        amrGuidance={<div data-testid="amr-guidance-card" />}
      />,
    );
    expect(markup).toContain('Generation service unavailable');
    expect(markup).not.toContain('data-testid="amr-guidance-card"');
    expect(markup).toContain('data-testid="generation-preview-retry"');
  });

  it('keeps local agent availability failures on the generic failed title', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage
        model={failedModel('AGENT_UNAVAILABLE', 'codex')}
        onRetry={vi.fn()}
        amrGuidance={<div data-testid="amr-guidance-card" />}
      />,
    );
    expect(markup).toContain('Generation failed');
    expect(markup).not.toContain('Generation service unavailable');
    expect(markup).not.toContain('data-testid="amr-guidance-card"');
    expect(markup).toContain('data-testid="generation-preview-retry"');
  });

  it('renders the authorize action for an AMR auth-required failure', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage
        model={failedModel('AMR_AUTH_REQUIRED', 'amr')}
        onAuthorizeAndRetry={vi.fn()}
      />,
    );
    expect(markup).toContain('Sign-in or authorization expired');
    expect(markup).toContain('data-testid="generation-preview-authorize"');
    expect(markup).toContain('Authorize &amp; retry');
    // The AMR agent has the inline authorize action, so no promotion card.
    expect(markup).not.toContain('data-testid="generation-preview-recharge"');
  });

  it('renders recharge plus a secondary retry for an AMR balance failure', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage
        model={failedModel('AMR_INSUFFICIENT_BALANCE', 'amr')}
        onRetry={vi.fn()}
      />,
    );
    expect(markup).toContain('Account balance ran out');
    expect(markup).toContain('data-testid="generation-preview-recharge"');
    expect(markup).toContain('Top up AMR');
    // secondaryRetry surfaces the plain retry alongside the primary action.
    expect(markup).toContain('data-testid="generation-preview-retry"');
  });

  it('renders the terminal sign-in action for an Antigravity auth failure', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage
        model={failedModel('AGENT_AUTH_REQUIRED', 'antigravity')}
        onLaunchTerminalAuth={vi.fn()}
        onRetry={vi.fn()}
      />,
    );
    expect(markup).toContain('Sign-in or authorization expired');
    expect(markup).toContain('data-testid="generation-preview-launch-terminal"');
    expect(markup).toContain('Sign in via terminal');
  });

  it('falls back to the generic failed title and a plain retry for an unknown code', () => {
    const markup = renderToStaticMarkup(
      <GenerationPreviewStage model={failedModel(null, 'claude')} onRetry={vi.fn()} />,
    );
    expect(markup).toContain('Generation failed');
    expect(markup).toContain('Raw upstream error string');
    expect(markup).toContain('data-testid="generation-preview-retry"');
  });

  it('wires the action buttons to their callbacks', () => {
    const onAuthorizeAndRetry = vi.fn();
    const container = render(failedModel('AMR_AUTH_REQUIRED', 'amr'), { onAuthorizeAndRetry });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="generation-preview-authorize"]',
    );
    expect(button).not.toBeNull();
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onAuthorizeAndRetry).toHaveBeenCalledTimes(1);
  });

  it('wires the retry button to onRetry', () => {
    const onRetry = vi.fn();
    const container = render(failedModel(null, 'claude'), { onRetry });
    const button = container.querySelector<HTMLButtonElement>(
      '[data-testid="generation-preview-retry"]',
    );
    expect(button).not.toBeNull();
    act(() => {
      button!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
