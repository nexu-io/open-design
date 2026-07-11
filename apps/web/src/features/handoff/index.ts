// Public API of the hand-off slice. The orchestrator (`HandoffButton`, which
// lives outside the slice) imports ONLY from here — never from the slice's
// internal files. Barrels mark boundaries: this is the slice boundary, and
// `scripts/check-web-slice-boundaries.ts` fails any outside-in deep import
// that reaches past it (ADR 0002).

// UI types the orchestrator's props are built from.
export type {
  CliHandoffLabels,
  CliTarget,
  FallbackEditorTarget,
  FireHandoff,
  FrameworkId,
  FrameworkTarget,
  HandoffButtonProps,
  HandoffTab,
} from './types';

// Constants the orchestrator composes with (the AMR link target).
export { AMR_WEBSITE_URL } from './constants';

// Hooks (with their controller/options types) the orchestrator wires.
export {
  useHandoffError,
  type HandoffErrorController,
} from './hooks/useHandoffError.hooks';
export {
  useHandoffMenuNav,
  type HandoffMenuNavController,
} from './hooks/useHandoffMenuNav.hooks';
export {
  useWiredHandoffEditors,
  type HandoffEditorsController,
  type UseHandoffEditorsOptions,
} from './hooks/useHandoffEditors.hooks';
export {
  useWiredHandoffCli,
  type HandoffCliController,
  type UseHandoffCliOptions,
} from './hooks/useHandoffCli.hooks';

// Dumb components the orchestrator composes.
export { EditorIcon } from './components/EditorIcon';
export { HandoffFallbackButton } from './components/HandoffFallbackButton';
export { HandoffTrigger } from './components/HandoffTrigger';
export { HandoffMenu } from './components/HandoffMenu';
