// @vitest-environment jsdom

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { BrandDetail } from '@marketing-ax/contracts';

import { BrandDetailView } from '../../src/components/BrandDetailView';
import {
  addBrandDeliverable,
  deleteBrand,
  fetchBrand,
  removeBrandDeliverable,
  saveBrandDoc,
  updateBrand,
  uploadBrandAsset,
} from '../../src/providers/registry';

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
    updateBrand: vi.fn(),
    saveBrandDoc: vi.fn(),
    addBrandDeliverable: vi.fn(),
    removeBrandDeliverable: vi.fn(),
    uploadBrandAsset: vi.fn(),
    deleteBrand: vi.fn(),
  };
});

const fetchBrandMock = vi.mocked(fetchBrand);
const updateBrandMock = vi.mocked(updateBrand);
const saveBrandDocMock = vi.mocked(saveBrandDoc);
const addBrandDeliverableMock = vi.mocked(addBrandDeliverable);
const removeBrandDeliverableMock = vi.mocked(removeBrandDeliverable);
const uploadBrandAssetMock = vi.mocked(uploadBrandAsset);
const deleteBrandMock = vi.mocked(deleteBrand);

afterEach(() => {
  cleanup();
  // restoreAllMocks는 vi.spyOn 스파이(window.confirm)만 복원한다 — 모듈 목
  // vi.fn()들의 호출 기록/구현은 clearAllMocks + 각 테스트의 ...Once 사용으로 격리.
  vi.clearAllMocks();
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

  // The view mounts directly inside .workspace-shell__body (overflow:hidden), so
  // its root must own the scroll — otherwise a tall page clips with no scrollbar
  // and the wheel does nothing (jsdom can't observe layout, so guard the CSS).
  it('owns its own scroll so tall content is not clipped by the overflow-hidden shell', () => {
    // vitest runs with cwd = the @marketing-ax/web package root.
    const cssPath = join(process.cwd(), 'src/components/BrandDetailView.module.css');
    const css = readFileSync(cssPath, 'utf8');
    const pageRule = css.match(/\.page\s*\{([^}]*)\}/)?.[1] ?? '';
    expect(pageRule).toMatch(/overflow-y:\s*auto/);
    expect(pageRule).toMatch(/height:\s*100%/);
  });

  it('shows a back button and an error alert instead of a dead end when the fetch fails', async () => {
    vi.mocked(fetchBrand).mockRejectedValueOnce(new Error('boom'));
    const onBack = vi.fn();
    render(<BrandDetailView brandId="bodoc" onBack={onBack} />);
    await waitFor(() => expect(screen.getByRole('alert')).toBeTruthy());
    fireEvent.click(screen.getByRole('button'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });
});

// 서브프로젝트 B — 상세 편집 모드 (편집 토글·문서 편집·채널 추가/삭제·에셋 업로드·삭제).
describe('BrandDetailView edit mode', () => {
  async function renderLoaded(onBack: () => void = () => {}) {
    render(<BrandDetailView brandId="bodoc" onBack={onBack} />);
    await waitFor(() => expect(screen.getByText('보험 앱')).toBeTruthy());
  }

  it('toggles the presentation form and saves via updateBrand, then refetches', async () => {
    updateBrandMock.mockResolvedValue({ ok: true });
    await renderLoaded();
    const fetchCallsBefore = fetchBrandMock.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    // 폼은 기존 presentation 값으로 프리필된다
    const subtitleInput = screen.getByLabelText('Subtitle') as HTMLInputElement;
    expect(subtitleInput.value).toBe('보험 앱');

    fireEvent.change(subtitleInput, { target: { value: 'Updated subtitle' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(updateBrandMock).toHaveBeenCalledWith('bodoc', {
        presentation: expect.objectContaining({
          subtitle: 'Updated subtitle',
          tagline: '보험을 쉽게.', // 통째 교체 시맨틱 — 나머지 필드 보존 확인
        }),
      }),
    );
    // 저장 성공 → fetchBrand 재호출 (낙관 갱신 없음)
    await waitFor(() =>
      expect(fetchBrandMock.mock.calls.length).toBeGreaterThan(fetchCallsBefore),
    );
  });

  it('shows the save-failed message and stays in edit mode when updateBrand errors', async () => {
    updateBrandMock.mockResolvedValue({
      error: { status: 500, message: 'boom' },
    });
    await renderLoaded();
    fireEvent.click(screen.getByRole('button', { name: 'Edit' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));
    await waitFor(() =>
      expect(screen.getByText('Could not save changes.')).toBeTruthy(),
    );
    expect(screen.getByLabelText('Subtitle')).toBeTruthy(); // 폼 유지
  });

  it('edits the active doc in a textarea and saves via saveBrandDoc', async () => {
    saveBrandDocMock.mockResolvedValue({ ok: true });
    await renderLoaded();
    const fetchCallsBefore = fetchBrandMock.mock.calls.length;

    fireEvent.click(screen.getByRole('button', { name: 'Edit doc' }));
    const textarea = screen.getByRole('textbox') as HTMLTextAreaElement;
    expect(textarea.value).toBe('# core body'); // 활성 문서 본문 프리필

    fireEvent.change(textarea, { target: { value: '# updated core' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saveBrandDocMock).toHaveBeenCalledWith('bodoc', 'core', '# updated core'),
    );
    await waitFor(() =>
      expect(fetchBrandMock.mock.calls.length).toBeGreaterThan(fetchCallsBefore),
    );
  });

  it('saves a channel doc under its deliverable key', async () => {
    saveBrandDocMock.mockResolvedValue({ ok: true });
    await renderLoaded();
    fireEvent.click(screen.getByText('블로그'));
    await waitFor(() => expect(screen.getByText(/blog body/)).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: 'Edit doc' }));
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '# new blog' } });
    fireEvent.click(screen.getByRole('button', { name: 'Save' }));

    await waitFor(() =>
      expect(saveBrandDocMock).toHaveBeenCalledWith('bodoc', 'blog', '# new blog'),
    );
  });

  it('adds a channel through the inline form via addBrandDeliverable', async () => {
    addBrandDeliverableMock.mockResolvedValue({ ok: true });
    await renderLoaded();

    fireEvent.click(screen.getByRole('button', { name: '+ Channel' }));
    fireEvent.change(screen.getByLabelText('Key'), { target: { value: 'newsletter' } });
    fireEvent.change(screen.getByLabelText('Label'), { target: { value: 'Newsletter' } });
    fireEvent.click(screen.getByRole('button', { name: 'Add' }));

    await waitFor(() =>
      expect(addBrandDeliverableMock).toHaveBeenCalledWith('bodoc', {
        key: 'newsletter',
        label: 'Newsletter',
      }),
    );
  });

  it('removes a channel after a confirm via removeBrandDeliverable', async () => {
    removeBrandDeliverableMock.mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    await renderLoaded();

    // 채널 문서 항목 순서 = deliverables 순서 (blog, iam)
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove channel' })[0]!);

    expect(confirmSpy).toHaveBeenCalled();
    await waitFor(() =>
      expect(removeBrandDeliverableMock).toHaveBeenCalledWith('bodoc', 'blog'),
    );
  });

  it('does not remove a channel when the confirm is dismissed', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    await renderLoaded();
    fireEvent.click(screen.getAllByRole('button', { name: 'Remove channel' })[0]!);
    expect(removeBrandDeliverableMock).not.toHaveBeenCalled();
  });

  it('uploads the icon with role=icon', async () => {
    uploadBrandAssetMock.mockResolvedValue({
      asset: { path: 'assets/icon.png', url: '/api/brands/bodoc/assets/icon.png' },
    });
    await renderLoaded();
    const file = new File(['png'], 'icon.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload icon'), { target: { files: [file] } });
    await waitFor(() =>
      expect(uploadBrandAssetMock).toHaveBeenCalledWith('bodoc', file, 'icon'),
    );
  });

  it('uploads the logo with role=logo', async () => {
    uploadBrandAssetMock.mockResolvedValue({
      asset: { path: 'assets/logo.png', url: '/api/brands/bodoc/assets/logo.png' },
    });
    await renderLoaded();
    const file = new File(['png'], 'logo.png', { type: 'image/png' });
    fireEvent.change(screen.getByLabelText('Upload logo'), { target: { files: [file] } });
    await waitFor(() =>
      expect(uploadBrandAssetMock).toHaveBeenCalledWith('bodoc', file, 'logo'),
    );
  });

  it('disables delete and shows the blocked reason when projects use the brand', async () => {
    // Once — 이 테스트의 최초 로드 1회만 바인딩 3건으로 응답, 이후 기본 목 복귀
    fetchBrandMock.mockResolvedValueOnce({ ...detail, projectCount: 3 });
    await renderLoaded();
    const deleteBtn = screen.getByRole('button', { name: 'Delete brand' }) as HTMLButtonElement;
    expect(deleteBtn.disabled).toBe(true);
    expect(
      screen.getByText('3 projects use this brand. Delete those projects first.'),
    ).toBeTruthy();
    fireEvent.click(deleteBtn);
    expect(deleteBrandMock).not.toHaveBeenCalled();
  });

  it('deletes the brand after a confirm and navigates back', async () => {
    deleteBrandMock.mockResolvedValue({ ok: true });
    const confirmSpy = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const onBack = vi.fn();
    await renderLoaded(onBack);

    fireEvent.click(screen.getByRole('button', { name: 'Delete brand' }));

    expect(confirmSpy).toHaveBeenCalledWith(
      'Delete the 보닥 brand? This cannot be undone.',
    );
    await waitFor(() => expect(deleteBrandMock).toHaveBeenCalledWith('bodoc'));
    await waitFor(() => expect(onBack).toHaveBeenCalledTimes(1));
  });
});
