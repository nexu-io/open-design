import { act } from 'react';
import { fireEvent, screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { HOME_APPLY_TEMPLATE_EVENT } from '../../src/components/home-hero/chips';

export function homeTemplateTrigger(): HTMLButtonElement {
  const selected = screen.queryByTestId('home-hero-template-trigger');
  return selected?.querySelector('button')
    ?? screen.getByTestId('home-hero-type-pills-more') as HTMLButtonElement;
}

export async function pickHomeTemplate(id: string): Promise<void> {
  await waitFor(() => expect(
    screen.queryByTestId('home-hero-type-pills') ?? screen.queryByTestId('home-hero-template-trigger'),
  ).not.toBeNull());
  const trigger = screen.queryByTestId('home-hero-type-pills')
    ? screen.getByTestId('home-hero-type-pills-more') as HTMLButtonElement
    : homeTemplateTrigger();
  await waitFor(() => expect(trigger.disabled).toBe(false));
  if (id === 'mobile' || id === 'wireframe') {
    await act(async () => {
      window.dispatchEvent(new CustomEvent(HOME_APPLY_TEMPLATE_EVENT, { detail: { chipId: id } }));
    });
    return;
  }
  const clear = screen.queryByTestId('home-hero-template-clear');
  if (clear) {
    fireEvent.click(clear);
    await waitFor(() => expect(screen.queryByTestId('home-hero-template-clear')).toBeNull());
  }
  if (screen.queryByTestId('home-hero-type-pills')) {
    const inline = screen.queryByTestId(`home-hero-type-pill-${id}`);
    const entry = inline ?? screen.getByTestId('home-hero-type-pills-more');
    await waitFor(() => expect((entry as HTMLButtonElement).disabled).toBe(false));
    fireEvent.click(entry);
    if (!inline) fireEvent.click(await screen.findByTestId(`home-hero-type-pill-${id}-more`));
    return;
  }
  await waitFor(() => expect(homeTemplateTrigger().disabled).toBe(false));
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
