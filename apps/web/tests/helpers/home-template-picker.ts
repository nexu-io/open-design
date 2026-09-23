import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { HOME_APPLY_TEMPLATE_EVENT } from '../../src/components/home-hero/chips';

export function homeTemplateTrigger(): HTMLButtonElement {
  return screen.getByTestId('home-hero-template-trigger').querySelector('button')!;
}

export async function pickHomeTemplate(id: string): Promise<void> {
  await screen.findByTestId('home-hero-template-trigger');
  await waitFor(() => expect(homeTemplateTrigger().disabled).toBe(false));
  if (id === 'mobile' || id === 'wireframe') {
    await act(async () => {
      window.dispatchEvent(new CustomEvent(HOME_APPLY_TEMPLATE_EVENT, { detail: { chipId: id } }));
    });
    return;
  }
  // Template hydration can replace the picker immediately after it first
  // becomes enabled. If that lands beside the click, the replacement's closed
  // state wins; retry only while no menu is mounted so an already-open picker
  // is never toggled closed again.
  await waitFor(() => {
    if (screen.queryByTestId('home-hero-template-menu')) return;
    fireEvent.click(homeTemplateTrigger());
    expect(screen.queryByTestId('home-hero-template-menu')).not.toBeNull();
  }, { timeout: 2_500 });
  const menu = screen.getByTestId('home-hero-template-menu');
  const option = menu.querySelector(`[data-chip="${id}"]`);
  expect(option, `creation type ${id} is available in the dropdown`).not.toBeNull();
  fireEvent.click(option!);
}
