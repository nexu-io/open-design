// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { BrandReferencePicker } from '../../src/components/BrandReferencePicker';
import { BRAND_REFERENCES, type BrandReference } from '../../src/runtime/brand-references';

afterEach(cleanup);

// Mirrors the real surfaces: the click kicks off extraction (onPick) and the
// parent flips `busy`, which is what makes the loading feedback appear.
function Harness({ onPick }: { onPick: (brand: BrandReference) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <BrandReferencePicker
      variant="full"
      busy={busy}
      onPick={(brand) => {
        setBusy(true);
        onPick(brand);
      }}
    />
  );
}

describe('BrandReferencePicker', () => {
  it('kicks off extraction and shows a loading status when a brand card is clicked', () => {
    const onPick = vi.fn();
    render(<Harness onPick={onPick} />);

    const brand = BRAND_REFERENCES[0]!;
    fireEvent.click(screen.getByTestId(`brand-card-${brand.domain}`));

    // The click reaches the extraction kickoff.
    expect(onPick).toHaveBeenCalledWith(brand);

    // ...and immediately produces visible feedback: a status line naming the
    // brand plus a busy/locked state on the clicked card.
    const status = screen.getByTestId('brand-picker-status');
    expect(status.textContent).toContain(brand.name);

    const card = screen.getByTestId(`brand-card-${brand.domain}`) as HTMLButtonElement;
    expect(card.getAttribute('aria-busy')).toBe('true');
    expect(card.disabled).toBe(true);
  });

  it('surfaces an extraction failure inline instead of reading as "nothing happened"', () => {
    render(<BrandReferencePicker variant="full" error="Extraction failed" onPick={() => {}} />);

    expect(screen.getByTestId('brand-picker-error').textContent).toContain('Extraction failed');
  });
});
