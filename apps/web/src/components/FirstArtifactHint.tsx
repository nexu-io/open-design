import { useEffect, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import {
  trackStudioOnboardingHintClick,
  trackStudioOnboardingHintSurfaceView,
} from '../analytics/events';
import {
  hasSeenFirstArtifactHint,
  markFirstArtifactHintSeen,
} from '../onboarding/first-artifact-hint';
import { Icon } from './Icon';
import styles from './FirstArtifactHint.module.css';

// One-time, one-line hint shown when a new user's first previewable artifact
// appears in Studio (spec §8.3). The once-ever budget is spent when the USER
// dismisses it — not on show — so parent-gate flicker (a transient files
// refresh or streaming blip unmounting and remounting this component) can't
// silently burn the hint before anyone reads it. Remounts before dismissal
// simply show it again, which matches the spec: visible until closed or used.
// Kept deliberately small and non-modal so it never stacks as a second guide
// against the post-turn NextStepActions card (spec §8.5: one main guide at a
// time) — it sits in the preview corner while NextStepActions lives in the
// chat.
export function FirstArtifactHint() {
  const t = useT();
  const analytics = useAnalytics();
  const reducedMotion = useReducedMotion();
  const [visible, setVisible] = useState(() => !hasSeenFirstArtifactHint());
  // Delayed mount replaces an opacity fade: the card appears fully opaque
  // (no see-through frame, per review) — the 600ms settle window is simply
  // "not rendered yet".
  const [settled, setSettled] = useState(false);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(true), 600);
    return () => window.clearTimeout(timer);
  }, []);
  // Anchor below the preview's action toolbar wherever it currently sits —
  // tab strips above it vary per layout, so a hardcoded offset can land ON
  // the toolbar and occlude its controls (caught by the Playwright critical
  // suite). Re-measured on resize; falls back to the chrome-height estimate
  // when no viewer toolbar is mounted.
  const rootRef = useRef<HTMLDivElement | null>(null);
  useEffect(() => {
    if (!settled) return;
    const measure = () => {
      const el = rootRef.current;
      if (!el) return;
      // Multiple viewers can be mounted (one per open tab); anchor below the
      // lowest visible toolbar so the card clears the active one. Written
      // straight to the element — a state update would re-render mid-flight
      // and restart (or freeze) the motion keyframes.
      let bottom = 0;
      for (const bar of document.querySelectorAll('.viewer-toolbar')) {
        const rect = bar.getBoundingClientRect();
        if (rect.width > 0 && rect.height > 0) bottom = Math.max(bottom, rect.bottom);
      }
      if (bottom > 0) el.style.top = `${Math.round(bottom + 10)}px`;
    };
    measure();
    // Tab strips / toolbars settle over the first seconds of a project load;
    // re-measure a few times instead of trusting the first layout pass.
    const timers = [400, 1200, 2600].map((ms) => window.setTimeout(measure, ms));
    window.addEventListener('resize', measure);
    return () => {
      timers.forEach((id) => window.clearTimeout(id));
      window.removeEventListener('resize', measure);
    };
  }, [settled]);
  const firedRef = useRef(false);

  useEffect(() => {
    // The card renders nothing until `settled` (the 600ms layout-settle
    // window). Emitting the impression before that would count a mount that
    // was unmounted during settle as a `surface_view` the user never saw,
    // inflating the hint's denominator. Gate on `settled` so the impression
    // fires only once the card is actually renderable.
    if (!visible || !settled || firedRef.current) return;
    firedRef.current = true;
    trackStudioOnboardingHintSurfaceView(analytics.track, {
      page_name: 'chat_panel',
      area: 'onboarding_first_artifact_hint',
      hint_type: 'view_artifact',
    });
  }, [visible, settled, analytics.track]);

  if (!visible || !settled) return null;

  function dismiss() {
    trackStudioOnboardingHintClick(analytics.track, {
      page_name: 'chat_panel',
      area: 'onboarding_first_artifact_hint',
      element: 'dismiss',
      hint_type: 'view_artifact',
    });
    // Spend the once-ever budget on the user's own close action.
    markFirstArtifactHintSeen();
    setVisible(false);
  }

  return (
    // Motion-driven entrance (the repo already ships `motion`), fully opaque
    // throughout: the card DROPS from the toolbar and settles (easeOut — set
    // down gently, same vertical axis as what follows), holds a beat, then
    // gives two equal 4px knocks with a pause between them (easeInOut).
    // Skipped entirely under prefers-reduced-motion.
    <motion.div
      ref={rootRef}
      className={styles.root}
      role="status"
      data-testid="first-artifact-hint"
      initial={reducedMotion ? false : { y: -28 }}
      animate={reducedMotion ? { y: 0 } : { y: [-28, 0, 0, -4, 0, 0, -4, 0] }}
      transition={
        reducedMotion
          ? { duration: 0 }
          : {
              duration: 2.4,
              times: [0, 0.19, 0.32, 0.44, 0.56, 0.64, 0.76, 0.88],
              ease: [
                'easeOut',
                'linear',
                'easeInOut',
                'easeInOut',
                'linear',
                'easeInOut',
                'easeInOut',
              ],
            }
      }
    >
      <span className={styles.icon} aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
      <div className={styles.body}>
        <span className={styles.title}>{t('studio.firstArtifactHint.title')}</span>
        <span className={styles.text}>{t('studio.firstArtifactHint.body')}</span>
      </div>
      <button
        type="button"
        className={styles.dismiss}
        onClick={dismiss}
        aria-label={t('studio.firstArtifactHint.dismiss')}
      >
        <Icon name="close" size={15} />
      </button>
    </motion.div>
  );
}
