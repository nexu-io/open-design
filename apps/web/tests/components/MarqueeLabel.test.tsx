// @vitest-environment jsdom
//
// OPEND-3112: the workspace name at the top of the rail truncates behind an
// ellipsis and never reveals its tail. `MarqueeLabel` slides the overflow into
// view while the row is hovered; CSS owns WHEN (`:hover > .od-marquee`), the
// component owns HOW FAR — the gap between the untruncated string and its slot,
// which no stylesheet can know. jsdom has no layout, so the two box widths are
// stubbed per element here.

import { act, cleanup, render, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { MarqueeLabel } from '../../src/components/MarqueeLabel';
import { I18nProvider, useI18n, type Locale } from '../../src/i18n';

type Widths = { slotClientWidth: number; textScrollWidth: number };

function stubWidths({ slotClientWidth, textScrollWidth }: Widths) {
  const clientWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'clientWidth');
  const scrollWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollWidth');
  Object.defineProperty(HTMLElement.prototype, 'clientWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('od-marquee') ? slotClientWidth : 0;
    },
  });
  Object.defineProperty(HTMLElement.prototype, 'scrollWidth', {
    configurable: true,
    get(this: HTMLElement) {
      return this.classList.contains('od-marquee__text') ? textScrollWidth : 0;
    },
  });
  return () => {
    if (clientWidth) Object.defineProperty(HTMLElement.prototype, 'clientWidth', clientWidth);
    if (scrollWidth) Object.defineProperty(HTMLElement.prototype, 'scrollWidth', scrollWidth);
  };
}

let restore: (() => void) | null = null;

afterEach(() => {
  cleanup();
  restore?.();
  restore = null;
});

describe('MarqueeLabel (OPEND-3112)', () => {
  it('wraps the text in a clipping slot that keeps the consumer class', () => {
    restore = stubWidths({ slotClientWidth: 100, textScrollWidth: 60 });
    const { container } = render(<MarqueeLabel className="entry-nav-rail__team-name" text="Ada's workspace" />);
    const slot = container.querySelector('.entry-nav-rail__team-name');
    expect(slot?.classList.contains('od-marquee')).toBe(true);
    expect(slot?.querySelector('.od-marquee__text')?.textContent).toBe("Ada's workspace");
  });

  it.each([
    { direction: 'ltr', shift: '-80px' },
    { direction: 'rtl', shift: '80px' },
  ])('reveals the hidden tail in a $direction row', ({ direction, shift }) => {
    restore = stubWidths({ slotClientWidth: 120, textScrollWidth: 200 });
    const { container } = render(
      <div dir={direction}>
        <MarqueeLabel text="Leon Wang's very long personal workspace" />
      </div>,
    );
    const slot = container.querySelector<HTMLElement>('.od-marquee');
    expect(slot?.dataset.marquee).toBe('on');
    // The row's layout direction, not the name's script, determines travel.
    expect(slot?.style.getPropertyValue('--marquee-shift')).toBe(shift);
    // ~26ms per px, floored at 650ms so a short overhang still reads as motion.
    expect(slot?.style.getPropertyValue('--marquee-duration')).toBe('2080ms');
  });

  it('floors the duration for a short overhang', () => {
    restore = stubWidths({ slotClientWidth: 120, textScrollWidth: 130 });
    const { container } = render(<MarqueeLabel text="Ada's workspaces" />);
    const slot = container.querySelector<HTMLElement>('.od-marquee');
    expect(slot?.dataset.marquee).toBe('on');
    expect(slot?.style.getPropertyValue('--marquee-duration')).toBe('650ms');
  });

  // The direction comes from <html dir>, which I18nProvider writes in a passive
  // effect — after this label's layout effect has already measured. Switching
  // English → Arabic changes neither the text nor either box, so nothing else
  // would prompt a re-measure and the name would keep sliding the LTR way.
  it.each([
    { name: 'mounts in Arabic', initial: 'ar' as const, switchTo: null },
    { name: 'switches English → Arabic', initial: 'en' as const, switchTo: 'ar' as const },
  ])('follows the document direction when the app $name', async ({ initial, switchTo }) => {
    restore = stubWidths({ slotClientWidth: 120, textScrollWidth: 200 });
    document.documentElement.setAttribute('dir', 'ltr');
    let setLocale: ((next: Locale) => void) | null = null;
    function LocaleHandle() {
      setLocale = useI18n().setLocale;
      return null;
    }
    const { container } = render(
      <I18nProvider initial={initial}>
        <LocaleHandle />
        <MarqueeLabel text="Leon Wang's very long personal workspace" />
      </I18nProvider>,
    );
    if (switchTo) act(() => setLocale?.(switchTo));
    expect(document.documentElement.getAttribute('dir')).toBe('rtl');
    const slot = container.querySelector<HTMLElement>('.od-marquee');
    await waitFor(() => expect(slot?.style.getPropertyValue('--marquee-shift')).toBe('80px'));
    document.documentElement.setAttribute('dir', 'ltr');
  });

  it('never moves a name that already fits', () => {
    restore = stubWidths({ slotClientWidth: 200, textScrollWidth: 120 });
    const { container } = render(<MarqueeLabel text="Ada" />);
    const slot = container.querySelector<HTMLElement>('.od-marquee');
    expect(slot?.dataset.marquee).toBeUndefined();
    expect(slot?.style.getPropertyValue('--marquee-shift')).toBe('');
  });
});
