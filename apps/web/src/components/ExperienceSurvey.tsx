// Experience survey (NPS). Armed by a successful export, rendered globally
// from App.tsx so it survives the project → home navigation, and retired
// permanently the moment the user answers or closes it.
//
// Two questions. The score is the metric and costs one tap; the follow-up asks
// what to fix first and can be skipped. Anything longer was cut deliberately —
// every extra question is paid for in completion rate on the score itself.
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AnimatePresence, motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { useT } from '../i18n';
import styles from './ExperienceSurvey.module.css';
import {
  SURVEY_DELAY_MS,
  isSurveyRetired,
  onExportSucceeded,
  retireSurvey,
} from './experience-survey-trigger';

/** Answer payload handed to the host once the user finishes or skips out. */
export interface ExperienceSurveyAnswers {
  /** 0–10. Always present: the score is the only required question. */
  recommendation: number;
  /** Index into the improvement options, in the order rendered. */
  improvement?: number;
}

interface Props {
  /**
   * Privacy → "Share usage data". Answers travel on the same analytics
   * pipeline as everything else, so with consent off the card must not appear
   * at all: asking someone for feedback and then dropping it on the floor is
   * worse than never asking.
   */
  metricsConsent?: boolean;
  /**
   * Reports a finished response. The card retires itself either way, so this
   * fires at most once per install.
   */
  onSubmit?: (answers: ExperienceSurveyAnswers) => void;
  /** Fires once when the card first becomes visible. */
  onExposure?: () => void;
  /** Fires when the user closes the card without finishing. */
  onDismiss?: (answers: Partial<ExperienceSurveyAnswers>) => void;
}

/**
 * Modals in this app lock the page by setting `document.body.style.overflow`,
 * so that is the one signal available without a global modal registry. The
 * card must not surface behind an open dialog: it sits below the dialog's
 * layer and gets caught by its backdrop blur, which looks like a rendering
 * bug rather than a deliberate stack.
 */
function isModalOpen(): boolean {
  return document.body.style.overflow === 'hidden';
}

// Grounded in what users actually complain about in the per-run feedback
// (~900 "didn't understand the request", ~730 "incomplete output") and in
// their own words in the free-text box, rather than in product-area names.
// Order matches EXPERIENCE_SURVEY_IMPROVEMENT_CHOICES — the index is the wire
// value, so these two lists must be reordered together or never.
const IMPROVEMENT_KEYS = [
  'experienceSurvey.improvement.wrongOutput',
  'experienceSurvey.improvement.falseDone',
  'experienceSurvey.improvement.hardToUse',
  'experienceSurvey.improvement.upgradePrompts',
  'experienceSurvey.improvement.stuck',
  'experienceSurvey.improvement.slow',
  'experienceSurvey.improvement.looks',
  'experienceSurvey.improvement.regression',
] as const;

type Step = 'recommendation' | 'improvement' | 'thanks';

const STEP_ORDER: Step[] = ['recommendation', 'improvement'];

/** How long a tapped choice stays lit before the next question replaces it. */
const PICK_ACK_MS = 180;

// Repo motion contract (AGENTS.md): ease-out cubic-bezier(0.23, 1, 0.32, 1),
// enter ~200ms, exit ~140ms because the user has already chosen to dismiss.
const EASE_OUT = [0.23, 1, 0.32, 1] as const;

const cardMotion: Variants = {
  hidden: { opacity: 0, y: 12, scale: 0.97 },
  visible: { opacity: 1, y: 0, scale: 1, transition: { duration: 0.22, ease: EASE_OUT } },
  exit: { opacity: 0, y: 8, scale: 0.98, transition: { duration: 0.14, ease: EASE_OUT } },
};

