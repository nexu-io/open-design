// UI-only types for the hand-off slice. Wire shapes (`HostEditor`,
// `HostEditorId`, `HostEditorsResponse`, `AgentInfo`,
// `OpenProjectInEditorResponse`) come from `@open-design/contracts` and are
// never redeclared here; these are the local view models the slice's hooks
// and dumb components pass around.
import type { AgentInfo, HostEditorId } from '@open-design/contracts';
import type { HandoffClickProps, TrackingArtifactKind } from '@open-design/contracts/analytics';

/** Fires one `ui_click` / `area=handoff` event; the orchestrator binds the
 * page/area/artifact dimensions once (`fireHandoff`) and injects it into
 * every cluster hook that raises an event, so no feature file needs
 * `useAnalytics()` itself. */
export type FireHandoff = (
  props: Omit<HandoffClickProps, 'page_name' | 'area' | 'artifact_id' | 'artifact_kind'>,
) => void;

/** Which panel of the dropdown menu is showing. */
export type HandoffTab = 'editor' | 'cli';

export type FrameworkId = 'react' | 'vue' | 'svelte' | 'solid' | 'next' | 'vanilla';

export interface FrameworkTarget {
  id: FrameworkId;
}

/** A CLI hand-off target, merged from the fallback catalogue and whatever the
 * daemon's `/api/agents` probe reports for it. */
export interface CliTarget {
  id: string;
  name: string;
  bin: string;
  available: boolean;
  version?: string | null;
}

/** Localized copy the pure prompt builder assembles into the clipboard text,
 * so `rules.ts` stays free of the `useT()` React hook. */
export interface CliHandoffLabels {
  promptIntro: string;
  target: string;
  cli: string;
  stepsLead: string;
  readFiles: string;
  keepDesign: string;
  produceCode: string;
  verify: string;
  commandHint: string;
  project: string;
  projectId: string;
}

/** The single-button zero-editors fallback target, derived from platform. */
export interface FallbackEditorTarget {
  id: HostEditorId;
  label: string;
}

export interface HandoffButtonProps {
  projectId: string;
  projectName?: string;
  projectDir?: string | null;
  agents?: AgentInfo[];
  /** Active artifact context, so hand-off clicks carry the same artifact_id /
   * artifact_kind dimensions as the rest of the artifact_header funnel.
   * Undefined when no artifact tab is active. */
  artifactId?: string;
  artifactKind?: TrackingArtifactKind;
  metricsConsent?: boolean;
  installationId?: string | null;
  /** Optional fallback "always open in OS file manager" — falls back to the
   * existing shell.openPath bridge in case the daemon catalogue is empty
   * (highly unlikely on macOS / Win / Linux but harmless to support). */
  onRequestRevealInFinder?: () => void;
}
