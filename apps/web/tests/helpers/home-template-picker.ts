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
  // The first-visit default chip (原型) is seeded asynchronously once the
  // plugin catalog resolves; the resulting `activeChipId` change closes any
  // menu opened in the same window (TemplatePicker closes on active-chip
  // change). Retry open+pick instead of assuming the first click's menu
  // survives to the next line. A clean open+click is the success signal on
  // purpose — catalogs without the chip's scenario plugin legitimately never
  // bind, so a materialized binding must not be the termination condition.
  await waitFor(() => {
    fireEvent.click(homeTemplateTrigger());
    const option = screen.queryByTestId('home-hero-template-menu')?.querySelector(`[data-chip="${id}"]`);
    expect(option, `creation type ${id} is available in the dropdown`).not.toBeNull();
    fireEvent.click(option!);
  });
}
