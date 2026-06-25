'use client';

import { useEffect, useRef, useState } from 'react';
import {
  advanceTypewriter,
  DEFAULT_TYPEWRITER_TIMING,
  initialTypewriterState,
  type PlaceholderScenario,
} from './placeholderScenarios';

// Reports the OS "reduce motion" preference, live. SSR/jsdom without
// matchMedia falls back to false (animate) — the animation is purely
// decorative, so a missing matcher must not crash the home composer.
function usePrefersReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return;
    const query = window.matchMedia('(prefers-reduced-motion: reduce)');
    setReduced(query.matches);
    const onChange = (event: MediaQueryListEvent) => setReduced(event.matches);
    // addEventListener is the modern API; addListener is the Safari<14 fallback.
    if (typeof query.addEventListener === 'function') {
      query.addEventListener('change', onChange);
      return () => query.removeEventListener('change', onChange);
    }
    query.addListener(onChange);
    return () => query.removeListener(onChange);
  }, []);
  return reduced;
}

interface Props {
  scenarios: ReadonlyArray<PlaceholderScenario>;
  // When false the carousel stops and renders nothing (the editor shows its
  // own static placeholder instead). The parent gates this on "empty composer,
  // nothing else bound".
  active: boolean;
  // Fired whenever the displayed scenario changes (including on first show), so
  // the parent always knows which scenario a Send would submit.
  onScenarioChange: (scenario: PlaceholderScenario) => void;
}

// Pointer-events-none overlay that types the rotating scenario placeholders
// over the (empty) Lexical editor. It owns the per-character animation state so
// the frequent re-renders stay confined here and never touch the editor.
export function PlaceholderCarousel({ scenarios, active, onScenarioChange }: Props) {
  const reducedMotion = usePrefersReducedMotion();
  const [state, setState] = useState(initialTypewriterState);
  const onChangeRef = useRef(onScenarioChange);
  onChangeRef.current = onScenarioChange;
  const reportedIndexRef = useRef(-1);

  // Reset to the first scenario whenever the carousel is (re)activated, so a
  // user who types then clears the composer sees it start fresh.
  useEffect(() => {
    if (!active) {
      reportedIndexRef.current = -1;
      setState(initialTypewriterState());
    }
  }, [active]);

  // Restart from the first scenario whenever the pool changes — e.g. a
  // different template is selected, which swaps the scenario set. (The parent
  // memoises the array, so this fires only on a real switch, not every render.)
  useEffect(() => {
    reportedIndexRef.current = -1;
    setState(initialTypewriterState());
  }, [scenarios]);

  // Report the active scenario up on every index change (incl. first show).
  useEffect(() => {
    if (!active || scenarios.length === 0) return;
    const scenario = scenarios[state.index % scenarios.length];
    if (scenario && reportedIndexRef.current !== state.index) {
      reportedIndexRef.current = state.index;
      onChangeRef.current(scenario);
    }
  }, [active, state.index, scenarios]);

  // Drive the machine: each committed state schedules the next step. Changing
  // state re-runs this effect, whose cleanup clears the prior timer — so the
  // chain self-sustains without overlapping timers (StrictMode-safe).
  useEffect(() => {
    if (!active || scenarios.length === 0) return;
    const scenario = scenarios[state.index % scenarios.length];
    const length = scenario?.text.length ?? 0;
    const { state: nextState, delayMs } = advanceTypewriter(
      state,
      length,
      scenarios.length,
      DEFAULT_TYPEWRITER_TIMING,
      reducedMotion,
    );
    const timer = window.setTimeout(() => setState(nextState), Math.max(16, delayMs));
    return () => window.clearTimeout(timer);
  }, [active, state, scenarios, reducedMotion]);

  if (!active || scenarios.length === 0) return null;
  const scenario = scenarios[state.index % scenarios.length];
  if (!scenario) return null;
  const visible = reducedMotion ? scenario.text : scenario.text.slice(0, state.charCount);
  return (
    <div className="home-hero__carousel" aria-hidden="true" data-testid="home-hero-carousel">
      <span className="home-hero__carousel-text">{visible}</span>
      <span className="home-hero__carousel-caret" />
    </div>
  );
}
