// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ContextChipHoverCard } from '../../src/components/ContextChipHoverCard';
import {
  workspaceContextDetailLine,
  workspaceContextKindLabel,
} from '../../src/components/workspace-context';
import type { WorkspaceContextItem } from '@open-design/contracts';

afterEach(cleanup);

describe('ContextChipHoverCard', () => {
  it('renders the chip content and hides the info card until hovered', () => {
    render(
      <ContextChipHoverCard data-testid="chip" typeLabel="Referenced project" detail="/tmp/site">
        <span>My Project</span>
      </ContextChipHoverCard>,
    );
    expect(screen.getByText('My Project')).toBeTruthy();
    expect(screen.queryByTestId('chip-info')).toBeNull();
  });

  it('reveals the type and primary path on hover, then hides on leave', () => {
    render(
      <ContextChipHoverCard data-testid="chip" typeLabel="Referenced project" detail="/tmp/open-design/site">
        <span>My Project</span>
      </ContextChipHoverCard>,
    );
    const chip = screen.getByTestId('chip');

    fireEvent.mouseEnter(chip);
    const info = screen.getByTestId('chip-info');
    expect(info.textContent).toContain('Referenced project');
    expect(info.textContent).toContain('/tmp/open-design/site');

    fireEvent.mouseLeave(chip);
    expect(screen.queryByTestId('chip-info')).toBeNull();
  });

  it('shows only the type when there is no locator to surface', () => {
    render(
      <ContextChipHoverCard data-testid="chip" typeLabel="Local code" detail="">
        <span>code</span>
      </ContextChipHoverCard>,
    );
    fireEvent.mouseEnter(screen.getByTestId('chip'));
    const info = screen.getByTestId('chip-info');
    expect(info.textContent).toBe('Local code');
  });
});

describe('workspace-context chip helpers', () => {
  const item = (over: Partial<WorkspaceContextItem>): WorkspaceContextItem => ({
    id: 'x',
    kind: 'project',
    label: 'X',
    ...over,
  });

  it('labels project and local-code kinds', () => {
    expect(workspaceContextKindLabel('project')).toBe('Referenced project');
    expect(workspaceContextKindLabel('local-code')).toBe('Local code');
  });

  it('prefers the absolute path as the detail line', () => {
    expect(
      workspaceContextDetailLine(item({ absolutePath: '/abs/path', path: 'proj-id' })),
    ).toBe('/abs/path');
  });

  it('falls back to the project id when no folder is known', () => {
    expect(workspaceContextDetailLine(item({ path: 'proj-id' }))).toBe('proj-id');
  });

  it('is empty when the item carries no locator', () => {
    expect(workspaceContextDetailLine(item({ label: 'only-label' }))).toBe('');
  });
});
