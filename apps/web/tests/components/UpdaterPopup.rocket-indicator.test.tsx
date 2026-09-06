// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { installMockOpenDesignElectron } from '@open-design/electron-contract/testing';
import { UpdaterPopup } from '../../src/components/UpdaterPopup';
import { I18nProvider } from '../../src/i18n';
import { electronUpdaterStatus } from '../helpers/electron-updater';

describe('updater indicator', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { cleanup(); restore?.(); restore = null; });
  it('appears only for an actionable ready line', async () => {
    restore = installMockOpenDesignElectron({ host: { updater: { status: async () => electronUpdaterStatus({ state: 'ready', candidateVersion: 'betahyx-2' }) } } });
    render(<I18nProvider initial="en"><UpdaterPopup /></I18nProvider>);
    expect(await screen.findByTestId('updater-rocket-glyph')).toBeTruthy();
  });
});
