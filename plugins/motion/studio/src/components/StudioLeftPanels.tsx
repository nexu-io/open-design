import { useI18n } from "../i18n/I18n";
import { memo, useCallback, type ReactNode } from "react";
import { SourceEditor } from "./editor/SourceEditor";
import { FileTree } from "./editor/FileTree";
import { MediaPreview } from "./MediaPreview";
import { AssetsTab } from "./sidebar/AssetsTab";
import { BlocksTab, type BlockPreviewInfo } from "./sidebar/BlocksTab";
import { CompositionsPanel } from "./sidebar/CompositionsPanel";
import { SidebarLintButton } from "./sidebar/SidebarLintButton";
import { Dock } from "./dock/Dock";
import { useDockLayoutStore } from "./dock/dockLayoutStore";
import { isMediaFile } from "../utils/mediaTypes";
import { useStudioShellContext } from "../contexts/StudioContext";
import { useFileManagerContext } from "../contexts/FileManagerContext";
import { getPersistedRenderSettings } from "./renders/renderSettings";

interface StudioLeftPanelsProps {
  onSelectComposition: (comp: string) => void;
  onAddBlock: (blockName: string) => void;
  onPreviewBlock?: (preview: BlockPreviewInfo | null) => void;
  onLint: () => void;
  linting: boolean;
  lintFindingCount?: number;
  lintHasError?: boolean;
  lintFindingsByFile?: Map<string, { count: number; messages: string[] }>;
  onAddAssetToTimeline?: (path: string) => void;
  onAddCompositionToTimeline?: (path: string) => void;
}

function PanelColumn({ footer, children }: { footer: ReactNode; children: ReactNode }) {
  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
      {footer}
    </div>
  );
}

// fallow-ignore-next-line complexity
export const StudioLeftPanels = memo(function StudioLeftPanels({
  onSelectComposition,
  onAddBlock,
  onPreviewBlock,
  onLint,
  linting,
  lintFindingCount,
  lintHasError,
  lintFindingsByFile,
  onAddAssetToTimeline,
  onAddCompositionToTimeline,
}: StudioLeftPanelsProps) {
  const { projectId, renderQueue, waitForPendingDomEditSaves } = useStudioShellContext();
  const {
    compositions,
    assets,
    editingFile,
    fileTree,
    revealSourceOffset,
    handleFileSelect,
    handleCreateFile,
    handleCreateFolder,
    handleDeleteFile,
    handleRenameFile,
    handleDuplicateFile,
    handleMoveFile,
    handleImportFiles,
    handleContentChange,
  } = useFileManagerContext();

  const handleRenderComposition = useCallback(
    async (comp: string) => {
      // startRender refuses without an encoder and reports why as a row in the
      // Renders panel, which may be closed or behind another tab: bring it up.
      if (renderQueue.ffmpegMissing) {
        useDockLayoutStore.getState().activatePanel("renders");
        return;
      }
      await waitForPendingDomEditSaves();
      const { format, quality, fps, gpu } = getPersistedRenderSettings();
      await renderQueue.startRender({ composition: comp, format, quality, fps, gpu });
    },
    [renderQueue, waitForPendingDomEditSaves],
  );

  const importFiles = async (files: FileList, dir?: string) => {
    await handleImportFiles(files, dir);
  };
  const lintButton = (
    <SidebarLintButton
      onLint={onLint}
      linting={linting}
      findingCount={lintFindingCount}
      hasError={lintHasError}
    />
  );

  return (
    <>
      <Dock.Panel id="compositions">
        <PanelColumn footer={lintButton}>
          <CompositionsPanel
            projectId={projectId}
            compositions={compositions}
            activeComposition={editingFile?.path ?? null}
            onSelect={onSelectComposition}
            onAddToTimeline={onAddCompositionToTimeline}
            onRenderComposition={handleRenderComposition}
            isRendering={renderQueue.isRendering}
            lintFindingsByFile={lintFindingsByFile}
          />
        </PanelColumn>
      </Dock.Panel>
      <Dock.Panel id="assets">
        <PanelColumn footer={lintButton}>
          <AssetsTab
            projectId={projectId}
            assets={assets}
            onImport={importFiles}
            onDelete={handleDeleteFile}
            onRename={handleRenameFile}
            onAddAssetToTimeline={onAddAssetToTimeline}
          />
        </PanelColumn>
      </Dock.Panel>
      <Dock.Panel id="code">
        <PanelColumn footer={lintButton}>
          <div className="flex min-h-0 flex-1">
            {fileTree.length > 0 && (
              <div className="w-[160px] shrink-0 border-r border-neutral-800 overflow-y-auto">
                <FileTree
                  files={fileTree}
                  activeFile={editingFile?.path ?? null}
                  onSelectFile={handleFileSelect}
                  onCreateFile={handleCreateFile}
                  onCreateFolder={handleCreateFolder}
                  onDeleteFile={handleDeleteFile}
                  onRenameFile={handleRenameFile}
                  onDuplicateFile={handleDuplicateFile}
                  onMoveFile={handleMoveFile}
                  onImportFiles={importFiles}
                  lintFindingsByFile={lintFindingsByFile}
                />
              </div>
            )}
            <div className="flex-1 overflow-hidden min-w-0">
              <CodeBody
                projectId={projectId}
                editingFile={editingFile}
                revealOffset={revealSourceOffset}
                onChange={handleContentChange}
              />
            </div>
          </div>
        </PanelColumn>
      </Dock.Panel>
      <Dock.Panel id="catalog">
        <PanelColumn footer={lintButton}>
          <BlocksTab onAddBlock={onAddBlock} onPreviewBlock={onPreviewBlock} />
        </PanelColumn>
      </Dock.Panel>
    </>
  );
});

function CodeBody({
  projectId,
  editingFile,
  revealOffset,
  onChange,
}: {
  projectId: string;
  editingFile: { path: string; content: string | null } | null;
  revealOffset: React.ComponentProps<typeof SourceEditor>["revealOffset"];
  onChange: (content: string) => void;
}) {
  const { t } = useI18n();
  if (!editingFile) {
    return (
      <div className="flex items-center justify-center h-full text-neutral-600 text-sm">
        {t("Select a file to edit")}</div>
    );
  }
  if (isMediaFile(editingFile.path)) {
    return <MediaPreview projectId={projectId} filePath={editingFile.path} />;
  }
  // Never mount the editor on unloaded content: a keystroke would autosave an
  // empty document over the real file.
  if (editingFile.content == null) {
    return (
      <div className="flex h-full items-center justify-center text-[11px] text-neutral-600">
        {t("Loading")}{" "}{editingFile.path}…
      </div>
    );
  }
  return (
    <SourceEditor
      content={editingFile.content}
      filePath={editingFile.path}
      onChange={onChange}
      revealOffset={revealOffset}
    />
  );
}
