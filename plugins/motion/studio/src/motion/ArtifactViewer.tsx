import { lazy, Suspense, type ComponentType } from 'react';
import type { ArtifactKind, SessionArtifact } from '../../../shared/session';
import { useI18n } from '../i18n/I18n';

// Add a viewer adapter here when a mode introduces a new artifact kind.
// The session and browser shell do not own the editor's internal state.
const viewers: Record<ArtifactKind, ComponentType> = {
  'motion-project': lazy(() => import('../App').then(module => ({ default: module.StudioApp }))),
};
export function ArtifactViewer({ artifact }: { artifact: SessionArtifact }) {
  const { t } = useI18n();
  const Viewer = viewers[artifact.kind];
  return <Suspense fallback={<div className="motion-route-state" role="status">{t('Opening project…')}</div>}><Viewer /></Suspense>;
}
