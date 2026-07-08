// @vitest-environment jsdom

// 프리뷰 툴바 "캡션 복사" 버튼 — cardnews 갤러리(.caption 섹션 + 캡션 pre)일 때만
// 노출, 클릭 시 캡션 전문 + 해시태그를 평문으로 클립보드 복사.

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

const { copyToClipboardMock } = vi.hoisted(() => ({
  copyToClipboardMock: vi.fn(),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: copyToClipboardMock,
}));

import { FileViewer } from '../../src/components/FileViewer';

const CARDNEWS_HTML = `<!doctype html><html><body>
<section class="caption">
  <h2>캡션 (복사용)</h2>
  <pre>"SPF 50 발랐으니 하루 종일 안전할까?"</pre>
  <div class="tags">#자외선차단제 #선크림</div>
</section>
</body></html>`;

function htmlFile(): ProjectFile {
  return {
    name: 'cards-preview.html',
    path: 'cards-preview.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Cards',
      entry: 'cards-preview.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function renderViewer(liveHtml: string) {
  return render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml={liveHtml}
    />,
  );
}

describe('FileViewer copy caption button', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
  });

  it('copies the caption text to the clipboard on click', async () => {
    copyToClipboardMock.mockResolvedValue(true);

    renderViewer(CARDNEWS_HTML);

    fireEvent.click(screen.getByTestId('copy-caption-button'));

    await waitFor(() => {
      expect(copyToClipboardMock).toHaveBeenCalledTimes(1);
    });
    const copied = copyToClipboardMock.mock.calls[0]?.[0] as string;
    expect(copied).toContain('SPF 50 발랐으니');
    expect(copied).toContain('#자외선차단제 #선크림');
  });

  it('does not render the button for non-cardnews HTML', () => {
    renderViewer('<html><body><main>plain artifact</main></body></html>');
    expect(screen.queryByTestId('copy-caption-button')).toBeNull();
  });
});
