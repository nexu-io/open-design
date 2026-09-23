import { act } from 'react';
import { screen, waitFor } from '@testing-library/react';
import { expect } from 'vitest';
import { HOME_APPLY_TEMPLATE_EVENT } from '../../src/components/home-hero/chips';

export function homeTemplateTrigger(): HTMLButtonElement {
  return screen.getByTestId('home-hero-template-trigger').querySelector('button')!;
}

export async function pickHomeTemplate(id: string): Promise<void> {
  await screen.findByTestId('home-hero-template-trigger');
  await waitFor(() => expect(homeTemplateTrigger().disabled).toBe(false));
  // These tests exercise the HomeView result of a pick. TemplatePicker owns
  // its menu interaction coverage, so drive the same host event directly.
  await act(async () => {
    window.dispatchEvent(new CustomEvent(HOME_APPLY_TEMPLATE_EVENT, { detail: { chipId: id } }));
  });
}
