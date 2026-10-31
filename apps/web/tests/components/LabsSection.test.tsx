// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { LabsSection } from '../../src/components/LabsSection';
import { I18nProvider } from '../../src/i18n';
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
it('retains Labs content without the retired OD Next switch or config requests', () => {
  const fetch = vi.fn(); vi.stubGlobal('fetch', fetch);
  render(<I18nProvider initial="en"><LabsSection /></I18nProvider>);
  expect(screen.queryByRole('switch')).toBeNull();
  expect(document.querySelector('.settings-section')).not.toBeNull();
  expect(fetch).not.toHaveBeenCalled();
});
