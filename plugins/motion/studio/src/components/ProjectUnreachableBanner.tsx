import { useI18n } from "../i18n/I18n";
import { useEffect, useState } from "react";
import { studioApiFetch } from "../utils/studioApiFetch";

interface ServedProject {
  id: string;
  title?: string;
}

interface ProjectUnreachableBannerProps {
  /** The project this tab was opened for and the server cannot resolve. */
  projectId: string;
}

/**
 * Shown when the running Studio cannot resolve this tab's project id.
 *
 * Why this exists: a tab whose project the server does not serve fails every
 * read with a 404, so every edit silently takes the server path and nothing
 * lands. The user sees a normal-looking editor that does not save. In the
 * CLI-embedded host — the only host that reports telemetry, since
 * `telemetry/policy.ts` suppresses Vite dev — the cause is almost always that
 * this Studio is serving a *different* project: `hyperframes preview` reuses
 * port 3002, so starting it on another folder takes the port from under an
 * open tab, and the project it was pointed at is untouched on disk.
 *
 * The wording is deliberately narrower than "this project is gone". We can see
 * which project this server serves; we cannot see why it does not serve this
 * one, and nothing here is lost.
 */
export function ProjectUnreachableBanner({ projectId }: ProjectUnreachableBannerProps) {
  const { t } = useI18n();
  const [served, setServed] = useState<ServedProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    // A list we could not read is not evidence of anything, so a failed fetch
    // leaves `served` empty and the banner falls back to the vague wording
    // rather than claiming this Studio serves nothing.
    studioApiFetch("/api/projects")
      .then((res) => (res.ok ? res.json() : { projects: [] }))
      .then((data: { projects?: ServedProject[] }) => {
        if (!cancelled) setServed(data.projects ?? []);
      })
      .catch(() => {
        if (!cancelled) setServed([]);
      });
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // Withheld until the list arrives: which wording applies is a claim about
  // what this server serves, and guessing it would flash the wrong one.
  if (served === null) return null;

  // Exactly one project served, and it is not this tab's. Under the CLI host
  // that is the whole truth, and it names both sides. With several projects we
  // cannot tell a rename from a deletion, so we do not pretend to.
  const soleProject = served.length === 1 && served[0].id !== projectId ? served[0] : null;
  const servedLabel = soleProject?.title ?? soleProject?.id;

  return (
    <div
      role="alert"
      className="hf-backdrop-in absolute left-1/2 top-14 z-92 flex max-w-[calc(100vw-32px)] -translate-x-1/2 items-center gap-3 rounded-md border border-amber-500/30 bg-amber-950/85 px-4 py-2 text-[12px] font-medium text-amber-100 shadow-lg shadow-black/30"
    >
      {soleProject ? (
        <>
          <span>
            {t("This Studio is serving")}{" "}<strong>{servedLabel}</strong>{t(". This tab was opened for")}{" "}
            <strong>{projectId}</strong>.
          </span>
          {/* Reloading re-runs the mount-time hash check, which rewrites the hash
              to the project this server actually serves. That is the same
              fallback a fresh load performs, so the button promises nothing
              beyond what a reload already does. */}
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="shrink-0 rounded-sm border border-amber-300/20 px-2 py-1 text-[11px] text-amber-100 transition-colors hover:bg-amber-400/10 active:scale-[0.98]"
          >
            {t("Open")}{" "}{servedLabel}
          </button>
        </>
      ) : (
        <span>{t("Couldn't open this project. It may have been renamed, moved, or deleted.")}</span>
      )}
    </div>
  );
}
