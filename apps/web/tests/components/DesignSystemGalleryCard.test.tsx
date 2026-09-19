// @vitest-environment jsdom

import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DesignSystemSummary } from '@open-design/contracts';
import type { ComponentProps } from 'react';
import { workspaceContextFixture } from '../helpers/workspace-context';
import { DesignSystemGalleryCard } from '../../src/components/DesignSystemGalleryCard';

const registryMocks = vi.hoisted(() => ({ fetchProjectFileText: vi.fn() }));

vi.mock('../../src/providers/registry', async () => {
  const actual = await vi.importActual<typeof import('../../src/providers/registry')>(
    '../../src/providers/registry',
  );
  return { ...actual, fetchProjectFileText: registryMocks.fetchProjectFileText };
});

const system: DesignSystemSummary = {
  id: 'linear',
  title: 'Linear',
  category: 'Productivity & SaaS',
  summary: 'Quiet issue-tracker system.',
  surface: 'web',
  source: 'built-in',
  swatches: ['#111111', '#eeeeee'],
};

let observers: Array<{ notify: (visible: boolean) => void; disconnect: ReturnType<typeof vi.fn> }>;

beforeEach(() => {
  registryMocks.fetchProjectFileText.mockReset();
  registryMocks.fetchProjectFileText.mockResolvedValue(null);
  observers = [];
  vi.stubGlobal('IntersectionObserver', class {
    observe = vi.fn();
    disconnect = vi.fn();
    constructor(callback: IntersectionObserverCallback) {
      observers.push({
        notify: (visible) => callback(
          [{ isIntersecting: visible } as IntersectionObserverEntry],
          this as unknown as IntersectionObserver,
        ),
        disconnect: this.disconnect,
      });
    }
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function observer(index: number) {
  const observed = observers[index];
  if (!observed) throw new Error(`Expected intersection observer ${index} to be registered`);
  return observed;
}

function card(
  enabled: boolean,
  onSelect = vi.fn(),
  onMakeDefault = vi.fn(),
  overrides: Partial<ComponentProps<typeof DesignSystemGalleryCard>> = {},
) {
  return <DesignSystemGalleryCard system={system} resourceReadIdentity={null}
    enabled={enabled} isDefault={false} subtitle={system.summary} statusLabel="Published"
    busy={false} onSelect={onSelect} onMakeDefault={onMakeDefault} {...overrides} />;
}

describe('DesignSystemGalleryCard', () => {
  it('shows the official brand icon only when visible, falling back to its palette if unavailable', () => {
    render(card(true, vi.fn(), vi.fn(), { system: { ...system, id: 'airbnb', title: 'Airbnb' } }));
    const logo = screen.getByTestId('design-system-logo-airbnb');
    expect(logo.querySelector('img')).toBeNull();

    act(() => observer(0).notify(true));
    const image = logo.querySelector('img')!;
    expect(image).toHaveAttribute('src', 'https://www.google.com/s2/favicons?domain=airbnb.com&sz=64');
    expect(image).toHaveAttribute('alt', '');
    expect(registryMocks.fetchProjectFileText).not.toHaveBeenCalled();

    fireEvent.error(image);
    expect(logo.querySelector('img')).toBeNull();
    expect(logo.children).toHaveLength(2);
    expect(logo.children[0]).toHaveStyle({ backgroundColor: '#111111' });
  });

  it('loads a user system project logo with its workspace identity before trying the source favicon', async () => {
    registryMocks.fetchProjectFileText.mockResolvedValue(JSON.stringify({ logo: { primary: 'assets/brand.svg' } }));
    const context = workspaceContextFixture({ workspaceId: 'team one', workspaceMemberId: 'member/one' });
    render(card(true, vi.fn(), vi.fn(), {
      system: { ...system, id: 'user:acme', source: 'user', projectId: 'acme-project',
        provenance: { sourceUrls: ['https://acme.example/design'] } },
      resourceReadIdentity: { context, generation: 'witness-1' },
    }));
    const logo = screen.getByTestId('design-system-logo-user:acme');
    expect(registryMocks.fetchProjectFileText).not.toHaveBeenCalled();
    act(() => observer(0).notify(true));
    await waitFor(() => expect(logo.querySelector('img')).not.toBeNull());

    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledWith('acme-project', 'brand.json', {
      cache: 'no-store', workspaceContext: context,
    });
    const image = logo.querySelector('img')!;
    const url = new URL(image.getAttribute('src')!, 'http://localhost');
    expect(url.pathname).toContain('acme-project');
    expect(url.pathname).toContain('brand.svg');
    expect(url.searchParams.get('workspaceId')).toBe('team one');
    expect(url.searchParams.get('workspaceMemberId')).toBe('member/one');

    fireEvent.error(image);
    expect(logo.querySelector('img')).toHaveAttribute('src', 'https://www.google.com/s2/favicons?domain=acme.example&sz=64');
    fireEvent.error(logo.querySelector('img')!);
    expect(logo.querySelector('img')).toBeNull();
    expect(logo.children).toHaveLength(2);
  });

  it('keeps the palette for a theme without a brand icon and on failed project asset reads', async () => {
    registryMocks.fetchProjectFileText.mockRejectedValue(new Error('Unavailable'));
    render(card(true, vi.fn(), vi.fn(), {
      system: { ...system, id: 'user:theme', title: 'Custom theme', source: 'user', projectId: 'theme-project' },
    }));
    act(() => observer(0).notify(true));
    await act(async () => { await Promise.resolve(); });
    const logo = screen.getByTestId('design-system-logo-user:theme');
    expect(registryMocks.fetchProjectFileText).toHaveBeenCalledOnce();
    expect(logo.querySelector('img')).toBeNull();
    expect(logo.children).toHaveLength(2);
  });

  it('loads a real showcase only while its card is visible in the active gallery', () => {
    const view = render(card(true));
    expect(screen.queryByTitle('Linear preview')).toBeNull();

    act(() => observer(0).notify(true));
    expect(screen.getByTitle('Linear preview')).toHaveAttribute('src', '/api/design-systems/linear/showcase');
    expect(screen.getByTitle('Linear preview')).toHaveAttribute('sandbox', 'allow-scripts');

    act(() => observer(0).notify(false));
    expect(screen.queryByTitle('Linear preview')).toBeNull();

    act(() => observer(0).notify(true));
    view.rerender(card(false));
    expect(screen.queryByTitle('Linear preview')).toBeNull();
    expect(observer(0).disconnect).toHaveBeenCalledOnce();

    view.rerender(card(true));
    expect(screen.queryByTitle('Linear preview')).toBeNull();
    act(() => observer(1).notify(true));
    expect(screen.getByTitle('Linear preview')).toBeTruthy();
  });

  it('scopes showcase URLs and replaces the document on a refreshed authorization witness', () => {
    const context = workspaceContextFixture({ workspaceId: 'team one', workspaceMemberId: 'member/one' });
    const identity = { context, generation: 'witness-1' };
    const view = render(card(true, vi.fn(), vi.fn(), { resourceReadIdentity: identity }));
    act(() => observer(0).notify(true));
    const firstDocument = screen.getByTitle('Linear preview');
    const url = new URL(firstDocument.getAttribute('src')!, 'http://localhost');
    expect(url.pathname).toBe('/api/design-systems/linear/showcase');
    expect(url.searchParams.get('workspaceId')).toBe('team one');
    expect(url.searchParams.get('workspaceMemberId')).toBe('member/one');

    view.rerender(card(true, vi.fn(), vi.fn(), {
      resourceReadIdentity: { context, generation: 'witness-2' },
    }));
    const refreshedDocument = screen.getByTitle('Linear preview');
    expect(refreshedDocument).not.toBe(firstDocument);
    expect(refreshedDocument.getAttribute('src')).toBe(firstDocument.getAttribute('src'));
  });

  it.each([
    { label: 'draft user system', source: 'user' as const, status: 'draft' as const, isDefault: false, canChoose: false },
    { label: 'published user system', source: 'user' as const, status: 'published' as const, isDefault: false, canChoose: true },
    { label: 'already-default preset', source: 'built-in' as const, status: 'published' as const, isDefault: true, canChoose: false },
    { label: 'other preset', source: 'built-in' as const, status: 'published' as const, isDefault: false, canChoose: true },
  ])('allows choosing the default only for eligible systems: $label', ({ source, status, isDefault, canChoose }) => {
    const onMakeDefault = vi.fn();
    render(card(true, vi.fn(), onMakeDefault, { system: { ...system, source, status }, isDefault }));
    fireEvent.click(screen.getByRole('button', { name: 'More actions · Linear' }));
    const action = screen.queryByRole('menuitem', { name: 'Default for new chats' });
    if (canChoose) {
      expect(action).toBeTruthy();
      fireEvent.click(action!);
      expect(onMakeDefault).toHaveBeenCalledOnce();
    } else {
      expect(action).toBeNull();
      expect(onMakeDefault).not.toHaveBeenCalled();
    }
  });

  it('closes its portal menu when leaving the gallery without changing the saved default', () => {
    const onSelect = vi.fn();
    const onMakeDefault = vi.fn();
    const view = render(card(true, onSelect, onMakeDefault));
    const trigger = screen.getByRole('button', { name: 'More actions · Linear' });
    fireEvent.click(trigger);
    expect(screen.getByRole('menu')).toBeTruthy();
    expect(onMakeDefault).not.toHaveBeenCalled();

    fireEvent.keyDown(screen.getByRole('menu'), { key: 'Escape' });
    expect(screen.queryByRole('menu')).toBeNull();
    expect(trigger).toHaveFocus();

    fireEvent.click(trigger);
    view.rerender(card(false, onSelect, onMakeDefault));
    expect(screen.queryByRole('menu')).toBeNull();
    expect(onSelect).not.toHaveBeenCalled();
    expect(onMakeDefault).not.toHaveBeenCalled();
  });
});
