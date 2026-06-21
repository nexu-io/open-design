// New-user reveal wrapper for the Home "Community" templates.
//
// When the user has no projects yet, the entry view keeps attention on the
// hero composer: the templates gallery is collapsed and a quiet hint pinned
// to the very bottom of the viewport reads "scroll up to explore more
// templates". An upward scroll gesture (two fingers pushing up, i.e. content
// scrolling up) OR clicking the hint smoothly expands the gallery into place.
// A collapse control lets the user fold it away again.
//
// When the user already has projects, this wrapper is a no-op pass-through —
// HomeView renders the gallery directly.

import { Button } from '@open-design/components';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from './Icon';
import { useT } from '../i18n';

interface Props {
  /** Collapse + hint behavior is only engaged for brand-new users. */
  enabled: boolean;
  children: ReactNode;
}

export function HomeTemplatesReveal({ enabled, children }: Props) {
  const t = useT();
  const [revealed, setRevealed] = useState(false);

  // Reveal on an upward scroll gesture while still collapsed. "Scroll up"
  // means pushing two fingers up so the content scrolls upward and the lower
  // templates come into view — that's a positive wheel deltaY. We listen on
  // the window so the gesture is caught anywhere on the entry view, not just
  // over the (tiny, collapsed) wrapper.
  useEffect(() => {
    if (!enabled || revealed) return;
    const onWheel = (event: WheelEvent) => {
      if (event.deltaY > 0) setRevealed(true);
    };
    window.addEventListener('wheel', onWheel, { passive: true });
    return () => window.removeEventListener('wheel', onWheel);
  }, [enabled, revealed]);

  // Reset back to collapsed if the user transitions back to a no-project
  // state (e.g. after deleting their last project) within the session.
  useEffect(() => {
    if (!enabled) setRevealed(false);
  }, [enabled]);

  // While collapsed the gallery is only height-clipped + aria-hidden, but its
  // buttons, tabs, and search input stay mounted and focusable. Mark the body
  // `inert` until revealed so a keyboard user can't Tab into the invisible
  // Community-template controls before reaching the visible bottom hint.
  const bodyRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    const node = bodyRef.current;
    if (!node) return;
    if (revealed) {
      node.removeAttribute('inert');
    } else {
      node.setAttribute('inert', '');
    }
    // `enabled` is in the deps because the body only mounts once the wrapper is
    // engaged (projects load async); without it the effect wouldn't re-run to
    // set `inert` on the freshly-mounted body while `revealed` stays false.
  }, [revealed, enabled]);

  if (!enabled) {
    return <>{children}</>;
  }

  return (
    <div className={`home-templates-reveal${revealed ? ' is-revealed' : ''}`}>
      <div
        ref={bodyRef}
        className="home-templates-reveal__body"
        aria-hidden={!revealed}
      >
        <div className="home-templates-reveal__inner">{children}</div>
      </div>

      {revealed ? (
        <Button
          variant="subtle"
          className="home-templates-reveal__collapse"
          onClick={() => setRevealed(false)}
        >
          <Icon name="chevron-down" size={16} />
          <span>{t('homeHero.templatesCollapse')}</span>
        </Button>
      ) : (
        <Button
          variant="ghost"
          className="home-templates-reveal__hint"
          onClick={() => setRevealed(true)}
          data-testid="home-templates-hint"
        >
          <Icon
            name="arrow-up"
            size={15}
            className="home-templates-reveal__hint-arrow"
          />
          <span>{t('homeHero.templatesScrollHint')}</span>
        </Button>
      )}
    </div>
  );
}
