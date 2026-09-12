// @vitest-environment jsdom
import { StrictMode } from 'react';
import { createPortal } from 'react-dom';
import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { WorkspaceAccountDock, useWorkspaceAccountDock } from '../../src/components/workspace/WorkspaceAccountDock';

afterEach(cleanup);

function Account() {
  const host = useWorkspaceAccountDock();
  return host ? createPortal(<button>Upgrade</button>, host) : null;
}

function Toolbar({ download, fallback = true }: { download: boolean; fallback?: boolean }) {
  return <StrictMode>
    <Account />
    {download && <div role="group" aria-label="File actions">
      <button>Download</button>
      <WorkspaceAccountDock placement="download" />
      <button>Share</button>
    </div>}
    {fallback && <WorkspaceAccountDock placement="fallback" />}
  </StrictMode>;
}

it('moves the single account entry after download and back when the viewer closes', () => {
  const { rerender } = render(<Toolbar download={false} />);
  expect(screen.getByTestId('workspace-account-dock-fallback').contains(screen.getByRole('button', { name: 'Upgrade' }))).toBe(true);
  rerender(<Toolbar download />);
  expect(screen.getAllByRole('button').map(button => button.textContent)).toEqual(['Download', 'Upgrade', 'Share']);
  rerender(<Toolbar download={false} />);
  expect(screen.getAllByRole('button', { name: 'Upgrade' })).toHaveLength(1);
  expect(screen.getByTestId('workspace-account-dock-fallback').contains(screen.getByRole('button', { name: 'Upgrade' }))).toBe(true);
});

it('does not lose the active download host when a fallback host detaches', () => {
  const { rerender } = render(<Toolbar download />);
  rerender(<Toolbar download fallback={false} />);
  expect(screen.getByTestId('workspace-account-dock-download').contains(screen.getByRole('button', { name: 'Upgrade' }))).toBe(true);
});
