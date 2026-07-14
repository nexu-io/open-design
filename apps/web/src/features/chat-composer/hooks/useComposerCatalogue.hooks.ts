// Feature-local hook for the MCP servers / MCP templates / connectors /
// installed-plugins catalogue, and the `composerEngaged` latch that gates
// fetching all four. `composerEngaged` starts false and flips true (never
// back) on the composer's first real interaction, so an untouched empty
// composer never pays for the plugin/MCP/connector fetches.
//
// `fetchMcpServers` and `listPlugins` are real transport calls used ONLY by
// this hook's fetch effects (verified: nothing else in the orchestrator
// calls either), so — unlike `patchProject`/`openFolderDialog`, which stay
// plain deps-bag callbacks because other clusters also use them — they are
// routed through a dedicated port (`ComposerCataloguePort`), following the
// `WorkingDirPort` pattern exactly. `fetchConnectorCatalogSnapshot` lives in
// `components/connectors-state.ts`, which is shared with `EntryView.tsx`
// (not slice-exclusive); moving it into `providers/` is a separate, later
// cleanup, so this hook imports it directly from `components/` — the guard
// only blocks `providers/` imports outside `dependencies.ts`, not
// `components/` imports.
//
// The connectors-changed subscription (`listenForConnectorsChanged`, from
// `components/connectors-events.ts`) is an ACCUMULATING `window`/event
// listener, so per the slice's effect-placement rule it stays in the
// orchestrator (a guaranteed single instance) instead of this hook. This
// hook only exposes `refreshConnectors` for that orchestrator-owned effect
// to call, mirroring how `useWorkingDirStatus` exposes `checkWorkingDir` for
// the orchestrator's focus/visibilitychange listener.
import { useCallback, useEffect, useRef, useState } from 'react';
import type {
  ConnectorDetail,
  InstalledPluginRecord,
  McpServerConfig,
  McpTemplate,
} from '@open-design/contracts';
import { fetchConnectorCatalogSnapshot } from '../../../components/connectors-state';
import { composerCataloguePort } from '../dependencies';
import type { ComposerCataloguePort } from '../ports';

export interface ComposerCatalogueParams {
  projectId: string | null;
  /**
   * Seeds the `composerEngaged` latch. The orchestrator passes
   * `(draft ?? '').trim().length > 0` (the pre-extraction initializer) so a
   * composer that starts with content still fetches immediately. Only
   * consulted on mount — like the `useState` initializer it replaces, React
   * ignores this value on later renders.
   */
  initialEngaged: boolean;
}

export interface ComposerCatalogueController {
  mcpServers: McpServerConfig[];
  mcpTemplates: McpTemplate[];
  connectors: ConnectorDetail[];
  installedPlugins: InstalledPluginRecord[];
  composerEngaged: boolean;
  /** Latches `composerEngaged` true. Idempotent (a no-op once already
   *  engaged) — safe to call from every existing trigger: first focus, the
   *  tools/plus-menu opening, an @/slash trigger, a pre-seeded draft, or the
   *  imperative `openDesignToolbox` handle. */
  markComposerEngaged: () => void;
  /** Re-fetches the connector catalogue with discovery refreshed. Exposed so
   *  the orchestrator's connectors-changed listener effect (kept out of this
   *  hook — see module header) can trigger a reload. */
  refreshConnectors: () => Promise<void>;
}

export function useComposerCatalogue(
  { projectId, initialEngaged }: ComposerCatalogueParams,
  port: ComposerCataloguePort,
): ComposerCatalogueController {
  const [mcpServers, setMcpServers] = useState<McpServerConfig[]>([]);
  const [mcpTemplates, setMcpTemplates] = useState<McpTemplate[]>([]);
  const [connectors, setConnectors] = useState<ConnectorDetail[]>([]);
  const [installedPlugins, setInstalledPlugins] = useState<InstalledPluginRecord[]>([]);
  const [composerEngaged, setComposerEngaged] = useState(initialEngaged);

  const markComposerEngaged = useCallback(() => {
    setComposerEngaged(true);
  }, []);

  // Tracks component lifetime (not a per-effect flag) so `refreshConnectors`
  // — called imperatively from the orchestrator's own listener effect,
  // outside any effect this hook owns — can still skip a state update after
  // unmount, matching the cancellation guard the original inline effect had.
  const mountedRef = useRef(true);
  useEffect(
    () => () => {
      mountedRef.current = false;
    },
    [],
  );

  // Lazy-fetch the user's external MCP servers list (once engaged) so the
  // `/mcp …` slash palette and the composer's MCP button popover have
  // something to render. We deliberately do not reactively re-fetch when
  // the user toggles servers from Settings — the dialog refreshes itself,
  // and the chat composer rehydrates next time the user re-opens it. A
  // background poll would be cheap but unnecessary for the typical
  // edit-once-then-chat workflow.
  useEffect(() => {
    if (!composerEngaged) return;
    let cancelled = false;
    void (async () => {
      const data = await port.fetchMcpServers();
      if (cancelled || !data) return;
      setMcpServers(data.servers);
      setMcpTemplates(data.templates);
    })();
    return () => {
      cancelled = true;
    };
  }, [composerEngaged, port]);

  // Lazy-fetch installed plugins once on mount; the tools-menu Plugins
  // tab and the @-mention picker both consume this list.
  useEffect(() => {
    if (!projectId || !composerEngaged) return;
    let cancelled = false;
    void port.listInstalledPlugins().then((rows) => {
      if (cancelled) return;
      setInstalledPlugins(rows);
    });
    return () => {
      cancelled = true;
    };
  }, [projectId, composerEngaged, port]);

  useEffect(() => {
    if (!composerEngaged) return;
    let cancelled = false;
    void fetchConnectorCatalogSnapshot().then((rows) => {
      if (cancelled) return;
      setConnectors(rows.filter((connector) => connector.status === 'connected'));
    });
    return () => {
      cancelled = true;
    };
  }, [composerEngaged]);

  const refreshConnectors = useCallback(async () => {
    const rows = await fetchConnectorCatalogSnapshot({ refreshDiscovery: true });
    if (!mountedRef.current) return;
    setConnectors(rows.filter((connector) => connector.status === 'connected'));
  }, []);

  return {
    mcpServers,
    mcpTemplates,
    connectors,
    installedPlugins,
    composerEngaged,
    markComposerEngaged,
    refreshConnectors,
  };
}

/**
 * Wirer: binds the real MCP + plugins providers. This is the default the
 * orchestrator injects; tests call `useComposerCatalogue` directly with a
 * hand-written fake port instead.
 */
export function useWiredComposerCatalogue(
  params: ComposerCatalogueParams,
): ComposerCatalogueController {
  return useComposerCatalogue(params, composerCataloguePort);
}
