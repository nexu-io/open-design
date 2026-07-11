// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { HostEditor } from '@open-design/contracts';
import { HandoffMenu } from '../../../src/features/handoff/components/HandoffMenu';
import { DEFAULT_FRAMEWORK } from '../../../src/features/handoff/constants';
import type { CliTarget } from '../../../src/features/handoff/types';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

const cursor: HostEditor = { id: 'cursor', label: 'Cursor', available: true };
const claude: CliTarget = { id: 'claude', name: 'Claude Code', bin: 'claude', available: true };

function renderMenu(props: Partial<Parameters<typeof HandoffMenu>[0]> = {}) {
  const onTabChange = vi.fn();
  const onCopyProjectPath = vi.fn();
  const onLaunchEditor = vi.fn();
  const onCopyCli = vi.fn();
  const onChooseFramework = vi.fn();
  const onAmrWebsiteClick = vi.fn();
  render(
    <I18nProvider initial="en">
      <HandoffMenu
        activeTab="editor"
        onTabChange={onTabChange}
        projectDir="/tmp/open-design/Landing"
        copiedCliId={null}
        copyBusy={null}
        onCopyProjectPath={onCopyProjectPath}
        error={null}
        available={[cursor]}
        unavailable={[]}
        busy={null}
        onLaunchEditor={onLaunchEditor}
        availableCliTargets={[claude]}
        unavailableCliTargets={[]}
        selectedFramework={DEFAULT_FRAMEWORK}
        onCopyCli={onCopyCli}
        onChooseFramework={onChooseFramework}
        onAmrWebsiteClick={onAmrWebsiteClick}
        {...props}
      />
    </I18nProvider>,
  );
  return { onTabChange, onCopyProjectPath, onLaunchEditor, onCopyCli, onChooseFramework, onAmrWebsiteClick };
}

describe('HandoffMenu', () => {
  it('renders the editor panel on the editor tab and switches on tab click', () => {
    const { onTabChange } = renderMenu();
    expect(screen.getByTestId('handoff-menu-item-cursor')).toBeTruthy();
    fireEvent.click(screen.getByRole('tab', { name: 'Copy for CLI' }));
    expect(onTabChange).toHaveBeenCalledWith('cli');
  });

  it('renders the CLI panel on the cli tab', () => {
    renderMenu({ activeTab: 'cli' });
    expect(screen.getByTestId('handoff-cli-item-claude')).toBeTruthy();
    expect(screen.queryByTestId('handoff-menu-item-cursor')).toBeNull();
  });

  it('the path-copy row shows the project dir as a title and copies on click', () => {
    const { onCopyProjectPath } = renderMenu();
    const row = screen.getByTestId('handoff-project-path');
    const button = row.querySelector('button') as HTMLButtonElement;
    expect(button.title).toBe('/tmp/open-design/Landing');
    expect(button.disabled).toBe(false);
    fireEvent.click(button);
    expect(onCopyProjectPath).toHaveBeenCalledTimes(1);
  });

  it('disables the path-copy row when there is no projectDir', () => {
    renderMenu({ projectDir: null });
    const row = screen.getByTestId('handoff-project-path');
    expect((row.querySelector('button') as HTMLButtonElement).disabled).toBe(true);
  });

  it('shows the copied state on the path row when copiedCliId matches', () => {
    renderMenu({ copiedCliId: 'project-path' });
    const row = screen.getByTestId('handoff-project-path');
    expect(row.querySelector('button')!.className).toContain('copied');
    expect(row.textContent).toContain('Copied');
  });

  it('renders the error line below a divider when present', () => {
    renderMenu({ error: 'something broke' });
    expect(screen.getByText('something broke')).toBeTruthy();
  });

  it('renders no error line when error is null', () => {
    renderMenu();
    expect(screen.queryByText('something broke')).toBeNull();
  });
});
