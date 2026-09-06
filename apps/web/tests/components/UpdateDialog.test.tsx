// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { OpenDesignElectronUpdaterOpenDialogListener } from '@open-design/electron-contract';
import { installMockOpenDesignElectron } from '@open-design/electron-contract/testing';

import { UpdateDialog } from '../../src/components/UpdateDialog';
import { I18nProvider } from '../../src/i18n';
import { electronUpdaterStatus } from '../helpers/electron-updater';

describe('UpdateDialog dual-line lifecycle', () => {
  let restore: (() => void) | null = null;
  afterEach(() => { cleanup(); restore?.(); restore = null; });

  it('checks both lifecycle lines from the native menu request', async () => {
    let open: OpenDesignElectronUpdaterOpenDialogListener | null = null;
    const check = vi.fn(async () => electronUpdaterStatus({ target: 'closure', state: 'ready', candidateVersion: 'betahyx-2' }));
    restore = installMockOpenDesignElectron({ host: { updater: {
      check,
      status: async () => electronUpdaterStatus(),
      subscribeOpenDialog: (listener) => { open = listener; return () => undefined; },
    } } });
    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => open?.({ source: 'mac-app-menu' }));
    expect(await screen.findByRole('dialog', { name: 'Check for updates' })).toBeTruthy();
    await waitFor(() => expect(check).toHaveBeenCalledWith(undefined));
  });

  it('applies the selected Closure line without a second quit command', async () => {
    let open: OpenDesignElectronUpdaterOpenDialogListener | null = null;
    const ready = electronUpdaterStatus({ target: 'closure', state: 'ready', candidateVersion: 'betahyx-2' });
    const apply = vi.fn(async () => electronUpdaterStatus({ target: 'closure', state: 'applying', candidateVersion: 'betahyx-2' }));
    restore = installMockOpenDesignElectron({ host: { updater: {
      apply,
      status: async () => ready,
      subscribeOpenDialog: (listener) => { open = listener; return () => undefined; },
    } } });
    render(<I18nProvider initial="en"><UpdateDialog /></I18nProvider>);
    await act(async () => open?.({ source: 'mac-app-menu' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Install and restart' }));
    await waitFor(() => expect(apply).toHaveBeenCalledWith('closure', { force: false }));
  });
});
