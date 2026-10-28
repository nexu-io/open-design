// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { HeroPostcard } from '../../../src/components/home-hero/HeroPostcard';

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('HeroPostcard', () => {
  it('randomly changes to a different supplied portrait and restores the choice', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0);
    const { unmount } = render(<HeroPostcard />);
    const button = screen.getByTestId('home-hero-postcard');
    const before = button.querySelector('img')!.getAttribute('src');
    fireEvent.click(button);
    const after = button.querySelector('img')!.getAttribute('src');
    expect(after).not.toBe(before);
    expect(after).toMatch(/^\/home-hero\/postcards\/portrait-\d{2}\.jpg$/);
    expect(localStorage.getItem('od.homeHero.postcardPreset')).toBe(after);
    unmount();
    render(<HeroPostcard />);
    expect(screen.getByTestId('home-hero-postcard').querySelector('img')!.getAttribute('src')).toBe(after);
  });

  it('ignores stale selections and still swaps when storage is blocked', () => {
    localStorage.setItem('od.homeHero.postcardPreset', '/old-image.jpg');
    render(<HeroPostcard />);
    const button = screen.getByTestId('home-hero-postcard');
    const before = button.querySelector('img')!.getAttribute('src');
    expect(before).toContain('/home-hero/postcards/');
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('blocked'); });
    fireEvent.click(button);
    expect(button.querySelector('img')!.getAttribute('src')).not.toBe(before);
  });
});
