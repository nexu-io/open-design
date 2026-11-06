import { useI18n } from "../i18n/I18n";
export function StudioSplash({ waiting }: { waiting?: boolean }) {
  const { t } = useI18n();
  return (
    <div className="h-full w-full bg-neutral-950 flex items-center justify-center">
      {waiting ? (
        <div className="flex flex-col items-center gap-3 text-center px-6" role="status">
          <div className="w-4 h-4 rounded-full border-2 border-neutral-700 border-t-neutral-500 animate-spin motion-reduce:animate-none" />
          <p className="text-xs text-neutral-600">
            {t("Waiting for preview server… run")}{" "}
            <code className="text-neutral-500 font-mono">npm run dev</code>
          </p>
        </div>
      ) : (
        <div className="flex flex-col items-center gap-3 text-center px-6" role="status">
          <div className="w-4 h-4 rounded-full bg-studio-accent animate-pulse motion-reduce:animate-none" />
          <p className="text-xs text-neutral-600">{t("Connecting to project…")}</p>
        </div>
      )}
    </div>
  );
}
