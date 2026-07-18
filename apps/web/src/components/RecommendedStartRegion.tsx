import { useEffect, useRef, useState } from 'react';
import { useT } from '../i18n';
import { useAnalytics } from '../analytics/provider';
import {
  trackHomeRecommendationClick,
  trackHomeRecommendationSurfaceView,
} from '../analytics/events';
import type { TrackingOnboardingProductType } from '@open-design/contracts/analytics';
import type { ProjectMetadata } from '../types';
import {
  nextStarter,
  type ProductType,
  type Recommendation,
} from '../onboarding/recommendation';
import type { OnboardingEntry } from '../onboarding/onboarding-entry';
import { starterCopyFor } from '../onboarding/starter-copy';
import { Icon } from './Icon';
import styles from './RecommendedStartRegion.module.css';

// Product bucket → the project kind used at creation. Concrete paths seed a web
// prototype pipeline; the general fallback uses `other`, which routes through
// the default agent that asks the user to pin down the task (spec §6.3
// "完整菜单 + 通用起点").
const PRODUCT_KIND: Record<ProductType, ProjectMetadata['kind']> = {
  product_ui: 'prototype',
  marketing: 'prototype',
  internal_tool: 'prototype',
  general: 'other',
};

interface Props {
  recommendation: Recommendation;
  // Open Studio with the recommended first request pre-filled (not auto-sent).
  // The onboarding entry rides along so the create success path can stash it
  // keyed by the created project id — the funnel context is only handed off
  // after (and for) the project that actually gets created, so a concurrent
  // navigation can never steal it.
  onStart: (input: {
    name: string;
    prompt: string;
    metadata: ProjectMetadata;
    onboardingEntry: OnboardingEntry;
  }) => boolean | void | Promise<boolean | void>;
  // Abandon the recommendation for the generic entry ("浏览全部类型").
  onDismiss: () => void;
}

// Derive a short project name from the first request, mirroring the Home
// composer submit path (`handlePluginLoopSubmit`). Falls back to the localized
// default when the prompt has no usable head.
function projectNameFromPrompt(prompt: string, fallback: string): string {
  const head = prompt.trim().split(/\s+/).slice(0, 8).join(' ');
  return head.length > 0 ? head : fallback;
}

export function RecommendedStartRegion({ recommendation, onStart, onDismiss }: Props) {
  const t = useT();
  const analytics = useAnalytics();

  // Currently surfaced starter within this path. Seeded from the primary and
  // resynced if the recommendation itself changes (e.g. a fresh session).
  const [currentId, setCurrentId] = useState(recommendation.primary.id);
  useEffect(() => {
    setCurrentId(recommendation.primary.id);
  }, [recommendation.primary.id]);

  const current =
    recommendation.options.find((option) => option.id === currentId) ?? recommendation.primary;
  const productType = recommendation.productType as TrackingOnboardingProductType;
  const canChange = recommendation.options.length > 1;

  // Fire the impression once per exposure so the funnel can divide the three
  // actions by how often the card was actually seen.
  const shownRef = useRef(false);
  useEffect(() => {
    if (shownRef.current) return;
    shownRef.current = true;
    trackHomeRecommendationSurfaceView(analytics.track, {
      page_name: 'home',
      area: 'onboarding_recommendation',
      product_type: productType,
      recommendation_id: recommendation.primary.id,
      ...(recommendation.role ? { role: recommendation.role } : {}),
      ...(recommendation.useCases.length > 0 ? { use_cases: recommendation.useCases } : {}),
    });
  }, [analytics.track, productType, recommendation.primary.id, recommendation.role, recommendation.useCases]);

  const copy = starterCopyFor(current.id);
  const firstPrompt = t(copy.firstPrompt);

  function fireClick(element: 'enter_studio' | 'change' | 'browse_all', recommendationId: string) {
    trackHomeRecommendationClick(analytics.track, {
      page_name: 'home',
      area: 'onboarding_recommendation',
      element,
      product_type: productType,
      recommendation_id: recommendationId,
      ...(recommendation.role ? { role: recommendation.role } : {}),
      ...(recommendation.useCases.length > 0 ? { use_cases: recommendation.useCases } : {}),
    });
  }

  // Pending state for the create round-trip. The CTA disables while a start is
  // in flight and re-enables on failure so the user can retry (a successful
  // start unmounts this region because the parent dismisses the recommendation).
  const [pending, setPending] = useState(false);

  async function handleEnter() {
    if (pending) return;
    fireClick('enter_studio', current.id);
    // Hand the entry context to the create pipeline (session-only) so the
    // first-prompt / first-generation funnel events can attribute back to this
    // recommendation without persisting anything. The create success path
    // stashes it keyed by the created project id; nothing is written to
    // sessionStorage here, so a failed/aborted create leaves no stale slot and
    // a concurrent unrelated project mount cannot mis-attribute itself.
    const onboardingEntry: OnboardingEntry = {
      source: 'home_recommendation',
      productType: current.productType,
      recommendationId: current.id,
      ...(recommendation.role ? { role: recommendation.role } : {}),
      ...(recommendation.useCases.length > 0 ? { useCases: recommendation.useCases } : {}),
    };
    setPending(true);
    // `onStart` surfaces its own visible error (Home error channel) and never
    // rejects; it resolves `false` when the start failed. Only drop the pending
    // state on failure — on success the parent unmounts this region.
    const started =
      (await onStart({
        name: projectNameFromPrompt(firstPrompt, t('home.recommendation.defaultProjectName')),
        prompt: firstPrompt,
        metadata: { kind: PRODUCT_KIND[current.productType], nameSource: 'prompt' },
        onboardingEntry,
      })) !== false;
    if (!started) setPending(false);
  }

  function handleChange() {
    const next = nextStarter(recommendation.options, current.id);
    fireClick('change', next.id);
    setCurrentId(next.id);
  }

  function handleBrowseAll() {
    fireClick('browse_all', current.id);
    onDismiss();
  }

  return (
    // Delayed accordion reveal (repo's canonical grid-rows expand): the slot
    // opens from 0fr and pushes the template section down — displacement is
    // the attention cue, no glint needed for an optional entry.
    <div className={styles.reveal}>
      <div className={styles.revealInner}>
    <section
      className={styles.root}
      data-testid="home-recommendation"
      aria-label={t('home.recommendation.eyebrow')}
    >
      <span className={styles.icon} aria-hidden>
        <Icon name="sparkles" size={18} />
      </span>
      <span className={styles.body}>
        <span className={styles.title}>{t(copy.title)}</span>
        <span className={styles.desc}>{t(copy.desc)}</span>
      </span>
      {canChange ? (
        <button
          type="button"
          className={styles.change}
          onClick={handleChange}
          data-testid="home-recommendation-change"
          title={t('home.recommendation.change')}
          aria-label={t('home.recommendation.change')}
        >
          <Icon name="refresh" size={15} />
        </button>
      ) : null}
      <button
        type="button"
        className={styles.tertiary}
        onClick={handleBrowseAll}
        data-testid="home-recommendation-browse-all"
      >
        {t('home.recommendation.browseAll')}
      </button>
      <button
        type="button"
        className={styles.primary}
        onClick={() => void handleEnter()}
        data-testid="home-recommendation-start"
        disabled={pending}
        aria-busy={pending}
      >
        {t('home.recommendation.primaryCta')}
        <Icon name="chevron-right" size={14} />
      </button>
    </section>
      </div>
    </div>
  );
}
