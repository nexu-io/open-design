// First-generation loop tracker (spec §8.3 loop: 写需求 → 生成 → 查看 → 修改
// → 导出/分享; §11.1 onboarding_completed).
//
// A recommendation-started project hands its entry context to Studio through
// the project-keyed session slot in `onboarding-entry.ts`. This module keeps
// the loop's step ledger for the SAME created project and fires
// `onboarding_completed` exactly once, when the loop actually CLOSES with a
// delivery (export / share) in that project — the earlier steps ride along in
// `completed_steps` in the order they were first reached.
//
// Everything is scoped to the project id, so a delivery in an unrelated
// later project can never close another project's loop; a plain project with
// no ledger is always a silent no-op. Session-only and storage-denied-safe.

import type {
  OnboardingCompletedProps,
  TrackingOnboardingFirstLoopStep,
  TrackingOnboardingProductType,
} from '@open-design/contracts/analytics';
import type { OnboardingEntry } from './onboarding-entry';

type Track = (event: string, properties: Record<string, unknown>) => void;

const ENTRY_KEY = (projectId: string) => `open-design:first-loop-entry:${projectId}`;
const STEPS_KEY = (projectId: string) => `open-design:first-loop-steps:${projectId}`;
const DONE_KEY = (projectId: string) => `open-design:first-loop-completed:${projectId}`;

// Called once by the project view after it consumes the pending onboarding
// entry: pins the entry for THIS project so later taps (e.g. the FileViewer
// share/export delivery) can attribute the loop by project id without plumbing
// the entry through component props. The onboarding-entry slot is consumed
// (removed) on read, so this keeps its own copy alive for the session.
export function beginFirstLoop(projectId: string, entry: OnboardingEntry): void {
  if (!projectId) return;
  try {
    if (window.sessionStorage.getItem(ENTRY_KEY(projectId))) return;
    window.sessionStorage.setItem(ENTRY_KEY(projectId), JSON.stringify(entry));
  } catch {
    // Storage-denied contexts lose loop attribution — never throw.
  }
}

function readEntry(projectId: string): OnboardingEntry | null {
  try {
    const raw = window.sessionStorage.getItem(ENTRY_KEY(projectId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<OnboardingEntry>;
    if (
      parsed.source === 'home_recommendation' &&
      typeof parsed.productType === 'string' &&
      typeof parsed.recommendationId === 'string'
    ) {
      return parsed as OnboardingEntry;
    }
    return null;
  } catch {
    return null;
  }
}

function readSteps(projectId: string): TrackingOnboardingFirstLoopStep[] {
  try {
    const raw = window.sessionStorage.getItem(STEPS_KEY(projectId));
    const parsed = raw ? (JSON.parse(raw) as unknown) : [];
    return Array.isArray(parsed)
      ? (parsed.filter((s) => typeof s === 'string') as TrackingOnboardingFirstLoopStep[])
      : [];
  } catch {
    return [];
  }
}

/**
 * Record a loop step for a recommendation-started project. No-op when the
 * project has no active first loop (any ordinary project, or a delivery in an
 * unrelated project). Fires `onboarding_completed` once — on the first
 * `delivered` for the project — with every step observed so far, then clears
 * the ledger so post-completion activity can't re-open or grow it.
 */
export function recordFirstLoopStep(
  track: Track,
  step: TrackingOnboardingFirstLoopStep,
  projectId: string,
): void {
  if (!projectId) return;
  const entry = readEntry(projectId);
  if (!entry) return;
  let steps: TrackingOnboardingFirstLoopStep[];
  try {
    steps = readSteps(projectId);
    if (!steps.includes(step)) {
      steps = [...steps, step];
      window.sessionStorage.setItem(STEPS_KEY(projectId), JSON.stringify(steps));
    }
    if (step !== 'delivered') return;
    if (window.sessionStorage.getItem(DONE_KEY(projectId)) === '1') return;
    window.sessionStorage.setItem(DONE_KEY(projectId), '1');
    // Loop closed: drop the entry + steps so any later share/export in this
    // project is a silent no-op and the ledger stops growing. The DONE flag
    // stays as a tombstone against races.
    window.sessionStorage.removeItem(ENTRY_KEY(projectId));
    window.sessionStorage.removeItem(STEPS_KEY(projectId));
  } catch {
    return;
  }
  const props: OnboardingCompletedProps = {
    entry_source: entry.source,
    product_type: entry.productType as TrackingOnboardingProductType,
    recommendation_id: entry.recommendationId,
    completed_steps: steps,
  };
  track('onboarding_completed', props as unknown as Record<string, unknown>);
}
