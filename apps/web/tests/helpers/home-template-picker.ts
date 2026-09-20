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
  const option = screen.getByTestId('home-hero-template-menu').querySelector(`[data-chip="${id}"]`);
  expect(option, `creation type ${id} is available in the dropdown`).not.toBeNull();
  fireEvent.click(option!);
}