export function ExperienceSurvey({
  metricsConsent = false,
  onSubmit,
  onExposure,
  onDismiss,
}: Props) {
  const t = useT();
  const [visible, setVisible] = useState(false);
  const [step, setStep] = useState<Step>('recommendation');
  const [picked, setPicked] = useState<number | null>(null);
  const answersRef = useRef<Partial<ExperienceSurveyAnswers>>({});
  const bodyRef = useRef<HTMLDivElement | null>(null);
  // Tallest step seen so far. The card is pinned to the bottom-right corner,
  // so a step that is shorter than the one before it drags the top edge back
  // down — answering felt like the card was bouncing. Growing once and holding
  // that height keeps the motion in one direction.
  const [floor, setFloor] = useState(0);
  const exposedRef = useRef(false);
  const timersRef = useRef<number[]>([]);

  const later = useCallback((fn: () => void, ms: number) => {
    timersRef.current.push(window.setTimeout(fn, ms));
  }, []);

  useEffect(
    () => () => {
      for (const id of timersRef.current) window.clearTimeout(id);
    },
    [],
  );

  // Dev-only preview hook, so the card can be eyeballed during development or
  // design review without driving a real export. Never registered in a
  // production build.
  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    const globals = window as typeof window & {
      __odExperienceSurvey?: { open: () => void };
    };
    globals.__odExperienceSurvey = { open: () => setVisible(true) };
    // `?survey=preview` opens it without a console round-trip, so a design
    // review can just follow a link.
    if (new URLSearchParams(window.location.search).get('survey') === 'preview') {
      setVisible(true);
    }
    return () => {
      delete globals.__odExperienceSurvey;
    };
  }, []);

  // Arm on export. The delay gives the user a beat to see their export land
  // before anything else asks for attention.
  useEffect(() => {
    if (!metricsConsent) return;
    let armTimer: number | null = null;
    let modalWatcher: MutationObserver | null = null;

    const reveal = () => {
      if (isSurveyRetired()) return;
      if (isModalOpen()) {
        // Stay armed and wait the dialog out rather than dropping the chance:
        // the export already happened, and this is the only one we get.
        modalWatcher?.disconnect();
        modalWatcher = new MutationObserver(() => {
          if (isModalOpen()) return;
          modalWatcher?.disconnect();
          modalWatcher = null;
          reveal();
        });
        modalWatcher.observe(document.body, {
          attributes: true,
          attributeFilter: ['style'],
        });
        return;
      }
      setVisible(true);
    };

    const unsubscribe = onExportSucceeded(() => {
      if (isSurveyRetired() || exposedRef.current || armTimer !== null) return;
      armTimer = window.setTimeout(() => {
        armTimer = null;
        reveal();
      }, SURVEY_DELAY_MS);
    });

    return () => {
      unsubscribe();
      modalWatcher?.disconnect();
      if (armTimer !== null) window.clearTimeout(armTimer);
    };
  }, [metricsConsent]);

  useEffect(() => {
    if (!visible || exposedRef.current) return;
    exposedRef.current = true;
    onExposure?.();
  }, [visible, onExposure]);

  useEffect(() => {
    const el = bodyRef.current;
    if (!el) return;
    setFloor((current) => Math.max(current, el.scrollHeight));
  }, [step, visible]);

  const goTo = useCallback((next: Step) => {
    setPicked(null);
    setStep(next);
  }, []);

  const finish = useCallback(() => {
    retireSurvey();
    const answers = answersRef.current;
    if (typeof answers.recommendation === 'number') {
      onSubmit?.(answers as ExperienceSurveyAnswers);
    }
    setPicked(null);
    setStep('thanks');
    later(() => setVisible(false), 2_600);
  }, [later, onSubmit]);

  const close = useCallback(() => {
    retireSurvey();
    setVisible(false);
    if (step !== 'thanks') onDismiss?.(answersRef.current);
  }, [onDismiss, step]);

  /** Lights the tapped choice, then advances — the tap needs a receipt. */
  const pick = useCallback(
    (value: number, apply: (value: number) => void, next: Step | 'finish') => {
      if (picked !== null) return;
      setPicked(value);
      apply(value);
      later(() => (next === 'finish' ? finish() : goTo(next)), PICK_ACK_MS);
    },
    [finish, goTo, later, picked],
  );

  if (typeof document === 'undefined') return null;

  const stepIndex = STEP_ORDER.indexOf(step);
  const progress = step === 'thanks' ? 1 : (stepIndex + 1) / STEP_ORDER.length;

  const head = (
    <div className={styles.head}>
      <span className={styles.tag}>{t('experienceSurvey.tag')}</span>
      <button
        type="button"
        className={styles.close}
        onClick={close}
        aria-label={t('experienceSurvey.close')}
      >
        ×
      </button>
    </div>
  );

  const counter = <span className={styles.count}>{stepIndex + 1}/{STEP_ORDER.length}</span>;

  let body: JSX.Element;
  if (step === 'recommendation') {
    body = (
      <>
        <p className={styles.question}>{t('experienceSurvey.recommendation')}</p>
        <div className={`${styles.rail} ${styles.eleven}`}>
          {Array.from({ length: 11 }, (_, value) => (
            <button
              key={value}
              type="button"
              className={`${styles.cell} ${picked === value ? styles.picked : ''}`}
              onClick={() =>
                pick(
                  value,
                  (v) => {
                    answersRef.current.recommendation = v;
                  },
                  'improvement',
                )
              }
            >
              {value}
            </button>
          ))}
        </div>
        <div className={styles.bounds}>
          <span>{t('experienceSurvey.recommendationLow')}</span>
          <span>{t('experienceSurvey.recommendationHigh')}</span>
        </div>
        <div className={styles.foot}>{counter}</div>
      </>
    );
  } else if (step === 'improvement') {
    body = (
      <>
        <p className={styles.question}>{t('experienceSurvey.improvement')}</p>
        <div className={styles.options}>
          {IMPROVEMENT_KEYS.map((key, index) => (
            <button
              key={key}
              type="button"
              className={`${styles.option} ${picked === index ? styles.picked : ''}`}
              onClick={() =>
                pick(
                  index,
                  (v) => {
                    answersRef.current.improvement = v;
                  },
                  'finish',
                )
              }
            >
              {t(key)}
            </button>
          ))}
        </div>
        <div className={styles.foot}>
          {counter}
          <button type="button" className={styles.skip} onClick={finish}>
            {t('experienceSurvey.skip')}
          </button>
        </div>
      </>
    );
  } else {
    body = (
      <div className={styles.thanks}>
        <span className={styles.thanksMark} aria-hidden>
          ✓
        </span>
        <span className={styles.thanksText}>
          <p className={styles.thanksTitle}>{t('experienceSurvey.thanksTitle')}</p>
          <p className={styles.thanksBody}>{t('experienceSurvey.thanksBody')}</p>
        </span>
      </div>
    );
  }

  return createPortal(
    <AnimatePresence>
      {visible ? (
        <motion.section
          className={styles.card}
          role="dialog"
          aria-label={t('experienceSurvey.tag')}
          variants={cardMotion}
          initial="hidden"
          animate="visible"
          exit="exit"
        >
          <span
            className={styles.progress}
            style={{ transform: `scaleX(${progress})` }}
            aria-hidden
          />
          <div
            className={styles.body}
            ref={bodyRef}
            // The floor holds between questions so answering never drags the
            // card back down. The thank-you is exempt: it is two lines at the
            // end of the flow, and holding the questions' height there left a
            // band of empty card above and below it. Collapsing once, at the
            // end, reads as the card closing up rather than wobbling.
            style={floor && step !== 'thanks' ? { minHeight: floor } : undefined}
          >
            {head}
            {/* The step swaps outright — no crossfade, no height tween. Every
                animated version of this transition read as the card wobbling,
                because the card is pinned to a corner and any height change is
                paid for by the top edge moving. Cutting straight to the next
                question is the one version that does not draw attention to
                itself. The card's own entrance and exit still animate. */}
            <div
              key={step}
              style={{ display: 'flex', flex: 1, flexDirection: 'column', gap: 12, justifyContent: 'center' }}
            >
              {body}
            </div>
          </div>
        </motion.section>
      ) : null}
    </AnimatePresence>,
    document.body,
  );
}
