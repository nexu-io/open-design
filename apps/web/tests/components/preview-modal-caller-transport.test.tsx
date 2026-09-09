// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { InstalledPluginRecord } from '@open-design/contracts';
import type { SkillSummary } from '../../src/types';

/**
 * The preview modal only navigates to a real document URL when its caller
 * hands it one. These are the two catalogue surfaces that own one today —
 * pin the wiring so a refactor cannot quietly drop them back onto srcdoc
 * while PreviewModal's own transport tests stay green.
 */

vi.mock('../../src/providers/registry', () => ({
  fetchSkillExample: vi.fn(async () => ({ html: '<html><body>skill</body></html>' })),
  skillExampleDocumentUrl: (id: string) => `/api/skills/${encodeURIComponent(id)}/example`,
  fetchPluginPreviewHtml: vi.fn(async () => ({ html: '<html><body>plugin</body></html>' })),
  fetchPluginExampleHtml: vi.fn(async () => ({ html: '<html><body>plugin</body></html>' })),
  pluginPreviewDocumentUrl: (id: string) => `/api/plugins/${encodeURIComponent(id)}/preview`,
  pluginExampleDocumentUrl: (id: string, stem: string) =>
    `/api/plugins/${encodeURIComponent(id)}/example/${encodeURIComponent(stem)}`,
  fetchPluginAssetText: vi.fn(async () => null),
}));

vi.mock('../../src/runtime/exports', () => ({
  captureHostIframeSnapshot: vi.fn(),
  exportAsHtml: vi.fn(),
  exportAsImage: vi.fn(),
  exportAsPdf: vi.fn(),
  exportAsZip: vi.fn(),
  openSandboxedPreviewInNewTab: vi.fn(),
  requestPreviewSnapshot: vi.fn(),
}));

import { ExamplesTab } from '../../src/components/ExamplesTab';
import { PluginExampleDetail } from '../../src/components/plugin-details/PluginExampleDetail';
import { I18nProvider } from '../../src/i18n';

async function flushPromises() {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function stageFrame(): HTMLIFrameElement {
  const frame = document.querySelector('.ds-modal-stage-iframe-scaler iframe');
  if (!frame) throw new Error('preview stage iframe did not render');
  return frame as HTMLIFrameElement;
}

const SKILL: SkillSummary = {
  id: 'orbit-notion',
  name: 'Orbit Notion',
  description: 'A sample skill.',
  triggers: [],
  // Not a deck: deck views still take the srcdoc path on purpose.
  mode: 'prototype',
  previewType: 'html',
  designSystemRequired: false,
  defaultFor: [],
  upstream: null,
  hasBody: true,
  examplePrompt: 'Make me something nice.',
  aggregatesExamples: false,
} as SkillSummary;

const PLUGIN = {
  id: 'acme-plugin',
  title: 'Acme',
  description: 'A sample plugin.',
  manifest: { od: { mode: 'prototype' } },
} as unknown as InstalledPluginRecord;

describe('preview modal callers own a document URL', () => {
  afterEach(() => {
    cleanup();
  });

  it('navigates the skill example stage at /api/skills/:id/example', async () => {
    render(<ExamplesTab skills={[SKILL]} onUsePrompt={() => {}} />);
    fireEvent.click(screen.getAllByText(/open preview/i)[0]!);
    await flushPromises();

    const frame = stageFrame();
    expect(frame.getAttribute('data-od-render-mode')).toBe('url-load');
    expect(frame.getAttribute('src')).toContain('/api/skills/orbit-notion/example');
    expect(frame.hasAttribute('srcdoc')).toBe(false);
  });

  it('navigates the plugin preview stage at /api/plugins/:id/preview', async () => {
    render(
      <I18nProvider initial="en">
        <PluginExampleDetail record={PLUGIN} onUse={() => {}} onClose={() => {}} />
      </I18nProvider>,
    );
    await flushPromises();

    const frame = stageFrame();
    expect(frame.getAttribute('data-od-render-mode')).toBe('url-load');
    expect(frame.getAttribute('src')).toContain('/api/plugins/acme-plugin/preview');
    expect(frame.hasAttribute('srcdoc')).toBe(false);
  });

  it('navigates a named plugin example at /api/plugins/:id/example/:name', async () => {
    render(
      <I18nProvider initial="en">
        <PluginExampleDetail
          record={PLUGIN}
          exampleStem="dashboard"
          onUse={() => {}}
          onClose={() => {}}
        />
      </I18nProvider>,
    );
    await flushPromises();

    const frame = stageFrame();
    expect(frame.getAttribute('src')).toContain('/api/plugins/acme-plugin/example/dashboard');
  });
});
