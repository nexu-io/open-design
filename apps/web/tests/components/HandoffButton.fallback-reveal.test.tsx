// @vitest-environment jsdom

// Regression for the zero-editors fallback: when no editor is detected, the
// fallback button must perform a real reveal (open the project folder via the
// daemon's open-in catalogue: finder / explorer / file-manager) rather than a
// no-op that advertises an action it never runs.

import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { HandoffButton } from '../../src/components/HandoffButton';
import { I18nProvider } from '../../src/i18n';
import type { AgentInfo, HostEditorsResponse } from '@open-design/contracts';

const fetchHostEditors = vi.fn<() => Promise<HostEditorsResponse>>();
const openProjectInEditor = vi.fn();
const copyToClipboard = vi.fn();

vi.mock('../../src/providers/registry', () => ({
  fetchHostEditors: () => fetchHostEditors(),
  openProjectInEditor: (...args: unknown[]) => openProjectInEditor(...args),
}));

vi.mock('../../src/lib/copy-to-clipboard', () => ({
  copyToClipboard: (...args: unknown[]) => copyToClipboard(...args),
}));

afterEach(() => {
  cleanup();
  fetchHostEditors.mockReset();
  openProjectInEditor.mockReset();
  copyToClipboard.mockReset();
});

describe('HandoffButton zero-editors fallback', () => {
  it('opens the project folder in the OS file manager via the daemon', async () => {
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [],
    });
    openProjectInEditor.mockResolvedValue(undefined);

    render(
      <I18nProvider initial="en">
        <HandoffButton projectId="p1" />
      </I18nProvider>,
    );

    const fallback = (await screen.findByText('Finder')).closest('button') as HTMLButtonElement;
    fireEvent.click(fallback);

    await waitFor(() => expect(openProjectInEditor).toHaveBeenCalledWith('p1', 'finder'));
  });

  it('surfaces a daemon spawn failure inline so the fallback is not a silent no-op', async () => {
    // The production caller (`ProjectView`) mounts `<HandoffButton projectId={…} />`
    // with no `onRequestRevealInFinder` callback, so a rejected
    // `openProjectInEditor` would otherwise leave users with a CTA that
    // advertises Finder/Explorer/File Manager but does nothing visible.
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [],
    });
    openProjectInEditor.mockRejectedValue(new Error('daemon refused: ENOENT'));

    render(
      <I18nProvider initial="en">
        <HandoffButton projectId="p1" />
      </I18nProvider>,
    );

    const fallback = (await screen.findByText('Finder')).closest('button') as HTMLButtonElement;
    fireEvent.click(fallback);

    const errorEl = await screen.findByTestId('handoff-fallback-error');
    expect(errorEl.textContent).toContain('daemon refused: ENOENT');
  });

  it('copies a framework-specific CLI handoff prompt with the local project path', async () => {
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [
        {
          id: 'cursor',
          label: 'Cursor',
          available: true,
        },
      ],
    });
    copyToClipboard.mockResolvedValue(true);
    const agents: AgentInfo[] = [
      {
        id: 'claude',
        name: 'Claude Code',
        bin: 'claude',
        available: true,
      },
      {
        id: 'codex',
        name: 'Codex CLI',
        bin: 'codex',
        available: false,
      },
    ];

    render(
      <I18nProvider initial="zh-CN">
        <HandoffButton
          projectId="p1"
          projectName="Landing"
          projectDir="/tmp/open-design/Landing"
          agents={agents}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('handoff-caret'));
    fireEvent.click(await screen.findByRole('tab', { name: '复制给 CLI' }));
    expect(screen.getByRole('link', { name: /打开 AMR 官网/ }).getAttribute('href'))
      .toBe('https://open-design.ai/amr');
    expect(screen.getByTestId('handoff-cli-item-amr').textContent).toContain('未安装');
    expect(
      screen.getByTestId('handoff-cli-item-amr').compareDocumentPosition(
        screen.getByTestId('handoff-cli-item-codex'),
      ) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    fireEvent.click(await screen.findByRole('button', { name: 'Vue.js' }));
    fireEvent.click(await screen.findByTestId('handoff-cli-item-claude'));

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledTimes(1));
    const prompt = copyToClipboard.mock.calls[0]?.[0] as string;
    expect(prompt).toContain('/tmp/open-design/Landing');
    expect(prompt).toContain('Vue.js');
    expect(prompt).toContain('Claude Code');
    expect(prompt).toContain('真实可运行');
  });

  it('keeps the project path hidden behind a compact copy row', async () => {
    fetchHostEditors.mockResolvedValue({
      platform: 'darwin',
      editors: [
        {
          id: 'cursor',
          label: 'Cursor',
          available: true,
        },
      ],
    });
    copyToClipboard.mockResolvedValue(true);
    const projectDir = '/tmp/open-design/Landing';

    render(
      <I18nProvider initial="en">
        <HandoffButton
          projectId="p1"
          projectName="Landing"
          projectDir={projectDir}
        />
      </I18nProvider>,
    );

    fireEvent.click(await screen.findByTestId('handoff-caret'));

    const pathRow = await screen.findByTestId('handoff-project-path');
    expect(pathRow.textContent).toContain('Copy path');
    expect(pathRow.textContent).not.toContain(projectDir);

    const copyPathButton = within(pathRow).getByRole('button', { name: 'Copy path' });
    expect(copyPathButton.getAttribute('title')).toBe(projectDir);
    fireEvent.click(copyPathButton);

    await waitFor(() => expect(copyToClipboard).toHaveBeenCalledWith(projectDir));
  });
});
