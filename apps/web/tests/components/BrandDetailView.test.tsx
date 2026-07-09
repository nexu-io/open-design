// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrandDetail } from '@marketing-ax/contracts';

import { BrandDetailView } from '../../src/components/BrandDetailView';

const detail: BrandDetail = {
  id: 'bodoc',
  title: '보닥',
  deliverables: ['blog', 'iam'],
  deliverableLabels: { blog: '블로그', iam: 'Braze IAM' },
  body: '# core body',
  palette: [{ name: 'brand-blue', value: '#1E86FA', usage: 'body' }],
  presentation: {
    subtitle: '보험 앱',
    website: 'bodoc.co.kr',
    audience: '40·50대',
    tagline: '보험을 쉽게.',
    keyMessage: '제대로 내고 제대로 받게',
    typography: { family: 'Pretendard', roles: '제목 · 본문', weights: '700 · 500 · 400' },
    voiceTone: ['차분한', '신뢰감 있는'],
    neutralPalette: ['#EAF4FF'],
  },
};

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return {
    ...actual,
    fetchBrand: vi.fn(async (_id: string, deliverable?: string) =>
      deliverable ? { ...detail, deliverable: { key: deliverable, body: `# ${deliverable} body` } } : detail,
    ),
  };
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('BrandDetailView', () => {
  it('renders identity, context, design-system, and docs sections', async () => {
    render(<BrandDetailView brandId="bodoc" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('보험 앱')).toBeTruthy());
    expect(screen.getByText('#1E86FA')).toBeTruthy(); // palette hex chip
    expect(screen.getByText('Pretendard')).toBeTruthy();
    expect(screen.getByText('차분한')).toBeTruthy(); // voice tone chip
    expect(screen.getByText('제대로 내고 제대로 받게')).toBeTruthy(); // context field
  });

  it('switches the doc preview when a channel doc is selected', async () => {
    render(<BrandDetailView brandId="bodoc" onBack={() => {}} />);
    await waitFor(() => expect(screen.getByText('블로그')).toBeTruthy());
    fireEvent.click(screen.getByText('블로그'));
    await waitFor(() => expect(screen.getByText(/blog body/)).toBeTruthy());
  });
});
