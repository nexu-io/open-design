import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  formatAppDialogMessage,
  setActiveAppDialogApi,
  showAppAlert,
  showAppConfirm,
} from '../../src/utils/app-dialog';

describe('app dialog fallback', () => {
  afterEach(() => {
    setActiveAppDialogApi(null);
    vi.unstubAllGlobals();
  });

  it('rejects alerts when no app dialog provider or native fallback exists', async () => {
    vi.stubGlobal('alert', undefined);

    await expect(showAppAlert('Missing provider')).rejects.toThrow(
      'AppDialog API unavailable: no app dialog provider or native alert() fallback is available.',
    );
  });

  it('rejects confirms when no app dialog provider or native fallback exists', async () => {
    vi.stubGlobal('confirm', undefined);

    await expect(showAppConfirm('Missing provider')).rejects.toThrow(
      'AppDialog API unavailable: no app dialog provider or native confirm() fallback is available.',
    );
  });

  it('normalizes dialog messages to sentence case with terminal punctuation', () => {
    expect(formatAppDialogMessage('target file already exists')).toBe('Target file already exists.');
    expect(formatAppDialogMessage(' API key missing. ')).toBe('API key missing.');
    expect(formatAppDialogMessage('"quoted warning"')).toBe('"Quoted warning."');
  });
});
