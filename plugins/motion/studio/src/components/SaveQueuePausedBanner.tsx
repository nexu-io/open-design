import { useI18n } from "../i18n/I18n";
interface SaveQueuePausedBannerProps {
  message: string;
  /** Resets the save-queue circuit breaker so persistence resumes. */
  onRetry: () => void;
}

/** Alert shown when the DOM-edit save queue circuit breaker pauses persistence. */
export function SaveQueuePausedBanner({ message, onRetry }: SaveQueuePausedBannerProps) {
  const { t } = useI18n();
  return (
    <div
      className="hf-backdrop-in absolute left-1/2 top-14 z-92 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-md border border-red-500/30 bg-red-950/85 px-4 py-2 text-[12px] font-medium text-red-100 shadow-lg shadow-black/30"
      role="alert"
    >
      <span>{message}</span>
      <button
        type="button"
        onClick={onRetry}
        className="rounded-sm border border-red-300/20 px-2 py-1 text-[11px] text-red-100 transition-colors hover:bg-red-400/10 active:scale-[0.98]"
      >
        {t("Retry saving")}</button>
    </div>
  );
}
