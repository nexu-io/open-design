// @vitest-environment jsdom
//
// Unit tests for the "Save as template" feature hook: modal state, the
// default-name derivation, the save happy/failure paths, and the
// click->result analytics correlation (exactly one terminal result per
// session, whether it ends in a save or a cancel).
import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { useTemplateSave } from '../../../src/features/file-viewer/hooks/useTemplateSave.hooks';
import type { TemplateSaveDeps } from '../../../src/features/file-viewer/hooks/useTemplateSave.hooks';
import type { TemplateSavePort } from '../../../src/features/file-viewer/ports';
import type { ProjectTemplate } from '@open-design/contracts';

function makePort(over: Partial<TemplateSavePort> = {}): TemplateSavePort {
  return {
    saveTemplate: vi.fn(async () => null as ProjectTemplate | null),
    ...over,
  };
}

function makeDeps(over: Partial<TemplateSaveDeps> = {}): TemplateSaveDeps {
  return {
    projectId: 'proj-1',
    projectKind: 'prototype',
    fileName: 'index.html',
    fileKind: null,
    t: ((key: string, vars?: Record<string, string | number>) =>
      vars ? `${key}:${JSON.stringify(vars)}` : key) as TemplateSaveDeps['t'],
    analytics: { track: vi.fn(), newRequestId: vi.fn(() => 'req-1') },
    closeDownloadMenu: vi.fn(),
    ...over,
  };
}

describe('useTemplateSave', () => {
  it('opens the modal with a default name derived from the file, closing the download menu', () => {
    const deps = makeDeps({ fileName: 'landing.html' });
    const { result } = renderHook(() => useTemplateSave(makePort(), deps));

    act(() => {
      result.current.openSaveAsTemplateModal();
    });

    expect(result.current.templateModalOpen).toBe(true);
    expect(result.current.templateName).toBe('landing');
    expect(result.current.templateDescription).toBe('');
    expect(result.current.templateSaveError).toBeNull();
    expect(deps.closeDownloadMenu).toHaveBeenCalledTimes(1);
    expect(deps.analytics.track).toHaveBeenCalledTimes(1);
  });

  it('falls back to the translated default name when the file name has no stem', () => {
    const deps = makeDeps({ fileName: '.html' });
    const { result } = renderHook(() => useTemplateSave(makePort(), deps));

    act(() => {
      result.current.openSaveAsTemplateModal();
    });

    expect(result.current.templateName).toBe('fileViewer.templateNameDefault');
  });

  it('saves the template, closes the modal, and shows the saved toast', async () => {
    const template: ProjectTemplate = {
      id: 'tpl-1',
      name: 'My Template',
      files: [],
      createdAt: 1000,
    };
    const saveTemplate = vi.fn(async () => template);
    const deps = makeDeps();
    const { result } = renderHook(() => useTemplateSave(makePort({ saveTemplate }), deps));

    act(() => {
      result.current.openSaveAsTemplateModal();
      result.current.setTemplateName('My Template');
      result.current.setTemplateDescription('A description');
    });

    await act(async () => {
      await result.current.handleSaveAsTemplate();
    });

    expect(saveTemplate).toHaveBeenCalledWith({
      name: 'My Template',
      description: 'A description',
      sourceProjectId: 'proj-1',
    });
    expect(result.current.templateModalOpen).toBe(false);
    expect(result.current.templateName).toBe('');
    expect(result.current.templateSavedToast).toContain('My Template');
    expect(result.current.savingTemplate).toBe(false);
  });

  it('reports a save error and keeps the modal open when the port resolves null', async () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useTemplateSave(makePort({ saveTemplate: vi.fn(async () => null) }), deps));

    act(() => {
      result.current.openSaveAsTemplateModal();
      result.current.setTemplateName('My Template');
    });

    await act(async () => {
      await result.current.handleSaveAsTemplate();
    });

    expect(result.current.templateModalOpen).toBe(true);
    expect(result.current.templateSaveError).toBe('fileViewer.savedTemplateFail');
    expect(result.current.savingTemplate).toBe(false);
  });

  it('does not call the port when the trimmed name is empty', async () => {
    const saveTemplate = vi.fn(async () => null);
    const deps = makeDeps();
    const { result } = renderHook(() => useTemplateSave(makePort({ saveTemplate }), deps));

    act(() => {
      result.current.openSaveAsTemplateModal();
      result.current.setTemplateName('   ');
    });

    await act(async () => {
      await result.current.handleSaveAsTemplate();
    });

    expect(saveTemplate).not.toHaveBeenCalled();
  });

  it('cancelling closes the modal, clears the error, and fires exactly one cancelled result', () => {
    const deps = makeDeps();
    const { result } = renderHook(() => useTemplateSave(makePort(), deps));

    act(() => {
      result.current.openSaveAsTemplateModal();
    });
    const tracksAfterOpen = (deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length;

    act(() => {
      result.current.cancelSaveAsTemplateModal();
    });
    act(() => {
      // A second cancel in the same session must not double-fire the result.
      result.current.cancelSaveAsTemplateModal();
    });

    expect(result.current.templateModalOpen).toBe(false);
    expect(result.current.templateSaveError).toBeNull();
    expect((deps.analytics.track as ReturnType<typeof vi.fn>).mock.calls.length).toBe(tracksAfterOpen + 1);
  });

  it('dismissTemplateSavedToast clears the toast', async () => {
    const template: ProjectTemplate = { id: 'tpl-1', name: 'T', files: [], createdAt: 1000 };
    const deps = makeDeps();
    const { result } = renderHook(() =>
      useTemplateSave(makePort({ saveTemplate: vi.fn(async () => template) }), deps),
    );

    act(() => {
      result.current.openSaveAsTemplateModal();
      result.current.setTemplateName('T');
    });
    await act(async () => {
      await result.current.handleSaveAsTemplate();
    });
    await waitFor(() => expect(result.current.templateSavedToast).not.toBeNull());

    act(() => {
      result.current.dismissTemplateSavedToast();
    });

    expect(result.current.templateSavedToast).toBeNull();
  });
});
