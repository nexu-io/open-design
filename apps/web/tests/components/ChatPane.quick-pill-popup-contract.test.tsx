// @vitest-environment jsdom

// The composer keeps Plugins and Design Toolbox discoverable inside the "+"
// menu. They must not regress into persistent quick pills above the input.

if (typeof HTMLElement.prototype.scrollTo !== 'function') {
  HTMLElement.prototype.scrollTo = function () {};
}

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { ChatPane } from '../../src/components/ChatPane';

afterEach(() => {
  cleanup();
});

describe('composer resource discovery', () => {
  it('keeps Plugins and Design Toolbox in the plus menu without persistent quick pills', () => {
    render(
      <ChatPane
        messages={[]}
        streaming={false}
        error={null}
        projectId="project-1"
        projectFiles={[]}
        onEnsureProject={async () => 'project-1'}
        onSend={() => {}}
        onStop={() => {}}
        conversations={[]}
        activeConversationId={null}
        onSelectConversation={() => {}}
        onDeleteConversation={() => {}}
      />,
    );

    expect(screen.queryByTestId('composer-quick-pills')).toBeNull();

    fireEvent.click(screen.getByTestId('chat-plus-trigger'));

    expect(screen.getByTestId('composer-plus-plugins')).toBeTruthy();
    expect(screen.getByRole('menuitem', { name: /Design Toolbox|设计百宝箱/i })).toBeTruthy();
  });
});
