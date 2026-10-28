// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { ConversationStartHero } from '../../../src/components/chat/ConversationStartHero';
import { homeHeroChipPromptExamplesForLocale } from '../../../src/components/HomeHero';
import { I18nProvider } from '../../../src/i18n';

afterEach(cleanup);

it("shows Home's opening and fills the conversation composer with the picked type's example", () => {
  const onPickPrompt = vi.fn();
  render(<I18nProvider initial="en"><ConversationStartHero onPickPrompt={onPickPrompt} /></I18nProvider>);
  expect(screen.getByRole('heading', { level: 1 })).toBeTruthy();
  fireEvent.click(screen.getByTestId('home-hero-type-card-deck'));
  expect(onPickPrompt).toHaveBeenCalledWith(homeHeroChipPromptExamplesForLocale('deck', 'en')[0]);
});
