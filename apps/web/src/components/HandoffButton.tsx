// Hand-off menu in the ChatPane header (orchestrator). The left split button
// opens the current design project folder in a local editor, while the
// dropdown also exposes copy-to-CLI prompts for handing the same local
// folder to code agents. This file is the section shell: it composes the
// `features/handoff` slice (editors + CLI hooks, the trigger, the dropdown)
// and owns only the surface-scoped analytics dispatch (including the AMR
// attribution side-effect) and the outside-click/Escape dismiss effect, which
// stays here per the slice's effect-placement rule so a reused hook's
// subscription can't double-fire.
import { useEffect } from 'react';
import type { MouseEvent as ReactMouseEvent } from 'react';
import { handoffTargetIdToTracking } from '@open-design/contracts/analytics';
import { useAnalytics } from '../analytics/provider';
import { getResolvedDeviceId } from '../analytics/client';
import { amrHandoffDeviceId, attributedAmrUrl, recordAmrEntry } from '../analytics/amr-attribution';
import { trackHandoffClick } from '../analytics/events';
import {
  AMR_WEBSITE_URL,
  HandoffFallbackButton,
  HandoffMenu,
  HandoffTrigger,
  useHandoffError,
  useHandoffMenuNav,
  useWiredHandoffCli,
  useWiredHandoffEditors,
  type FireHandoff,
  type HandoffButtonProps,
  type HandoffCliController,
  type HandoffEditorsController,
  type HandoffErrorController,
  type HandoffMenuNavController,
  type UseHandoffCliOptions,
  type UseHandoffEditorsOptions,
} from '../features/handoff';

// Injectable hooks for the orchestrator. Each defaults to its wired hook, so
// production callers pass nothing while tests swap a hook for a fake. Per-hook
// injection (not one bag) keeps each seam independently overridable.
interface HandoffButtonHooks {
  useNav?: () => HandoffMenuNavController;
  useErrorCtl?: () => HandoffErrorController;
  useEditors?: (options: UseHandoffEditorsOptions) => HandoffEditorsController;
  useCli?: (options: UseHandoffCliOptions) => HandoffCliController;
}

export function HandoffButton({
  projectId,
  projectName,
  projectDir,
  agents,
  artifactId,
  artifactKind,
  metricsConsent = false,
  installationId,
  onRequestRevealInFinder,
  useNav = useHandoffMenuNav,
  useErrorCtl = useHandoffError,
  useEditors = useWiredHandoffEditors,
  useCli = useWiredHandoffCli,
}: HandoffButtonProps & HandoffButtonHooks) {
  const analytics = useAnalytics();
  // One-liner so every hand-off interaction emits the same
  // `ui_click` / `area=handoff` shape; callers pass only what varies. The
  // active-artifact context is attached to every event so handoff slices line
  // up with the rest of the artifact_header funnel.
  const fireHandoff: FireHandoff = (props) => {
    trackHandoffClick(analytics.track, {
      page_name: 'artifact',
      area: 'handoff',
      artifact_id: artifactId,
      artifact_kind: artifactKind,
      ...props,
    });
  };

  const nav = useNav();
  const errorCtl = useErrorCtl();
  const editors = useEditors({
    fireHandoff,
    projectId,
    onRequestRevealInFinder,
    setError: errorCtl.setError,
    clearError: errorCtl.clearError,
    closeMenu: () => nav.setOpen(false),
    openMenuOnEditorTab: () => {
      nav.setOpen(true);
      nav.setActiveTab('editor');
    },
  });
  const cli = useCli({
    fireHandoff,
    projectId,
    projectName,
    projectDir,
    agents,
    setError: errorCtl.setError,
    clearError: errorCtl.clearError,
  });

  useEffect(() => {
    if (!nav.open) return;
    function onPointer(e: MouseEvent) {
      if (nav.wrapRef.current?.contains(e.target as Node)) return;
      nav.setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') nav.setOpen(false);
    }
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [nav.open, nav.wrapRef, nav.setOpen]);

  const handleAmrWebsiteClick = (event: ReactMouseEvent<HTMLAnchorElement>) => {
    fireHandoff({ element: 'amr_website', handoff_tab: 'cli' });
    const attribution = recordAmrEntry(analytics.track, 'handoff_amr_website', new Date(), {
      metricsConsent,
    });
    const deviceId = amrHandoffDeviceId({
      metricsConsent,
      resolvedDeviceId: getResolvedDeviceId(),
      installationId,
    });
    event.currentTarget.href = attributedAmrUrl(
      AMR_WEBSITE_URL,
      attribution,
      deviceId,
    );
  };

  if (!editors.loaded) {
    return null;
  }

  // No available editors — render a Finder/Explorer/File-Manager single-button
  // fallback so the surface is never blank, including the true zero-editor
  // response where the daemon reports `editors: []`.
  if (editors.available.length === 0) {
    return (
      <HandoffFallbackButton
        fallbackId={editors.fallback.id}
        fallbackLabel={editors.fallback.label}
        busy={editors.busy}
        error={errorCtl.error}
        onLaunch={editors.launchFallback}
      />
    );
  }

  return (
    <div
      className={`handoff-wrap${nav.open ? ' open' : ''}`}
      ref={nav.wrapRef}
      data-testid="handoff-wrap"
    >
      <HandoffTrigger
        primary={editors.primary}
        primaryTitle={editors.primaryTitle}
        busy={editors.busy}
        onTriggerClick={() => {
          if (editors.primary && editors.busy !== editors.primary.id) {
            // Record the button intent first (the most common path through
            // this surface), carrying the preferred editor as target so it
            // is distinguishable from picking the same editor in the
            // dropdown; launch() then emits `open_editor` for the actual
            // target launch.
            fireHandoff({
              element: 'trigger',
              target_id: handoffTargetIdToTracking(editors.primary.id),
              target_available: editors.primary.available,
              handoff_tab: 'editor',
            });
            void editors.launch(editors.primary);
          } else {
            fireHandoff({ element: 'trigger' });
            nav.setOpen((v) => !v);
          }
        }}
        onCaretClick={() => {
          fireHandoff({ element: 'caret' });
          nav.setOpen((v) => !v);
        }}
      />
      {nav.open ? (
        <HandoffMenu
          activeTab={nav.activeTab}
          onTabChange={(tab) => {
            fireHandoff({ element: 'tab', handoff_tab: tab });
            nav.setActiveTab(tab);
          }}
          projectDir={projectDir}
          copiedCliId={cli.copiedCliId}
          copyBusy={cli.copyBusy}
          onCopyProjectPath={() => void cli.copyProjectPath()}
          error={errorCtl.error}
          available={editors.available}
          unavailable={editors.unavailable}
          busy={editors.busy}
          onLaunchEditor={(editor) => void editors.launch(editor)}
          availableCliTargets={cli.availableCliTargets}
          unavailableCliTargets={cli.unavailableCliTargets}
          selectedFramework={cli.selectedFramework}
          onCopyCli={(target) => void cli.copyCliPrompt(target)}
          onChooseFramework={cli.chooseFramework}
          onAmrWebsiteClick={handleAmrWebsiteClick}
        />
      ) : null}
    </div>
  );
}
