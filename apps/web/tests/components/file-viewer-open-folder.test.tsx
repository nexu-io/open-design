// @vitest-environment jsdom

// 프리뷰 툴바 "프로젝트 폴더 열기" 버튼 (#folder-icon):
// - 데스크톱 호스트: shell.openPath 브릿지에 projectId 전달 → 파인더 오픈
// - 웹(브릿지 없음): GET /api/projects/:id 의 resolvedDir 를 토스트로 안내
// - 브릿지 실패: 에러 토스트

import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { ProjectFile } from '../../src/types';

const { isOpenDesignHostAvailableMock, openHostProjectPathMock } = vi.hoisted(() => ({
  isOpenDesignHostAvailableMock: vi.fn(),
  openHostProjectPathMock: vi.fn(),
}));

vi.mock('@marketing-ax/host', async () => {
  const actual =
    await vi.importActual<typeof import('@marketing-ax/host')>('@marketing-ax/host');
  return {
    ...actual,
    isOpenDesignHostAvailable: isOpenDesignHostAvailableMock,
    openHostProjectPath: openHostProjectPathMock,
  };
});

import { FileViewer } from '../../src/components/FileViewer';

function htmlFile(): ProjectFile {
  return {
    name: 'workspace.html',
    path: 'workspace.html',
    type: 'file',
    size: 1024,
    mtime: 1710000000,
    kind: 'html',
    mime: 'text/html',
    artifactManifest: {
      version: 1,
      kind: 'html',
      title: 'Workspace',
      entry: 'workspace.html',
      renderer: 'html',
      exports: ['html'],
    },
  };
}

function renderViewer() {
  return render(
    <FileViewer
      projectId="project-1"
      projectKind="prototype"
      file={htmlFile()}
      liveHtml="<html><body><main>Workspace</main></body></html>"
    />,
  );
}

describe('FileViewer open project folder button', () => {
  afterEach(() => {
    cleanup();
    vi.resetAllMocks();
    vi.unstubAllGlobals();
  });

  it('opens the project folder through the host bridge with the project id', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    openHostProjectPathMock.mockResolvedValue({ ok: true });

    renderViewer();

    fireEvent.click(screen.getByTestId('open-project-folder-button'));

    await waitFor(() => {
      expect(openHostProjectPathMock).toHaveBeenCalledWith('project-1');
    });
  });

  it('shows an error toast when the host bridge fails to open the folder', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(true);
    openHostProjectPathMock.mockResolvedValue({ ok: false, reason: 'nope' });

    renderViewer();

    fireEvent.click(screen.getByTestId('open-project-folder-button'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toBeTruthy();
    });
  });

  it('falls back to a toast naming the resolved directory on web', async () => {
    isOpenDesignHostAvailableMock.mockReturnValue(false);
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        project: { id: 'project-1', name: 'P1' },
        resolvedDir: '/data/projects/project-1',
      }),
    });
    vi.stubGlobal('fetch', fetchMock);

    renderViewer();

    fireEvent.click(screen.getByTestId('open-project-folder-button'));

    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toContain('/data/projects/project-1');
    });
    expect(openHostProjectPathMock).not.toHaveBeenCalled();
    expect(fetchMock).toHaveBeenCalledWith('/api/projects/project-1');
  });
});
