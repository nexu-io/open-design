// @vitest-environment jsdom

import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';

import { PluginPreviewHero } from '../../src/components/plugin-details/PluginPreviewHero';
import { notifyWorkspaceContextRefresh } from '../../src/collab/useWorkspaceContext';
import { workspaceContextFixture } from '../helpers/workspace-context';

afterEach(() => {
  cleanup();
  window.sessionStorage.clear();
});

it('pins iframe and popout navigation to the project Workspace after the shell switches', () => {
  const projectA = workspaceContextFixture({
    workspaceId: 'workspace-a',
    workspaceMemberId: 'member-a',
  });

  render(
    <PluginPreviewHero
      pluginId="deck-plugin"
      pluginTitle="Deck"
      examples={[{ path: 'examples/overview.html', title: 'Overview' }]}
      workspaceContext={projectA}
    />,
  );

  const expected =
    '/api/plugins/deck-plugin/example/overview'
    + '?workspaceId=workspace-a&workspaceMemberId=member-a';
  const iframe = screen.getByTestId('plugin-details-hero-iframe');
  const popout = screen.getByTestId('plugin-details-hero-popout');
  expect(iframe.getAttribute('src')).toBe(expected);
  expect(popout.getAttribute('href')).toBe(expected);

  // The navigation rail now selects B, but this mounted project surface still
  // owns A. A browser navigation cannot borrow the new shell selection.
  window.sessionStorage.setItem(
    'od.workspaceSelection.v1',
    JSON.stringify({ workspaceId: 'workspace-b', workspaceMemberId: 'member-b' }),
  );
  notifyWorkspaceContextRefresh();
  expect(iframe.getAttribute('src')).toBe(expected);
  expect(popout.getAttribute('href')).toBe(expected);
});
