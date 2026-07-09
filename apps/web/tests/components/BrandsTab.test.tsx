// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrandSummary } from '@marketing-ax/contracts';

import { BrandsTab } from '../../src/components/BrandsTab';

const brands: BrandSummary[] = [
  {
    id: 'bodoc',
    title: '보닥',
    deliverables: ['blog', 'cardnews', 'iam'],
    deliverableLabels: { blog: '블로그', cardnews: '카드뉴스', iam: 'Braze IAM' },
    subtitle: '보험 앱',
    tagline: '보험을 쉽게.',
    primaryColor: '#1E86FA',
    toneLabel: '차분·신뢰',
    projectCount: 14,
  },
];

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return { ...actual, fetchBrands: vi.fn(async () => brands) };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrandsTab', () => {
  it('renders a rich brand card and opens the detail on click', async () => {
    const onOpenBrand = vi.fn();
    render(<BrandsTab onOpenBrand={onOpenBrand} />);
    await waitFor(() => expect(screen.getByText('보닥')).toBeTruthy());
    expect(screen.getByText('보험 앱')).toBeTruthy();
    expect(screen.getByText('보험을 쉽게.')).toBeTruthy();
    expect(screen.getByText('Braze IAM')).toBeTruthy();
    expect(screen.getByText('차분·신뢰')).toBeTruthy();

    fireEvent.click(screen.getByText('보닥'));
    expect(onOpenBrand).toHaveBeenCalledWith('bodoc');
  });
});
