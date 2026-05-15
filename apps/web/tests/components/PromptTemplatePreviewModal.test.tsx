// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { PromptTemplatePreviewModal } from '../../src/components/PromptTemplatePreviewModal';
import type { PromptTemplateSummary } from '../../src/types';

const fetchPromptTemplateMock = vi.hoisted(() => vi.fn(async () => ({ prompt: 'hello' })));

vi.mock('../../src/providers/registry', () => ({
  fetchPromptTemplate: fetchPromptTemplateMock,
}));

afterEach(() => {
  cleanup();
});

function renderModal(summary: PromptTemplateSummary) {
  return render(
    <I18nProvider initial="en">
      <PromptTemplatePreviewModal summary={summary} onClose={vi.fn()} />
    </I18nProvider>,
  );
}

describe('PromptTemplatePreviewModal', () => {
  it('renders the Open Design contribute link with the preview feedback template', async () => {
    renderModal({
      id: 'open-design-preview',
      surface: 'image',
      title: 'Open Design Preview',
      summary: 'Preview template',
      category: 'General',
      source: {
        repo: 'nexu-io/open-design',
        license: 'MIT',
        author: 'Open Design',
        url: 'https://github.com/nexu-io/open-design',
      },
    });

    const contributeLink = await screen.findByRole('link', { name: 'Contribute' });
    expect(contributeLink.getAttribute('href')).toBe(
      'https://github.com/nexu-io/open-design/issues/new?template=preview-v0.8.0-feedback.yml',
    );
  });
});
