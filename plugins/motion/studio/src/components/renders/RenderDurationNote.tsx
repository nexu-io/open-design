import { useI18n } from "../../i18n/I18n";
function formatEta(ms: number): string {
  const s = Math.round(ms / 1000);
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)}m ${s % 60}s`;
}

export function RenderDurationNote({
  durationMs,
  isRendering,
}: {
  durationMs?: number;
  isRendering: boolean;
}) {
  const { t } = useI18n();
  if (durationMs === undefined || isRendering) return null;
  return (
    <p className="text-step-9 text-text-5 text-center -mt-1.5">
      {t("Last render took")}{" "}{formatEta(durationMs)}
    </p>
  );
}
