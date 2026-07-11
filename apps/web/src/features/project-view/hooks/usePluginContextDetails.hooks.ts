// Feature-local hook for the chat context-chip's plugin/design-system detail
// surfaces: the pinned-plugin snapshot fetched once per project (so ChatPane
// can render it as a context chip instead of the inline plugin rail), the
// "View details" plugin-registry lookup, its duplicate-as-project action, and
// the design-system preview modal trigger.
import { useCallback, useEffect, useState } from 'react';
import type {
  AppliedPluginSnapshot,
  InstalledPluginRecord,
} from '@open-design/contracts';
import type { DesignSystemSummary } from '../../../types';
import { projectViewTransportPort } from '../dependencies';
import type { ProjectViewTransportPort } from '../ports';

export interface PluginContextDetailsController {
  activePluginSnapshot: AppliedPluginSnapshot | null;
  contextPluginDetails: InstalledPluginRecord | null;
  contextDesignSystemDetails: DesignSystemSummary | null;
  handleOpenContextPluginDetails: (pluginId: string) => Promise<void>;
  handleDuplicateContextPlugin: (record: InstalledPluginRecord) => Promise<void>;
  handleOpenContextDesignSystemDetails: (system: DesignSystemSummary) => void;
  closeContextPluginDetails: () => void;
  closeContextDesignSystemDetails: () => void;
}

export function usePluginContextDetails(
  port: ProjectViewTransportPort,
  appliedPluginSnapshotId: string | undefined,
  buildDuplicateName: (record: InstalledPluginRecord) => string,
  onNavigateToDuplicatedProject: (result: {
    projectId: string;
    conversationId: string;
    fileName: string;
  }) => void,
  onDuplicateFailed: () => void,
): PluginContextDetailsController {
  const [activePluginSnapshot, setActivePluginSnapshot] =
    useState<AppliedPluginSnapshot | null>(null);
  const [contextPluginDetails, setContextPluginDetails] =
    useState<InstalledPluginRecord | null>(null);
  const [contextDesignSystemDetails, setContextDesignSystemDetails] =
    useState<DesignSystemSummary | null>(null);

  useEffect(() => {
    if (!appliedPluginSnapshotId) {
      setActivePluginSnapshot(null);
      return;
    }
    let cancelled = false;
    void port.fetchAppliedPluginSnapshot(appliedPluginSnapshotId).then((snap) => {
      if (cancelled) return;
      setActivePluginSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, [appliedPluginSnapshotId, port]);

  const handleOpenContextPluginDetails = useCallback(
    async (pluginId: string) => {
      const normalizedId = pluginId.trim();
      if (!normalizedId) return;
      const plugins = await port.listPlugins({ includeHidden: true });
      const record = plugins.find((plugin) => plugin.id === normalizedId);
      if (record) setContextPluginDetails(record);
    },
    [port],
  );

  const handleDuplicateContextPlugin = useCallback(
    async (record: InstalledPluginRecord) => {
      try {
        const result = await port.duplicatePluginAsProject(record.id, {
          name: buildDuplicateName(record),
        });
        setContextPluginDetails(null);
        onNavigateToDuplicatedProject({
          projectId: result.projectId,
          conversationId: result.conversationId,
          fileName: result.relPath,
        });
      } catch {
        onDuplicateFailed();
      }
    },
    [buildDuplicateName, onDuplicateFailed, onNavigateToDuplicatedProject, port],
  );

  const handleOpenContextDesignSystemDetails = useCallback((system: DesignSystemSummary) => {
    setContextDesignSystemDetails(system);
  }, []);

  const closeContextPluginDetails = useCallback(() => {
    setContextPluginDetails(null);
  }, []);

  const closeContextDesignSystemDetails = useCallback(() => {
    setContextDesignSystemDetails(null);
  }, []);

  return {
    activePluginSnapshot,
    contextPluginDetails,
    contextDesignSystemDetails,
    handleOpenContextPluginDetails,
    handleDuplicateContextPlugin,
    handleOpenContextDesignSystemDetails,
    closeContextPluginDetails,
    closeContextDesignSystemDetails,
  };
}

/** Wirer: binds the real project-view transport port; swap in tests. */
export function useWiredPluginContextDetails(
  appliedPluginSnapshotId: string | undefined,
  buildDuplicateName: (record: InstalledPluginRecord) => string,
  onNavigateToDuplicatedProject: (result: {
    projectId: string;
    conversationId: string;
    fileName: string;
  }) => void,
  onDuplicateFailed: () => void,
): PluginContextDetailsController {
  return usePluginContextDetails(
    projectViewTransportPort,
    appliedPluginSnapshotId,
    buildDuplicateName,
    onNavigateToDuplicatedProject,
    onDuplicateFailed,
  );
}
