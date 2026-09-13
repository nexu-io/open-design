// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { I18nProvider } from '../../src/i18n';
import { ProjectPreviewPane } from '../../src/components/design-files/ProjectPreviewPane';
import type { ProjectFile } from '../../src/types';
import type { RunProgressStep } from '../../src/runtime/run-progress';

function file(overrides: Partial<ProjectFile> = {}): ProjectFile {
  return {
    name: 'index.html',
    size: 1200,
    mtime: 1_756_000_000_123,
    kind: 'html',
    mime: 'text/html',
    ...overrides,
  } as ProjectFile;
}

function step(overrides: Partial<RunProgressStep> = {}): RunProgressStep {
  return {
    id: '1',
    category: 'edit',
    toolName: 'Edit',
    target: 'index.html',
    anchor: null,
    ...overrides,
  };
}

function renderPane(props: Partial<Parameters<typeof ProjectPreviewPane>[0]> = {}) {
  return render(
    <I18nProvider initial="zh-CN">
      <ProjectPreviewPane
        projectId="p1"
        files={[file()]}
        filesRefreshKey={3}
        workspaceContext={null}
        running={false}
        steps={[]}
        phase="preparing"
        {...props}
      />
    </I18nProvider>,
  );
}

afterEach(() => {
  cleanup();
});

describe('ProjectPreviewPane', () => {
  it("renders the project's entry page", () => {
    renderPane();

    const frame = screen.getByTestId('project-preview-frame');
    expect(frame.getAttribute('src')).toContain('index.html');
    // Both halves of the cache bust: an agent can rewrite one file twice
    // inside a single filesystem mtime tick.
    expect(frame.getAttribute('src')).toContain('v=1756000000123');
    expect(frame.getAttribute('src')).toContain('fr=3');
  });

  // A finished page is there to be scrolled and clicked; the build preview's
  // frame is the one that has to stay out of the pointer path.
  it('lets the reader interact with the finished page', () => {
    renderPane();

    const frame = screen.getByTestId('project-preview-frame');
    expect(frame.getAttribute('sandbox')).toContain('allow-scripts');
    expect(frame.getAttribute('sandbox')).not.toContain('allow-same-origin');
  });

  // While the run writes that page, this pane IS the build preview: a plainer
  // second preview would show the same page carrying less information.
  it('hands a run in flight to the build preview', () => {
    renderPane({ running: true, steps: [step()] });

    expect(screen.getByTestId('design-files-building')).toBeTruthy();
    expect(screen.queryByTestId('project-preview-frame')).toBeNull();
  });

  // Nothing to preview is not nothing to SAY: the particle field turns here
  // with the run's own state at its centre, which is the answer to "why is
  // there nothing to see yet". Design Files, next door, just lists files.
  it('turns the particle field when the project has no page yet', () => {
    renderPane({
      files: [file({ name: 'notes.md', kind: 'text', mime: 'text/markdown' })],
      running: true,
      steps: [step({ target: 'index.html' })],
    });

    expect(screen.getByTestId('project-preview-empty')).toBeTruthy();
    expect(screen.getByTestId('design-files-empty-chat')).toBeTruthy();
    expect(screen.getByText('编辑 index.html')).toBeTruthy();
    expect(screen.queryByTestId('project-preview-frame')).toBeNull();
  });

  // The field reports every way a run can stop, not just the steps.
  it('names a failed run inside the field', () => {
    renderPane({
      files: [file({ name: 'notes.md', kind: 'text', mime: 'text/markdown' })],
      running: false,
      failure: 'failed',
    });

    expect(screen.getByTestId('design-files-empty-failure').textContent).toBe('运行失败');
  });

  // The newest HTML wins when there is no shallow site entry, matching how the
  // build preview picks the page it watches.
  it('picks the same entry page the build preview picks', () => {
    renderPane({
      files: [
        file({ name: 'deep/page.html', mtime: 1_756_000_000_999 }),
        file({ name: 'index.html', mtime: 1_756_000_000_100 }),
      ],
    });

    expect(screen.getByTestId('project-preview-frame').getAttribute('src')).toContain(
      'index.html',
    );
  });
});
