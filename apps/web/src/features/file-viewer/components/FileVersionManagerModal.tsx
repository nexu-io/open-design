// Wired file-version-history modal: binds the version-history/restore hook to
// its presentational view.
import type { ProjectFileVersion } from '@open-design/contracts';
import type { TrackingProjectKind } from '@open-design/contracts/analytics';
import { useAnalytics } from '../../../analytics/provider';
import { useI18n } from '../../../i18n';
import type { ProjectFile } from '../../../types';
import { useWiredFileVersionManager } from '../hooks/useFileVersionManager.hooks';
import { FileVersionManagerModalView } from './FileVersionManagerModalView';

export function FileVersionManagerModal({
  projectId,
  projectKind,
  file,
  currentSource,
  entryFrom,
  onClose,
  onRestored,
}: {
  projectId: string;
  projectKind: TrackingProjectKind | null;
  file: ProjectFile;
  currentSource: string | null;
  entryFrom: 'toolbar' | 'more_menu';
  onClose: () => void;
  onRestored: (content: string, version: ProjectFileVersion) => Promise<void> | void;
}) {
  const { locale, t } = useI18n();
  const analytics = useAnalytics();

  const controller = useWiredFileVersionManager({
    projectId,
    projectKind,
    file,
    currentSource,
    entryFrom,
    t,
    locale,
    analytics,
    onClose,
    onRestored,
  });

  return (
    <FileVersionManagerModalView file={file} locale={locale} controller={controller} onClose={onClose} />
  );
}
