import { useI18n } from "../i18n/I18n";
interface StudioToastProps {
  message: string;
  tone?: "error" | "info";
  /** Plays the exit animation when true (owner removes the node after ~160ms). */
  leaving?: boolean;
  onDismiss?: () => void;
}

export function StudioToast({ message, tone, leaving, onDismiss }: StudioToastProps) {
  const { t } = useI18n();
  const isError = tone === "error";
  return (
    <div
      role={isError ? "alert" : "status"}
      className={`motion-reduce:animate-none ${leaving ? "hf-toast-exit" : "hf-toast-enter"}`}
    >
      <div
        className={`relative flex max-w-[min(420px,calc(100vw-48px))] items-center gap-3 overflow-hidden rounded-2xl py-3 pl-4 pr-2 text-[12px] ${toastSurface(isError)}`}
      >
        <span
          className={`min-w-0 wrap-break-word leading-5 ${isError ? "text-danger-ink" : "text-text-0"}`}
        >
          {message}
        </span>
        {onDismiss && (
          <button
            type="button"
            onClick={onDismiss}
            className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md text-neutral-500 transition-colors hover:bg-hover hover:text-neutral-300"
            aria-label={t("Dismiss")}
          >
            <svg
              width="10"
              height="10"
              viewBox="0 0 10 10"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
            >
              <path d="M2 2l6 6M8 2l-6 6" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
}

export function toastSurface(isError: boolean): string {
  return `border shadow-popover bg-raised ${isError ? "border-danger/40" : "border-border"}`;
}
