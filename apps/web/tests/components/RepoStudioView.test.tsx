// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RepoStudioControlValue, RepoStudioInspectResponse } from '@open-design/contracts';
import { RepoStudioView } from '../../src/components/RepoStudioView';

const mocks = vi.hoisted(() => ({
  currentValue: 2 as RepoStudioControlValue,
  apply: vi.fn(),
  diff: vi.fn(),
  inspect: vi.fn(),
  verify: vi.fn(),
}));

vi.mock('../../src/providers/repo-studio', () => ({
  applyRepoStudioControl: mocks.apply,
  diffRepoStudio: mocks.diff,
  inspectRepoStudio: mocks.inspect,
  verifyRepoStudio: mocks.verify,
}));

function inspection(): RepoStudioInspectResponse {
  return {
    root: '/project/rune',
    manifestUrl: 'http://127.0.0.1:5050/__rune_studio/manifest',
    manifest: {
      protocolVersion: 1,
      appId: 'rune',
      appName: 'Rune',
      previewUrl: 'http://127.0.0.1:5050/?studio-fixture=busy-day',
      components: [
        {
          id: 'home.library-tasks',
          label: 'Library tasks',
          selector: '[data-od-id="home-library-tasks"]',
          sourceFile: 'src/features/home/components/library-task-grid-section.tsx',
          controls: [
            {
              id: 'columns',
              label: 'Grid columns',
              kind: 'select',
              value: mocks.currentValue,
              options: [
                { value: 1, label: '1 column', sourceToken: 'libraryTaskColumns: 1' },
                { value: 2, label: '2 columns', sourceToken: 'libraryTaskColumns: 2' },
              ],
              edit: { file: 'src/features/home/studio-config.ts', marker: '@rune-studio columns' },
            },
          ],
        },
      ],
      verification: [],
    },
  };
}

describe('RepoStudioView', () => {
  beforeEach(() => {
    localStorage.clear();
    mocks.currentValue = 2;
    mocks.inspect.mockReset().mockImplementation(async () => inspection());
    mocks.diff.mockReset().mockResolvedValue({ clean: true, files: [], diff: '' });
    mocks.verify.mockReset();
    mocks.apply.mockReset().mockImplementation(async (request: {
      componentId: string;
      controlId: string;
      value: RepoStudioControlValue;
    }) => {
      const previousValue = mocks.currentValue;
      mocks.currentValue = request.value;
      return {
        ok: true,
        file: 'src/features/home/studio-config.ts',
        componentId: request.componentId,
        controlId: request.controlId,
        previousValue,
        value: request.value,
        beforeSnippet: `columns: ${previousValue}`,
        afterSnippet: `columns: ${request.value}`,
      };
    });
  });

  afterEach(cleanup);

  it('selects a live target, applies a registered control, and undoes it', async () => {
    render(<RepoStudioView onBack={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Open project' }));
    expect(await screen.findByText('Library tasks')).toBeTruthy();

    const iframe = document.querySelector('iframe');
    expect(iframe?.contentWindow).toBeTruthy();
    act(() => {
      window.dispatchEvent(new MessageEvent('message', {
        source: iframe?.contentWindow ?? null,
        data: {
          type: 'od-edit-targets',
          targets: [{
            id: 'home-library-tasks',
            kind: 'container',
            label: 'Library tasks',
            tagName: 'section',
            className: '',
            text: 'Tasks',
            rect: { x: 0, y: 0, width: 400, height: 300 },
            fields: { text: 'Tasks' },
            attributes: { 'data-od-id': 'home-library-tasks' },
            styles: {},
            isLayoutContainer: true,
            outerHtml: '<section data-od-id="home-library-tasks"></section>',
          }],
        },
      }));
    });

    fireEvent.click(screen.getByRole('button', { name: /Library tasks/ }));
    const columns = await screen.findByLabelText('Grid columns');
    expect((columns as HTMLSelectElement).value).toBe('2');

    fireEvent.change(columns, { target: { value: '1' } });
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(1));
    expect(mocks.apply.mock.calls[0]?.[0]).toMatchObject({ value: 1 });

    const undo = screen.getByRole('button', { name: 'Undo' });
    await waitFor(() => expect(undo.hasAttribute('disabled')).toBe(false));
    fireEvent.click(undo);
    await waitFor(() => expect(mocks.apply).toHaveBeenCalledTimes(2));
    expect(mocks.apply.mock.calls[1]?.[0]).toMatchObject({ value: 2 });
  });
});
