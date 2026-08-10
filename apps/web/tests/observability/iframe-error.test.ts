// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from 'vitest';
import { PREVIEW_OBSERVABILITY_MESSAGE_TYPE } from '@open-design/contracts/runtime/preview-observability';

const { reportSafetyEvent } = vi.hoisted(() => ({
  reportSafetyEvent: vi.fn(),
}));

vi.mock('../../src/analytics/error-tracking', () => ({ reportSafetyEvent }));

import {
  installPreviewIframeMessageObserver,
  reportPreviewIframeMessage,
  subscribePreviewIframeMessages,
} from '../../src/observability/iframe-error';

afterEach(() => {
  reportSafetyEvent.mockReset();
});

describe('preview iframe observability', () => {
  it('maps runtime failures to a scrubbed PostHog safety event', () => {
    const seen = new Set<string>();
    const reported = reportPreviewIframeMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'runtime_error',
      name: 'TypeError',
      message: 'Failed at https://example.com/app.js?secret=token',
      source_url: 'https://example.com/app.js?secret=token',
      stack: 'TypeError: render failed at renderPreview',
      line: 12,
      column: 4,
    }, {
      surface: 'artifact_preview',
      renderMode: 'url_load',
      artifactId: 'anon-artifact',
      artifactKind: 'prototype',
      projectId: 'project-1',
    }, seen);

    expect(reported).toBe(true);
    expect(reportSafetyEvent).toHaveBeenCalledWith('client_preview_runtime_error', expect.objectContaining({
      surface: 'artifact_preview',
      render_mode: 'url_load',
      error_origin: 'runtime_error',
      error_name: 'TypeError',
      error_message: 'Failed at https://example.com/app.js',
      error_source_url: 'https://example.com/app.js',
      error_stack: 'TypeError: render failed at renderPreview',
      line: 12,
      column: 4,
    }));
  });

  it('reports resource failures and white screens without DOM text', () => {
    reportPreviewIframeMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'resource_error',
      resource_tag: 'script',
      resource_url: 'https://cdn.example/app.js?token=secret',
    }, { surface: 'artifact_preview', renderMode: 'srcdoc' });
    reportPreviewIframeMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'white_screen',
      ready_state: 'complete',
      body_child_count: 1,
      visible_element_count: 0,
      viewport_width: 1440,
      viewport_height: 900,
    }, { surface: 'artifact_preview', renderMode: 'srcdoc' });

    expect(reportSafetyEvent).toHaveBeenNthCalledWith(1, 'client_preview_resource_error', expect.objectContaining({
      resource_tag: 'script',
      resource_url: 'https://cdn.example/app.js',
    }));
    expect(reportSafetyEvent).toHaveBeenNthCalledWith(2, 'client_preview_white_screen', expect.objectContaining({
      reason: 'no_visible_paint_after_timeout',
      visible_element_count: 0,
      viewport_width: 1440,
    }));
  });

  it('deduplicates repeated failures from one preview', () => {
    const seen = new Set<string>();
    const message = {
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'console_error',
      message: 'render failed',
    } as const;

    expect(reportPreviewIframeMessage(message, { surface: 'artifact_preview', renderMode: 'srcdoc' }, seen)).toBe(true);
    expect(reportPreviewIframeMessage(message, { surface: 'artifact_preview', renderMode: 'srcdoc' }, seen)).toBe(false);
    expect(reportSafetyEvent).toHaveBeenCalledTimes(1);
  });

  it('buffers boot-time iframe messages until FileViewer subscribes', () => {
    const teardown = installPreviewIframeMessageObserver();
    const source = window;
    window.dispatchEvent(new MessageEvent('message', {
      source,
      data: {
        type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
        version: 1,
        event: 'runtime_error',
        message: 'early boot failure',
      },
    }));

    const subscriber = vi.fn();
    const unsubscribe = subscribePreviewIframeMessages(subscriber);
    expect(subscriber).toHaveBeenCalledWith(expect.objectContaining({
      source,
      data: expect.objectContaining({ message: 'early boot failure' }),
    }));

    unsubscribe();
    const laterSubscriber = vi.fn();
    const unsubscribeLater = subscribePreviewIframeMessages(laterSubscriber);
    expect(laterSubscriber).not.toHaveBeenCalled();

    unsubscribeLater();
    teardown();
  });

  it('does not replay messages delivered to a live subscriber', () => {
    const teardown = installPreviewIframeMessageObserver();
    const source = window;
    const subscriber = vi.fn();
    const unsubscribe = subscribePreviewIframeMessages(subscriber);
    window.dispatchEvent(new MessageEvent('message', {
      source,
      data: {
        type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
        version: 1,
        event: 'runtime_error',
        message: 'live failure',
      },
    }));
    expect(subscriber).toHaveBeenCalledTimes(1);

    unsubscribe();
    const replacementSubscriber = vi.fn();
    const unsubscribeReplacement = subscribePreviewIframeMessages(replacementSubscriber);
    expect(replacementSubscriber).not.toHaveBeenCalled();

    unsubscribeReplacement();
    teardown();
  });
});
