// @vitest-environment jsdom

import { fireEvent, render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { DesignFilesPanel } from '../../src/components/DesignFilesPanel';
import type { ProjectFile, ProjectFileKind } from '../../src/types';

function extForKind(kind: ProjectFileKind): string {
  if (kind === 'html') return 'html';
  if (kind === 'image') return 'png';
  if (kind === 'sketch') return 'svg';
  if (kind === 'text') return 'txt';
  if (kind === 'code') return 'ts';
  if (kind === 'pdf') return 'pdf';
  return 'bin';
}

function generateFiles(count: number): ProjectFile[] {
  const kinds: ProjectFileKind[] = [
    'html', 'image', 'sketch', 'text', 'code', 'pdf',
  ];
  return Array.from({ length: count }, (_, i) => {
    const kind = kinds[i % kinds.length];
    return {
      name: `file-${i + 1}.${extForKind(kind!)}`,
      kind: kind!,
      size: 1024 * (i + 1),
      mtime: Date.now() - i * 60_000,
      mime: 'text/plain',
    };
  });
}

function renderPanel(files: ProjectFile[]) {
  return render(
    <DesignFilesPanel
      projectId="test-project"
      files={files}
      liveArtifacts={[]}
      onRefreshFiles={vi.fn()}
      onOpenFile={vi.fn()}
      onOpenLiveArtifact={vi.fn()}
      onDeleteFile={vi.fn()}
      onDeleteFiles={vi.fn()}
      onUpload={vi.fn()}
      onUploadFiles={vi.fn()}
      onPaste={vi.fn()}
      onNewSketch={vi.fn()}
    />,
  );
}

function getPageInfo(container: HTMLElement): string {
  const el = container.querySelector('.df-page-info');
  return el?.textContent?.trim() ?? '';
}

/** page-btn order: top-Prev=0, top-Next=1, bottom-Prev=2, bottom-Next=3 */
function getPageBtns(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLButtonElement>('.df-page-btn'));
}

function getSelects(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLSelectElement>('select'));
}

describe('DesignFilesPanel large-list regression', () => {
  it('renders only the default page size (30) rows with 500 files', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);
    expect(container.querySelectorAll('.df-file-row').length).toBe(30);
  });

  it('shows all 500 rows when page size is set to All', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    const selects = getSelects(container);
    fireEvent.change(selects[0]!, { target: { value: 'all' } });

    expect(container.querySelectorAll('.df-file-row').length).toBe(500);
  });

  it('shows 60 rows when page size is changed to 60', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    const selects = getSelects(container);
    fireEvent.change(selects[0]!, { target: { value: '60' } });

    expect(container.querySelectorAll('.df-file-row').length).toBe(60);
  });

  it('navigates pages with Next button and updates row content', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    expect(container.querySelectorAll('.df-file-row').length).toBe(30);
    expect(container.querySelector('.df-file-row')!.textContent).toContain('file-1');

    const btns = getPageBtns(container);
    fireEvent.click(btns[1]!);

    expect(container.querySelectorAll('.df-file-row').length).toBe(30);
    expect(container.querySelector('.df-file-row')!.textContent).toContain('file-31');
  });

  it('shows disabled Previous on first page and Next on last page', () => {
    const files = generateFiles(45);
    const { container } = renderPanel(files);

    const btns = getPageBtns(container);
    expect(btns[0]!.disabled).toBe(true);
    expect(btns[1]!.disabled).toBe(false);

    fireEvent.click(btns[1]!);
    const btns2 = getPageBtns(container);
    expect(btns2[0]!.disabled).toBe(false);

    fireEvent.click(getPageBtns(container)[1]!);
    fireEvent.click(getPageBtns(container)[1]!);
    expect(getPageBtns(container)[1]!.disabled).toBe(true);
  });

  it('jumps to a specific page via page dropdown at bottom', () => {
    const files = generateFiles(200);
    const { container } = renderPanel(files);

    const selects = getSelects(container);
    fireEvent.change(selects[1]!, { target: { value: '3' } });

    expect(container.querySelector('.df-file-row')!.textContent).toContain('file-91');
  });

  it('updates page info text when navigating', () => {
    const files = generateFiles(500);
    const { container } = renderPanel(files);

    expect(getPageInfo(container)).toContain('1–30 of 500');

    const btns = getPageBtns(container);
    fireEvent.click(btns[1]!);

    expect(getPageInfo(container)).toContain('31–60 of 500');
  });

  it('renders 500 files within a reasonable time', () => {
    const files = generateFiles(500);
    const start = performance.now();
    renderPanel(files);
    const elapsed = performance.now() - start;
    expect(elapsed).toBeLessThan(2000);
  });
});
