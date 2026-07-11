// Feature-local hook for the editors cluster: load the daemon's installed-
// editor catalogue, launch one (from the picker or the primary split
// button), and the zero-editors single-button fallback. Its transport
// dependency is INJECTED as the slice port, so it holds no provider import
// and unit-tests against hand-written fakes. `fireHandoff` / `setError` /
// `clearError` / the menu-open callbacks are injected coordination from the
// orchestrator and its sibling hooks, keeping this hook decoupled from them.
import { useCallback, useEffect, useMemo, useState } from 'react';
import type { HostEditor, HostEditorId, HostEditorsResponse } from '@open-design/contracts';
import { handoffTargetIdToTracking } from '@open-design/contracts/analytics';
import { useT } from '../../../i18n';
import type { HandoffEditorsPort, HandoffPreferencesPort } from '../ports';
import { handoffEditorsPort, handoffPreferencesPort } from '../dependencies';
import { fallbackEditorFor } from '../rules';
import type { FallbackEditorTarget, FireHandoff } from '../types';

export interface UseHandoffEditorsOptions {
  fireHandoff: FireHandoff;
  projectId: string;
  onRequestRevealInFinder?: () => void;
  setError: (message: string | null) => void;
  clearError: () => void;
  /** Close the dropdown (launch succeeded). */
  closeMenu: () => void;
  /** Reopen the dropdown on the editor tab (launch failed, so the user can
   * see the inline error and retry). */
  openMenuOnEditorTab: () => void;
  /** Toggle the dropdown open/closed (the split trigger's "no primary yet, or
   * mid-launch" branch, and the caret). */
  toggleOpen: () => void;
}

export interface HandoffEditorsController {
  editors: HostEditor[];
  platform: HostEditorsResponse['platform'];
  loaded: boolean;
  busy: HostEditorId | null;
  available: HostEditor[];
  unavailable: HostEditor[];
  primary: HostEditor | null;
  primaryTitle: string;
  fallback: FallbackEditorTarget;
  launch: (editor: HostEditor) => Promise<void>;
  launchFallback: () => void;
  /** The split trigger's click: launch the primary editor when one is ready
   * and idle, otherwise just toggle the dropdown open. */
  handleTriggerClick: () => void;
}

export function useHandoffEditors(
  port: HandoffEditorsPort,
  preferencesPort: HandoffPreferencesPort,
  options: UseHandoffEditorsOptions,
): HandoffEditorsController {
  const t = useT();
  const {
    fireHandoff,
    projectId,
    onRequestRevealInFinder,
    setError,
    clearError,
    closeMenu,
    openMenuOnEditorTab,
    toggleOpen,
  } = options;

  const [editors, setEditors] = useState<HostEditor[]>([]);
  const [platform, setPlatform] = useState<HostEditorsResponse['platform']>('unknown');
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<HostEditorId | null>(null);

  useEffect(() => {
    let cancelled = false;
    port
      .fetchHostEditors()
      .then((resp) => {
        if (cancelled) return;
        setEditors(resp.editors);
        setPlatform(resp.platform);
        setLoaded(true);
      })
      .catch(() => {
        if (cancelled) return;
        setEditors([]);
        setLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [port]);

  const available = editors.filter((e) => e.available);
  const unavailable = editors.filter((e) => !e.available);
  const preferred = preferencesPort.readPreferredEditor();
  const primary = available.find((e) => e.id === preferred) ?? available[0] ?? null;
  const primaryTitle = primary
    ? t('handoff.openInTarget', { target: primary.label })
    : t('handoff.action');
  const fallback = useMemo(() => fallbackEditorFor(platform), [platform]);

  const launch = useCallback(
    async (editor: HostEditor) => {
      fireHandoff({
        element: 'open_editor',
        target_id: handoffTargetIdToTracking(editor.id),
        target_available: editor.available,
        handoff_tab: 'editor',
      });
      // Still try — the user might have an unprobed path (e.g. macOS
      // bundle in /Applications). The daemon will return 409 if it
      // genuinely can't find it.
      clearError();
      setBusy(editor.id);
      preferencesPort.writePreferredEditor(editor.id);
      try {
        await port.openProjectInEditor(projectId, editor.id);
        closeMenu();
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        setError(msg);
        openMenuOnEditorTab();
        // Fallback: if Finder is the user's pick and the daemon spawn
        // failed, try the renderer-side reveal-in-finder bridge.
        if (editor.id === 'finder' && onRequestRevealInFinder) {
          try {
            onRequestRevealInFinder();
          } catch {
            // ignore
          }
        }
      } finally {
        setBusy(null);
      }
    },
    [
      fireHandoff,
      clearError,
      preferencesPort,
      port,
      projectId,
      closeMenu,
      setError,
      openMenuOnEditorTab,
      onRequestRevealInFinder,
    ],
  );

  const launchFallback = useCallback(() => {
    fireHandoff({
      element: 'open_editor',
      target_id: handoffTargetIdToTracking(fallback.id),
      target_available: false,
      handoff_tab: 'editor',
    });
    clearError();
    setBusy(fallback.id);
    void port
      .openProjectInEditor(projectId, fallback.id)
      .catch((err) => {
        setError(err instanceof Error ? err.message : String(err));
        onRequestRevealInFinder?.();
      })
      .finally(() => setBusy(null));
  }, [fireHandoff, clearError, port, projectId, fallback, setError, onRequestRevealInFinder]);

  const handleTriggerClick = useCallback(() => {
    if (primary && busy !== primary.id) {
      // Record the button intent first (the most common path through this
      // surface), carrying the preferred editor as target so it is
      // distinguishable from picking the same editor in the dropdown;
      // launch() then emits `open_editor` for the actual target launch.
      fireHandoff({
        element: 'trigger',
        target_id: handoffTargetIdToTracking(primary.id),
        target_available: primary.available,
        handoff_tab: 'editor',
      });
      void launch(primary);
    } else {
      fireHandoff({ element: 'trigger' });
      toggleOpen();
    }
  }, [primary, busy, fireHandoff, launch, toggleOpen]);

  return {
    editors,
    platform,
    loaded,
    busy,
    available,
    unavailable,
    primary,
    primaryTitle,
    fallback,
    launch,
    launchFallback,
    handleTriggerClick,
  };
}

/**
 * Wirer: binds the real provider ports and returns a ready-to-call hook. This
 * is the default the orchestrator uses; swap it via `useHandoffEditors(...)`
 * with hand-written fakes in tests.
 */
export function useWiredHandoffEditors(
  options: UseHandoffEditorsOptions,
): HandoffEditorsController {
  return useHandoffEditors(handoffEditorsPort, handoffPreferencesPort, options);
}
