// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrandSummary } from '@marketing-ax/contracts';

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchBrands: vi.fn(async (): Promise<BrandSummary[]> => [
      { id: 'bodoc', title: '보닥', deliverables: ['blog', 'cardnews', 'iam'] },
    ]),
  };
});

import { BrandsTab } from '../../src/components/BrandsTab';

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrandsTab', () => {
  it('renders brand cards with deliverable chips', async () => {
    render(<BrandsTab onOpenBrand={() => {}} />);
    expect(await screen.findByText('보닥')).toBeTruthy();
    expect(screen.getByText('cardnews')).toBeTruthy();
  });
});
