// @vitest-environment jsdom
//
// OPEND-3128 / OPEND-3258: the project name is shown once, in the project
// switcher above the chat card. The chat card's own `.chat-project-header`
// row (which S3 #8129 kept for the inline rename) no longer renders on the
// project page: renaming lives in the switcher's row menu (K2 #8183) and the
// history control is portalled into the tabs dock. The pending-creation card
// that hands off to the real chat drops the same row so nothing jumps at the
// hand-off.

import { cleanup, render, screen, within } from '@testing-library/react';
import { forwardRef } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';
import { ProjectCreationPendingView } from '../../src/components/ProjectCreationPendingView';
import { I18nProvider } from '../../src/i18n';

vi.mock('../../src/components/ChatComposer', () => ({
  ChatComposer: forwardRef(() => <div />),
}));

afterEach(cleanup);

function renderPane(options: { historyPortalTarget?: HTMLElement | null } = {}) {
  return render(
    <I18nProvider initial="zh-CN">
      <ChatPane
        historyPortalTarget={options.historyPortalTarget}
        messages={[]}
        streaming={false}
        error={null}
        projectId="p1"
        projectFiles={[]}
        onEnsureProject={async () => 'p1'}
        onSend={vi.fn()}
        onStop={vi.fn()}
        onSelectConversation={vi.fn()}
        onDeleteConversation={vi.fn()}
        onNewConversation={vi.fn()}
        onCollapse={vi.fn()}
        collapseControlLifted
        activeConversationId="one"
        conversations={[{ id: 'one', projectId: 'p1', title: 'First', createdAt: 1, updatedAt: 1 }]}
      />
    </I18nProvider>,
  );
}

describe('chat card has no project header row on the project page', () => {
  it('renders no `.chat-project-header` once the history control is portalled to the dock', () => {
    const dock = document.createElement('div');
    document.body.appendChild(dock);
    try {
      const view = renderPane({ historyPortalTarget: dock });
      expect(view.container.querySelector('.chat-project-header')).toBeNull();
      expect(view.container.querySelector('.chat-project-header-title')).toBeNull();
      // The history control still works from the dock.
      expect(within(dock).getByTestId('conversation-history-trigger')).toBeTruthy();
    } finally {
      dock.remove();
    }
  });

  it('keeps a title-less control row only for hosts with no dock to portal into', () => {
    const view = renderPane({ historyPortalTarget: null });
    const row = view.container.querySelector('.chat-project-header');
    expect(row).not.toBeNull();
    expect(row?.querySelector('.chat-project-header-title')).toBeNull();
    expect(screen.getByTestId('conversation-history-trigger')).toBeTruthy();
  });
});

describe('pending-creation card matches the real chat card', () => {
  it('shows the prompt without a project-name header row', () => {
    const view = render(
      <I18nProvider initial="en">
        <ProjectCreationPendingView
          projectName="Coffee shop landing page"
          prompt="Make a landing page for a coffee shop"
          files={[]}
          agentId="claude"
        />
      </I18nProvider>,
    );
    expect(view.container.querySelector('.chat-project-header')).toBeNull();
    expect(screen.queryByTestId('pending-project-title')).toBeNull();
    expect(screen.getByText('Make a landing page for a coffee shop')).toBeTruthy();
  });
});
