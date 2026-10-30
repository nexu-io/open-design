// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationStartHero } from '../../../src/components/chat/ConversationStartHero';
import { findChip } from '../../../src/components/home-hero/chips';
import { I18nProvider } from '../../../src/i18n';

vi.mock('../../../src/state/projects', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/state/projects')>()),
  listPlugins: vi.fn(async () => []),
}));
// The gallery itself is Community's; this suite only asserts the hero hands it
// the picked type the way Home does.
vi.mock('../../../src/components/CommunityView', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../../src/components/CommunityView')>()),
  CommunityView: ({ selectedType }: { selectedType?: string }) => (
    <div data-testid="community-gallery" data-type={selectedType} />
  ),
}));

afterEach(cleanup);

function renderHero(activeChipId: string | null, onUsePlugin = vi.fn()) {
  const view = render(
    <I18nProvider initial="en">
      <ConversationStartHero activeChipId={activeChipId} onUsePlugin={onUsePlugin} />
    </I18nProvider>,
  );
  return { ...view, onUsePlugin };
}

// Home's pick semantics (per product: 所有的状态都使用首页的状态，点击后也是):
// a type card binds the type's plugin without touching the draft.
it("picks a type the way Home does: binds its plugin, leaves the draft alone", () => {
  const { onUsePlugin } = renderHero(null);
  expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  expect(screen.getByTestId('home-hero-postcard')).toBeTruthy();
  fireEvent.click(screen.getByTestId('home-hero-type-card-deck'));
  const deck = findChip('deck')!;
  expect(deck.action.kind).toBe('apply-scenario');
  expect(onUsePlugin).toHaveBeenCalledWith({
    pluginId: deck.action.kind === 'apply-scenario' ? deck.action.pluginId : '',
    chipId: 'deck',
    draft: null,
    label: expect.stringMatching(/slide/i),
  });
});

// With a type picked: the headline names it, the cards and postcard give way,
// and the type's gallery takes their place — Home's picked state.
it("shows Home's picked state once a type is active", () => {
  renderHero('deck');
  expect(screen.queryByTestId('home-hero-type-cards')).toBeNull();
  expect(screen.queryByTestId('home-hero-postcard')).toBeNull();
  expect(screen.getByRole('heading', { level: 1 }).getAttribute('aria-label')).toMatch(/slide/i);
  expect(screen.getByTestId('community-gallery').dataset.type).toBe('Slides');
});
