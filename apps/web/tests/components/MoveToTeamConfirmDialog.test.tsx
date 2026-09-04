// @vitest-environment jsdom

import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { MoveToTeamConfirmDialog } from '../../src/components/MoveToTeamConfirmDialog';

describe('MoveToTeamConfirmDialog', () => {
  it('escapes the workspace stacking context so its backdrop also covers the global composer', () => {
    render(
      <div data-testid="workspace-stacking-context">
        <MoveToTeamConfirmDialog
          action="to-team"
          onCancel={vi.fn()}
          onConfirm={vi.fn()}
        />
      </div>,
    );

    const workspaceLayer = screen.getByTestId('workspace-stacking-context');
    const dialog = screen.getByRole('alertdialog', { name: 'Move to team space' });
    const backdrop = dialog.parentElement;

    expect(workspaceLayer).not.toContainElement(dialog);
    expect(backdrop?.parentElement).toBe(document.body);
    expect(backdrop).not.toHaveClass('modal-backdrop--no-blur');
  });
});
