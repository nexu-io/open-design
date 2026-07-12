// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrandDetail, BrandSummary } from '@marketing-ax/contracts';

import { BrandsTab } from '../../src/components/BrandsTab';
import { createBrand } from '../../src/providers/registry';

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
  return {
    ...actual,
    fetchBrands: vi.fn(async () => brands),
    createBrand: vi.fn(),
  };
});

const createBrandMock = vi.mocked(createBrand);

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

  it('renders the "+ New brand" button', async () => {
    render(<BrandsTab onOpenBrand={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '+ New brand' })).toBeTruthy(),
    );
  });

  it('opens the create modal, auto-suggests an id slug, and creates the brand', async () => {
    const onOpenBrand = vi.fn();
    const createdDetail: BrandDetail = {
      id: 'acme-app',
      title: 'Acme App',
      deliverables: [],
      body: '# Acme App',
    };
    createBrandMock.mockResolvedValue({ brand: createdDetail });

    render(<BrandsTab onOpenBrand={onOpenBrand} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '+ New brand' })).toBeTruthy(),
    );

    fireEvent.click(screen.getByRole('button', { name: '+ New brand' }));
    expect(screen.getByRole('heading', { name: 'New brand' })).toBeTruthy();

    // 라틴 title 입력 → id 필드에 슬러그 자동 제안
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme App' } });
    expect((screen.getByLabelText('ID') as HTMLInputElement).value).toBe('acme-app');

    fireEvent.change(screen.getByLabelText('Subtitle'), {
      target: { value: 'Insurance app' },
    });
    fireEvent.change(screen.getByLabelText('Tagline'), {
      target: { value: 'Easy insurance.' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Create' }));
    await waitFor(() =>
      expect(createBrandMock).toHaveBeenCalledWith({
        id: 'acme-app',
        title: 'Acme App',
        presentation: { subtitle: 'Insurance app', tagline: 'Easy insurance.' },
      }),
    );
    await waitFor(() => expect(onOpenBrand).toHaveBeenCalledWith('acme-app'));
  });

  it('locks the id auto-suggestion once the id field is edited manually', async () => {
    render(<BrandsTab onOpenBrand={vi.fn()} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '+ New brand' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+ New brand' }));

    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Acme' } });
    expect((screen.getByLabelText('ID') as HTMLInputElement).value).toBe('acme');

    // 수동 편집 → 이후 title 변경이 id를 덮어쓰지 않는다
    fireEvent.change(screen.getByLabelText('ID'), { target: { value: 'custom-id' } });
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Other Name' } });
    expect((screen.getByLabelText('ID') as HTMLInputElement).value).toBe('custom-id');
  });

  it('shows the duplicate-id message on a 409 and keeps the modal open', async () => {
    const onOpenBrand = vi.fn();
    createBrandMock.mockResolvedValue({
      error: { status: 409, code: 'duplicate-id', message: 'duplicate id' },
    });

    render(<BrandsTab onOpenBrand={onOpenBrand} />);
    await waitFor(() =>
      expect(screen.getByRole('button', { name: '+ New brand' })).toBeTruthy(),
    );
    fireEvent.click(screen.getByRole('button', { name: '+ New brand' }));
    fireEvent.change(screen.getByLabelText('Name'), { target: { value: 'Bodoc' } });
    fireEvent.click(screen.getByRole('button', { name: 'Create' }));

    await waitFor(() =>
      expect(screen.getByText('A brand with this ID already exists.')).toBeTruthy(),
    );
    expect(onOpenBrand).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: 'New brand' })).toBeTruthy();
  });
});
