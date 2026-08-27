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
  reportPreviewTransportRecovery,
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
      blank_observation_count: 2,
      sample_interval_ms: 1_500,
    }, { surface: 'artifact_preview', renderMode: 'srcdoc' });

    expect(reportSafetyEvent).toHaveBeenNthCalledWith(1, 'client_preview_resource_error', expect.objectContaining({
      resource_tag: 'script',
      resource_url: 'https://cdn.example/app.js',
    }));
    expect(reportSafetyEvent).toHaveBeenNthCalledWith(2, 'client_preview_white_screen', expect.objectContaining({
      reason: 'no_visible_paint_after_timeout',
      visible_element_count: 0,
      viewport_width: 1440,
      blank_observation_count: 2,
      sample_interval_ms: 1_500,
    }));
  });

  it('reports host-observed incomplete srcDoc recovery without authored content', () => {
    reportPreviewTransportRecovery({
      surface: 'artifact_preview',
      renderMode: 'srcdoc',
      artifactId: 'anon-artifact',
      artifactKind: 'slide_deck',
      projectId: 'project-1',
      signal: 'body_incomplete',
      activationAcknowledged: true,
      documentState: {
        readyState: 'loading',
        bodyPresent: true,
        bodyChildCount: 2,
        documentElementChildCount: 2,
      },
      viewportWidth: 1280,
      viewportHeight: 720,
    });

    expect(reportSafetyEvent).toHaveBeenCalledWith(
      'client_preview_white_screen',
      {
        surface: 'artifact_preview',
        render_mode: 'srcdoc',
        artifact_id: 'anon-artifact',
        artifact_kind: 'slide_deck',
        project_id: 'project-1',
        reason: 'srcdoc_transport_unverified',
        transport_signal: 'body_incomplete',
        transport_stage: 'head_bridge_alive_body_tail_missing',
        activation_acknowledged: true,
        body_complete: false,
        frame_ready_state: 'loading',
        frame_body_present: true,
        frame_body_child_count: 2,
        frame_document_element_child_count: 2,
        recovery_attempted: true,
        recovery_path: 'lazy_shell_remount',
        host_visibility_state: 'visible',
        viewport_width: 1280,
        viewport_height: 720,
        timeout_ms: undefined,
      },
    );
  });

  it.each([
    [true, 'head_bridge_lost_after_eager_ack'],
    [false, 'no_head_bridge_ack'],
  ])(
    'classifies a probe timeout from activation state %s',
    (activationAcknowledged, transportStage) => {
      reportPreviewTransportRecovery({
        surface: 'artifact_preview',
        renderMode: 'srcdoc',
        signal: 'probe_timeout',
        activationAcknowledged,
        timeoutMs: 1_500,
      });

      expect(reportSafetyEvent).toHaveBeenCalledWith(
        'client_preview_white_screen',
        expect.objectContaining({
          transport_signal: 'probe_timeout',
          transport_stage: transportStage,
          activation_acknowledged: activationAcknowledged,
          timeout_ms: 1_500,
        }),
      );
    },
  );

  it('classifies a retained unverified frame recovered on reactivation', () => {
    reportPreviewTransportRecovery({
      surface: 'artifact_preview',
      renderMode: 'srcdoc',
      signal: 'reactivation_unverified',
      activationAcknowledged: false,
    });

    expect(reportSafetyEvent).toHaveBeenCalledWith(
      'client_preview_white_screen',
      expect.objectContaining({
        transport_signal: 'reactivation_unverified',
        transport_stage: 'retained_frame_unverified_on_reactivation',
        recovery_attempted: true,
      }),
    );
  });

  // OPEND-2147. Without its own branch this measurement falls through to the
  // generic runtime-error path and is filed as a script crash that never
  // happened, which is worse than not reporting it: it points the next reader
  // at the artifact's JavaScript instead of at its layout.
  it('files a collapsed deck stage as its own measurement, not a script crash', () => {
    reportPreviewIframeMessage({
      type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
      version: 1,
      event: 'deck_stage_unscaled',
      stage_kind: 'deck-stage',
      stage_scale_permille: 0,
      stage_transform: 'matrix',
      stage_width: 0,
      stage_height: 0,
      canvas_width: 1920,
      canvas_height: 1080,
      viewport_width: 1075,
      viewport_height: 530,
      ready_state: 'complete',
      visibility_state: 'visible',
      elapsed_ms: 5000,
    }, { surface: 'artifact_preview', renderMode: 'srcdoc', artifactKind: 'slide_deck' }, new Set());

    expect(reportSafetyEvent).toHaveBeenCalledWith('client_preview_deck_stage_unscaled', expect.objectContaining({
      surface: 'artifact_preview',
      render_mode: 'srcdoc',
      // Frequency alone cannot triage this: three authored shapes can collapse,
      // and which one did is the whole reason the bridge sends stage_kind.
      stage_kind: 'deck-stage',
      stage_scale: 0,
      stage_transform: 'matrix',
      stage_width: 0,
      canvas_width: 1920,
      canvas_height: 1080,
      viewport_width: 1075,
      viewport_height: 530,
      ready_state: 'complete',
      visibility_state: 'visible',
      elapsed_ms: 5000,
    }));
    expect(reportSafetyEvent).not.toHaveBeenCalledWith('client_preview_runtime_error', expect.anything());
  });

  // The reporter asked to be able to find the cause from an exported log, not
  // only from a dashboard. On desktop only console warn/error reach
  // renderer.log, and that file is what `od diagnostics export` bundles, so the
  // measurement has to be written at warn level with everything needed to read
  // it standalone.
  it('writes one greppable warn line so the diagnostics export carries it', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    try {
      reportPreviewIframeMessage({
        type: PREVIEW_OBSERVABILITY_MESSAGE_TYPE,
        version: 1,
        event: 'deck_stage_unscaled',
        stage_kind: 'deck-stage',
        stage_scale_permille: 0,
        stage_transform: 'matrix',
        stage_width: 0,
        stage_height: 0,
        canvas_width: 1920,
        canvas_height: 1080,
        viewport_width: 1075,
        viewport_height: 530,
        ready_state: 'complete',
        visibility_state: 'visible',
        elapsed_ms: 5000,
      }, { surface: 'artifact_preview', renderMode: 'srcdoc' }, new Set());

      expect(warn).toHaveBeenCalledTimes(1);
      const line = warn.mock.calls[0]?.join(' ') ?? '';
      expect(line).toContain('[od:preview-observability] deck_stage_unscaled');
      for (const fragment of ['stage_kind=deck-stage', 'stage_scale=0', 'canvas=1920x1080', 'frame=1075x530', 'elapsed_ms=5000']) {
        expect(line).toContain(fragment);
      }
    } finally {
      warn.mockRestore();
    }
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
