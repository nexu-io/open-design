// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HandoffCliPanel } from '../../../src/features/handoff/components/HandoffCliPanel';
import { DEFAULT_FRAMEWORK } from '../../../src/features/handoff/constants';
import type { CliTarget } from '../../../src/features/handoff/types';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

const claude: CliTarget = { id: 'claude', name: 'Claude Code', bin: 'claude', available: true };
const codex: CliTarget = { id: 'codex', name: 'Codex CLI', bin: 'codex', available: false };

function renderPanel(props: Partial<Parameters<typeof HandoffCliPanel>[0]> = {}) {
  const onCopyCli = vi.fn();
  const onChooseFramework = vi.fn();
  const onAmrWebsiteClick = vi.fn();
  render(
    <I18nProvider initial="en">
      <HandoffCliPanel
        availableCliTargets={[claude]}
        unavailableCliTargets={[codex]}
        copiedCliId={null}
        copyBusy={null}
        selectedFramework={DEFAULT_FRAMEWORK}
        onCopyCli={onCopyCli}
        onChooseFramework={onChooseFramework}
        onAmrWebsiteClick={onAmrWebsiteClick}
        {...props}
      />
    </I18nProvider>,
  );
  return { onCopyCli, onChooseFramework, onAmrWebsiteClick };
}

describe('HandoffCliPanel', () => {
  it('renders the AMR link and fires onAmrWebsiteClick', () => {
    const { onAmrWebsiteClick } = renderPanel();
    const link = screen.getByRole('link', { name: /Visit Open Design/ });
    fireEvent.click(link);
    expect(onAmrWebsiteClick).toHaveBeenCalledTimes(1);
  });

  it('marks the selected framework chip active and fires onChooseFramework for another', () => {
    const { onChooseFramework } = renderPanel();
    const reactChip = screen.getByRole('button', { name: 'React' });
    expect(reactChip.className).toContain('active');
    expect(reactChip.getAttribute('aria-pressed')).toBe('true');

    const vueChip = screen.getByRole('button', { name: 'Vue.js' });
    expect(vueChip.className).not.toContain('active');
    fireEvent.click(vueChip);
    expect(onChooseFramework).toHaveBeenCalledWith('vue');
  });

  it('renders installed CLI targets and fires onCopyCli', () => {
    const { onCopyCli } = renderPanel();
    const row = screen.getByTestId('handoff-cli-item-claude');
    expect(row.textContent).toContain('Claude Code');
    fireEvent.click(row);
    expect(onCopyCli).toHaveBeenCalledWith(claude);
  });

  it('renders not-installed CLI targets dimmed and fires onCopyCli on click', () => {
    const { onCopyCli } = renderPanel();
    const row = screen.getByTestId('handoff-cli-item-codex');
    expect(row.className).toContain('dim');
    fireEvent.click(row);
    expect(onCopyCli).toHaveBeenCalledWith(codex);
  });

  it('shows the copied state on an unavailable row too', () => {
    renderPanel({ copiedCliId: 'codex' });
    expect(screen.getByTestId('handoff-cli-item-codex').className).toContain('copied');
  });

  it('omits the installed group when there are no available targets', () => {
    renderPanel({ availableCliTargets: [] });
    expect(screen.queryByTestId('handoff-cli-item-claude')).toBeNull();
  });

  it('shows the copied state on the matching row only', () => {
    renderPanel({ copiedCliId: 'claude' });
    expect(screen.getByTestId('handoff-cli-item-claude').className).toContain('copied');
    expect(screen.getByTestId('handoff-cli-item-claude').textContent).toContain('Copied');
  });

  it('disables the row matching copyBusy', () => {
    renderPanel({ copyBusy: 'claude' });
    expect((screen.getByTestId('handoff-cli-item-claude') as HTMLButtonElement).disabled).toBe(true);
  });
});
