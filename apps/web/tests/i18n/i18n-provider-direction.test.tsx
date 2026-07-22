// @vitest-environment jsdom

import { cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { I18nProvider } from '../../src/i18n';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('lang');
  document.documentElement.removeAttribute('dir');
});

describe('I18nProvider document direction', () => {
  it('sets the document language and direction for Hebrew', async () => {
    render(
      <I18nProvider initial="he">
        <div>content</div>
      </I18nProvider>,
    );

    await waitFor(() => {
      expect(document.documentElement).toHaveAttribute('lang', 'he');
      expect(document.documentElement).toHaveAttribute('dir', 'rtl');
    });
  });
});
