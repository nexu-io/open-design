// @vitest-environment jsdom

import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import { act } from 'react';
import { useDesignSignatureStripEnabled, setDesignSignatureStripEnabled } from '../../src/components/Signature/hooks/useDesignSignatureStripEnabled';

beforeEach(() => window.localStorage.clear());
afterEach(() => cleanup());

function Probe() {
  const enabled = useDesignSignatureStripEnabled();
  return <span data-testid="state">{String(enabled)}</span>;
}

describe('design signature toggle integration', () => {
  it('flips the shared hook when CustomEvent is dispatched', () => {
    render(<Probe />);
    expect(screen.getByTestId('state').textContent).toBe('false');
    act(() => {
      fireEvent(window, new CustomEvent('open-design:signature-strip-toggle', { detail: { enabled: true } }));
    });
    expect(screen.getByTestId('state').textContent).toBe('true');
    act(() => setDesignSignatureStripEnabled(false));
    expect(screen.getByTestId('state').textContent).toBe('false');
  });

  it('flips the shared hook when setDesignSignatureStripEnabled is called directly', () => {
    render(<Probe />);
    expect(screen.getByTestId('state').textContent).toBe('false');
    act(() => setDesignSignatureStripEnabled(true));
    expect(screen.getByTestId('state').textContent).toBe('true');
    act(() => setDesignSignatureStripEnabled(false));
    expect(screen.getByTestId('state').textContent).toBe('false');
  });
});
