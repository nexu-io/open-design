// @vitest-environment jsdom

// The composer keeps Design Toolbox discoverable inside the "+" menu, and it
// must not regress into a persistent quick pill above the input. Plugins are
// deliberately absent from this menu — that surface was removed.

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
  it('carries neither persistent quick pills nor a resource row in the plus menu', () => {
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

    expect(screen.queryByTestId('composer-plus-plugins')).toBeNull();
    // The Design Toolbox left the "+" menu with the resource submenus (#7635);
    // it opens through the composer handle (next-step actions) instead.
    expect(screen.queryByRole('menuitem', { name: /Design Toolbox|设计百宝箱/i })).toBeNull();
    expect(screen.getByRole('menuitem', { name: /Attach|附加/i })).toBeTruthy();
  });
});
