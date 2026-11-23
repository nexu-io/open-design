import { useT } from '../../i18n';
import type { modelProvenance } from '../../runtime/chat/run-model';

export function RunModelIdentity({
  identity: { requested, dispatched, reported },
}: { identity: ReturnType<typeof modelProvenance> }) {
  const t = useT();
  const selected = requested && dispatched && requested !== dispatched
    ? `${requested} → ${dispatched}`
    : dispatched ?? requested;
  if (!selected && !reported) return null;
  return (
    <span data-testid="run-model-identity" style={{ minWidth: 0, overflowWrap: 'anywhere' }}>
      {selected && selected !== reported ? <>{selected} ({t('common.selected')})</> : null}
      {selected && reported && selected !== reported ? ' · ' : null}
      {reported ? <>{t('settings.model')} {reported}</> : null}
    </span>
  );
}
