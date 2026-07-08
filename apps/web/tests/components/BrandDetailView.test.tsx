// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchBrand: vi.fn(),
}));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchBrand: mocks.fetchBrand,
  };
});

import { BrandDetailView } from '../../src/components/BrandDetailView';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrandDetailView', () => {
  it('renders the core body once the fetch resolves', async () => {
    mocks.fetchBrand.mockResolvedValue({
      id: 'bodoc',
      title: '보닥',
      deliverables: ['blog', 'cardnews'],
      body: '# Bodoc core',
    });

    render(<BrandDetailView brandId="bodoc" onBack={() => {}} />);

    expect(await screen.findByText('보닥')).toBeTruthy();
  });

  it('shows a back button and an error message instead of a dead end when the fetch fails', async () => {
    mocks.fetchBrand.mockRejectedValue(new Error('boom'));
    const onBack = vi.fn();

    render(<BrandDetailView brandId="bodoc" onBack={onBack} />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    const backButton = screen.getByRole('button', { name: /back/i });
    backButton.click();
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});
