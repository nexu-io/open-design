// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { installMockOpenDesignElectron } from '@open-design/electron-contract/testing';

import { UpdaterPopup } from '../../src/components/UpdaterPopup';
import { I18nProvider } from '../../src/i18n';
import { electronUpdaterStatus } from '../helpers/electron-updater';

describe('UpdaterPopup dual-line lifecycle', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { cleanup(); restore?.(); restore = null; });

  it('stays hidden when neither line is ready', async () => {
    restore = installMockOpenDesignElectron({ host: { updater: { status: async () => electronUpdaterStatus() } } });
    render(<I18nProvider initial="en"><UpdaterPopup /></I18nProvider>);
    await waitFor(() => expect(screen.queryByTestId('entry-nav-updater')).toBeNull());
  });

  it('applies a ready Shell line as one lifecycle operation', async () => {
    const ready = electronUpdaterStatus({ state: 'ready', candidateVersion: 'betahyx-1.2.4' });
    const apply = vi.fn(async () => electronUpdaterStatus({ state: 'applying', candidateVersion: 'betahyx-1.2.4' }));
    restore = installMockOpenDesignElectron({ host: { updater: { apply, status: async () => ready } } });
    render(<I18nProvider initial="en"><UpdaterPopup /></I18nProvider>);
    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    fireEvent.click(await screen.findByTestId('updater-install-button'));
    await waitFor(() => expect(apply).toHaveBeenCalledWith('shell', { force: false }));
  });

  it('uses restart copy for a Closure line', async () => {
    const ready = electronUpdaterStatus({ target: 'closure', state: 'ready', candidateVersion: 'betahyx-20260905.2' });
    restore = installMockOpenDesignElectron({ host: { updater: { status: async () => ready } } });
    render(<I18nProvider initial="en"><UpdaterPopup /></I18nProvider>);
    fireEvent.click(await screen.findByTestId('entry-nav-updater'));
    expect(await screen.findByTestId('updater-install-button')).toHaveTextContent('Install and restart');
  });
});
