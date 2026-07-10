// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { MessageCenterDemo } from '../../src/components/MessageCenterDemo';
import { I18nProvider } from '../../src/i18n';

function renderMessageCenter() {
  const onOpenNotificationSettings = vi.fn();
  const result = render(
    <I18nProvider initial="en">
      <MessageCenterDemo onOpenNotificationSettings={onOpenNotificationSettings} />
    </I18nProvider>,
  );
  return { ...result, onOpenNotificationSettings };
}

function openCenter() {
  fireEvent.click(screen.getByTestId('message-center-trigger'));
  return screen.getByTestId('message-center-dialog');
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('MessageCenterDemo', () => {
  it('shows the unread badge on the bell trigger', () => {
    renderMessageCenter();

    const trigger = screen.getByLabelText(/Open message center \(3 unread\)/);
    expect(trigger.textContent).toContain('3');
  });

  it('shows the unread count on the unread filter while unread messages remain', () => {
    renderMessageCenter();
    const dialog = openCenter();
    const unreadFilter = within(dialog).getByRole('button', { name: 'Unread' });

    expect(unreadFilter.textContent).toContain('3');

    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.13\.0 is available/ }));
    expect(unreadFilter.textContent).toContain('2');

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));
    expect(unreadFilter.textContent).toBe('Unread');
  });

  it('opens as a dialog and closes with Escape while restoring trigger focus', () => {
    renderMessageCenter();
    const trigger = screen.getByTestId('message-center-trigger');

    fireEvent.click(trigger);
    expect(screen.getByRole('dialog', { name: 'Message center' })).toBeTruthy();

    fireEvent.keyDown(document, { key: 'Escape' });

    expect(screen.queryByTestId('message-center-dialog')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('closes when the page outside the drawer is clicked', () => {
    renderMessageCenter();
    openCenter();

    fireEvent.mouseDown(screen.getByTestId('message-center-backdrop'));

    expect(screen.queryByTestId('message-center-dialog')).toBeNull();
  });

  it('marks a message read when the message is opened', () => {
    renderMessageCenter();
    openCenter();

    fireEvent.click(screen.getByRole('button', { name: /Open Design 0\.13\.0 is available/ }));

    const message = screen.getByText('Open Design 0.13.0 is available').closest('article');
    expect(message).not.toBeNull();
    expect(screen.queryByTestId('message-center-detail')).toBeNull();
    expect(within(message as HTMLElement).getByText(/The new version reduces the wait/)).toBeTruthy();
    expect(screen.getByLabelText(/Open message center \(2 unread\)/)).toBeTruthy();
  });

  it('filters unread messages and supports marking everything read', () => {
    renderMessageCenter();
    openCenter();

    fireEvent.click(screen.getByRole('button', { name: 'Unread' }));
    expect(screen.getByText('Open Design 0.13.0 is available')).toBeTruthy();
    expect(screen.queryByText('Limited design credits added')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Mark all read' }));

    expect(screen.getByText('All caught up')).toBeTruthy();
    expect(screen.queryByLabelText(/unread/)).toBeNull();
  });

  it('filters read messages', () => {
    renderMessageCenter();
    openCenter();

    fireEvent.click(screen.getByRole('button', { name: 'Read' }));

    expect(screen.getByText('Limited design credits added')).toBeTruthy();
    expect(screen.getByText('6 publish-ready templates added')).toBeTruthy();
    expect(screen.queryByText('Open Design 0.13.0 is available')).toBeNull();
  });

  it('does not render per-message read or unread actions', () => {
    renderMessageCenter();
    const dialog = openCenter();
    const message = within(dialog)
      .getByText('Workspace for Teams preview')
      .closest('article');
    expect(message).not.toBeNull();

    expect(screen.queryByRole('button', { name: 'Archived' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Archive' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark read' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Mark unread' })).toBeNull();
  });

  it('opens existing desktop notification settings from the drawer footer', () => {
    const { onOpenNotificationSettings } = renderMessageCenter();
    openCenter();

    fireEvent.click(screen.getByRole('button', { name: 'Desktop notification settings' }));

    expect(onOpenNotificationSettings).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('message-center-dialog')).toBeNull();
  });
});
