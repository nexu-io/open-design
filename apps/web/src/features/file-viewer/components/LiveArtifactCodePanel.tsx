// Wired live-artifact code panel: binds the template/rendered-source loader
// hook to its presentational view.
import { useI18n } from '../../../i18n';
import { useWiredLiveArtifactCode } from '../hooks/useLiveArtifactCode.hooks';
import { LiveArtifactCodePanelView } from './LiveArtifactCodePanelView';

export function LiveArtifactCodePanel({
  projectId,
  artifactId,
  reloadKey,
}: {
  projectId: string;
  artifactId: string;
  reloadKey: number;
}) {
  const { t } = useI18n();
  const { variant, setVariant, code, loading, failed } = useWiredLiveArtifactCode(projectId, artifactId, reloadKey);

  return (
    <LiveArtifactCodePanelView
      t={t}
      variant={variant}
      onSetVariant={setVariant}
      code={code}
      loading={loading}
      failed={failed}
    />
  );
}
