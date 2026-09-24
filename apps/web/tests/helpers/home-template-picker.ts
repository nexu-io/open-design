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
  fireEvent.click(homeTemplateTrigger());
  // The click schedules the menu; it is not in the DOM on the next statement.
  // A synchronous `getByTestId` here reads the tree before React has committed
  // the open state, so it passes only while the render happens to win that
  // tick. `findByTestId` waits for the commit the click asked for.
  const menu = await screen.findByTestId('home-hero-template-menu');
  const option = menu.querySelector(`[data-chip="${id}"]`);
  expect(option, `creation type ${id} is available in the dropdown`).not.toBeNull();
  fireEvent.click(option!);
}
