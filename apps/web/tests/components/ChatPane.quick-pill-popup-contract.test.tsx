// @vitest-environment jsdom

// The composer keeps Plugins discoverable inside the "+" menu, next to the
// Connectors and MCP submenus, and must not regress into persistent quick
// pills above the input. The Design Toolbox is no longer a "+" row (OPEND-3085,
// per the Demo); it stays reachable through the next-step card's imperative
// `openDesignToolbox` handle only.

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
  it('keeps Plugins, Connectors, and MCP in the plus menu without persistent quick pills', () => {
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

    expect(screen.getByTestId('composer-plus-attach')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-reference-project')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-local-code')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-plugins')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-figma')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-connectors')).toBeTruthy();
    expect(screen.getByTestId('composer-plus-mcp')).toBeTruthy();
    // Removed per the Demo: the working-directory group and the toolbox row.
    expect(screen.queryByTestId('composer-plus-working-dir')).toBeNull();
    expect(screen.queryByRole('menuitem', { name: /Design Toolbox|设计百宝箱/i })).toBeNull();
  });
});
