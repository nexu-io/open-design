// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { TheaterDegraded } from '../../../src/components/Theater/TheaterDegraded';

afterEach(() => cleanup());

describe('<TheaterDegraded> (Phase 8)', () => {
  it('renders the localized heading and reason copy', () => {
    render(<TheaterDegraded reason="malformed_block" adapter="pi-rpc" />);
    expect(screen.getByRole('status').getAttribute('data-reason')).toBe('malformed_block');
    expect(screen.getByText('Panel offline this run')).toBeTruthy();
    expect(
      screen.getByText('Malformed panel output (parser rejected the block).'),
    ).toBeTruthy();
  });

  it('interpolates the adapter name into adapter-unsupported reason', () => {
    render(<TheaterDegraded reason="adapter_unsupported" adapter="legacy-cli" />);
    expect(screen.getByText(/legacy-cli/)).toBeTruthy();
  });

  it('handles every contract-level reason without falling back to the key string', () => {
    for (const reason of [
      'malformed_block',
      'oversize_block',
      'adapter_unsupported',
      'protocol_version_mismatch',
      'missing_artifact',
    ] as const) {
      cleanup();
      render(<TheaterDegraded reason={reason} adapter="pi-rpc" />);
      const text = screen.getByRole('status').textContent ?? '';
      expect(text).not.toContain('critiqueTheater.');
      expect(text.length).toBeGreaterThan(20);
    }
  });
});
