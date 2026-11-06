import { useI18n } from "../i18n/I18n";
import { buildProjectApiPath } from "../utils/projectRouting";
import { useEffect, useState } from "react";
import { IMAGE_EXT, VIDEO_EXT, AUDIO_EXT } from "../utils/mediaTypes";
import { encodeUrlPath } from "@hyperframes/parsers";

function MediaErrorPanel({ name, filePath }: { name: string; filePath: string }) {
  const { t } = useI18n();
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-neutral-950 gap-2">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-neutral-600"
        aria-hidden="true"
      >
        <circle cx="12" cy="12" r="10" />
        <line x1="12" y1="8" x2="12" y2="12" strokeLinecap="round" />
        <line x1="12" y1="16" x2="12.01" y2="16" strokeLinecap="round" />
      </svg>
      <span className="text-sm text-neutral-400 font-medium">{name}</span>
      <span className="text-[11px] text-neutral-600 font-mono">{filePath}</span>
      <span className="text-[10px] text-neutral-500">
        {t("Couldn't load this file. It may be missing or corrupt")}</span>
    </div>
  );
}

export function MediaPreview({ projectId, filePath }: { projectId: string; filePath: string }) {
  const { t } = useI18n();
  const serveUrl = buildProjectApiPath(projectId, `/preview/${encodeUrlPath(filePath)}`);
  const name = filePath.split("/").pop() ?? filePath;
  const [failure, setFailure] = useState<{ source: string; failed: boolean }>({
    source: serveUrl,
    failed: false,
  });
  useEffect(() => {
    setFailure({ source: serveUrl, failed: false });
  }, [serveUrl]);
  const failed = failure.source === serveUrl && failure.failed;
  const setFailed = () => setFailure({ source: serveUrl, failed: true });

  if (failed) return <MediaErrorPanel name={name} filePath={filePath} />;

  if (IMAGE_EXT.test(filePath)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-neutral-950">
        <img
          src={serveUrl}
          alt={name}
          onError={setFailed}
          className="max-w-full max-h-[70%] object-contain rounded-sm border border-neutral-800"
        />
        <span className="mt-3 text-[11px] text-neutral-500 font-mono">{filePath}</span>
      </div>
    );
  }

  if (VIDEO_EXT.test(filePath)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-neutral-950">
        <video
          src={serveUrl}
          controls
          onError={setFailed}
          className="max-w-full max-h-[70%] rounded-sm border border-neutral-800"
        />
        <span className="mt-3 text-[11px] text-neutral-500 font-mono">{filePath}</span>
      </div>
    );
  }

  if (AUDIO_EXT.test(filePath)) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-4 bg-neutral-950 gap-3">
        <svg
          width="48"
          height="48"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
          className="text-neutral-600"
        >
          <path d="M9 18V5l12-2v13" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="6" cy="18" r="3" />
          <circle cx="18" cy="16" r="3" />
        </svg>
        <audio src={serveUrl} controls onError={setFailed} className="w-full max-w-[280px]" />
        <span className="text-[11px] text-neutral-500 font-mono">{filePath}</span>
      </div>
    );
  }

  // Fonts and other binary — show info instead of binary dump
  return (
    <div className="flex flex-col items-center justify-center h-full p-4 bg-neutral-950 gap-2">
      <svg
        width="40"
        height="40"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.5"
        className="text-neutral-600"
      >
        <path
          d="M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        <polyline points="14 2 14 8 20 8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <span className="text-sm text-neutral-400 font-medium">{name}</span>
      <span className="text-[11px] text-neutral-600 font-mono">{filePath}</span>
      <span className="text-[10px] text-neutral-600">{t("Binary file: preview not available")}</span>
    </div>
  );
}
