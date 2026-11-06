import { useI18n } from "../i18n/I18n";
import { ArrowSquareOut, Check, Copy } from "@phosphor-icons/react";
import { useEffect, useState, type ReactNode } from "react";
import { copyTextToClipboard } from "../utils/clipboard";
import { FrameyGlyph, type FrameyMood } from "./FrameyGlyph";
import { Button, cn } from "./ui";

// The desktop-app guide card under OpenInDesktopButton: Framey and three steps (download, install, open), all drawn
// from one `Progress`.

export type DesktopRoute = {
  handoff: boolean;
  downloadUrl: string | null;
  context: { os: string; app_installed: boolean; download_available: boolean };
};

/** The OS for the download, and what "this …" calls the machine. */
const platformName = (os: string): string =>
  os === "darwin" ? "Mac" : os === "linux" ? "Linux" : os === "win32" ? "Windows" : "your computer";
const deviceName = (os: string): string => (os === "darwin" ? "Mac" : "computer");

const NOTE = "mt-0.5 text-step-12 text-text-2 text-pretty";

/** Re-keys on `value`, so text that changes settles in rather than snapping. */
export function Swap({ value, children }: { value: string; children: ReactNode }) {
  return (
    <span key={value} className="hf-guide-swap inline-block">
      {children}
    </span>
  );
}

type StepState = "todo" | "now" | "done" | "bad";
const TODO: StepState = "todo";
const NOW: StepState = "now";
const DONE: StepState = "done";
const BAD: StepState = "bad";

function Step({
  n,
  state,
  title,
  children,
}: {
  n: number;
  state: StepState;
  title: string;
  children: ReactNode;
}) {
  return (
    <li
      className="grid grid-cols-[22px_minmax(0,1fr)] gap-2.5 border-border py-2 not-first:border-t"
      data-step={n}
      data-state={state}
    >
      <span
        className={cn(
          "grid size-[22px] place-items-center rounded-full text-step-11 font-bold tabular-nums",
          state === "now" && "bg-accent text-on-accent shadow-[0_0_0_3px_var(--color-on)]",
          state === "done" && "bg-on text-accent-ink",
          state === "bad" && "bg-danger/15 text-danger-ink",
          state === "todo" && "bg-hover text-text-2",
        )}
      >
        {state === "done" ? <Check size={12} weight="bold" className="hf-guide-tick" /> : n}
      </span>
      <div className="min-w-0">
        <b
          title={title}
          className={cn(
            "block truncate text-step-13 font-semibold",
            state === "todo" ? "text-text-muted" : "text-text-0",
          )}
        >
          {title}
        </b>
        {children}
      </div>
    </li>
  );
}

function Spinner() {
  return (
    <span
      aria-hidden="true"
      className="size-3 shrink-0 animate-spin rounded-full border-2 border-on-hover border-t-accent motion-reduce:animate-none"
    />
  );
}

/** The project folder, with a copy control that confirms for a moment. */
function FolderPath({ dir }: { dir: string }) {
  const { t } = useI18n();
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    if (!copied) return;
    const timer = setTimeout(() => setCopied(false), 1500);
    return () => clearTimeout(timer);
  }, [copied]);
  return (
    <div className="mt-1.5 flex min-w-0 items-center gap-1.5">
      <span
        title={dir}
        data-testid="desktop-guide-folder"
        className="min-w-0 flex-1 truncate rounded-md border border-border bg-bg-0 px-2 py-1.5 font-mono text-step-11 text-text-0"
      >
        {dir}
      </span>
      <Button
        variant="secondary"
        aria-label={copied ? t("Copied") : t("Copy folder path")}
        className="w-ctl px-0"
        onClick={() => void copyTextToClipboard(dir).then((ok) => ok && setCopied(true))}
      >
        {copied ? <Check size={14} className="hf-guide-tick" /> : <Copy size={14} />}
      </Button>
    </div>
  );
}

/** Where the person is: what the button says, how Framey looks, and each step's state all derive from this. */
export type Progress = {
  route: DesktopRoute;
  opening: boolean;
  failed: boolean;
  downloaded: boolean;
  slow: boolean;
  /** The app turned up on this page (not already there): Framey hops once. */
  arrived: boolean;
};

const isInstalled = (p: Progress) => p.route.context.app_installed;
export const isWaiting = (p: Progress) => p.downloaded && !isInstalled(p);

export function moodOf(p: Progress): FrameyMood {
  if (p.opening) return "opening";
  if (p.failed) return "error";
  if (isWaiting(p)) return "thinking";
  return p.arrived ? "found" : "idle";
}

export function labelOf(p: Progress): string {
  if (p.opening) return "Opening in the app…";
  if (p.failed) return "Couldn't open";
  if (p.route.handoff) return "Open in desktop app";
  return isWaiting(p) ? "Finish installing" : "Install the desktop app";
}

function subtitleOf(p: Progress): string {
  if (p.failed) return "Almost there: the last step needs another try.";
  if (!isInstalled(p))
    return "Watch it, click a frame, tell Framey what to change. Three steps, about two minutes.";
  return p.route.handoff
    ? "Everything is ready. One press and you're in."
    : "Almost there: one last step.";
}

type CardProps = {
  progress: Progress;
  projectDir: string | null;
  onDownload: () => void;
  onOpen: () => void;
};

function DownloadStep({ progress, onDownload }: CardProps) {
  const { t } = useI18n();
  const { context, downloadUrl } = progress.route;
  const where = platformName(context.os);
  const installed = isInstalled(progress);
  if (!progress.downloaded && !installed)
    return (
      <Step n={1} state={NOW} title={t("Download HyperFrames for {where}", { where: where })}>
        <p className={NOTE}>{t("Free. Opens hyperframes.studio in a new tab.")}</p>
        <Button
          variant="primary"
          className="mt-2"
          icon={<ArrowSquareOut size={14} />}
          onClick={onDownload}
        >
          {t("Download for")}{" "}{where}
        </Button>
      </Step>
    );
  return (
    <Step n={1} state={DONE} title={t("Download HyperFrames for {where}", { where: where })}>
      <p className={NOTE}>
        {installed ? t("Already on this {value0}.", { value0: deviceName(context.os) }) : t("Started in your browser.")}
        {!installed && downloadUrl && (
          <button
            type="button"
            className="ml-1.5 cursor-pointer font-medium text-accent-ink hover:underline"
            onClick={onDownload}
          >
            {t("Download again")}</button>
        )}
      </p>
    </Step>
  );
}

function InstallStep({ progress }: CardProps) {
  const { t } = useI18n();
  const { os } = progress.route.context;
  if (isInstalled(progress))
    return (
      <Step n={2} state={DONE} title={t("Install it")}>
        <p className={NOTE}>
          <Swap value="found">{t("Found HyperFrames on this")}{" "}{deviceName(os)}.</Swap>
        </p>
      </Step>
    );
  return (
    <Step n={2} state={progress.downloaded ? NOW : TODO} title={t("Install it")}>
      <p className={NOTE}>
        {os === "darwin"
          ? t("Open the download and drag HyperFrames into Applications.")
          : t("Open the download to install HyperFrames.")}
      </p>
      {progress.downloaded && (
        <p className="mt-1.5 flex items-center gap-2 text-step-12 text-text-2" role="status">
          <Spinner />
          <Swap value={String(progress.slow)}>
            {progress.slow ? t("Still looking. Did the download finish?") : t("Looking for the app…")}
          </Swap>
        </p>
      )}
    </Step>
  );
}

function OpenStep({ progress, projectDir, onOpen }: CardProps) {
  const { t } = useI18n();
  const title = t("Open {value0}", { value0: projectDir?.split(/[\\/]/).filter(Boolean).pop() ?? "this project" });
  const folder = projectDir && <FolderPath dir={projectDir} />;
  if (progress.failed)
    return (
      <Step n={3} state={BAD} title={title}>
        <p className={NOTE}>
          {t("The app didn't start. Try again, or open HyperFrames and drop this folder in:")}</p>
        {folder}
        <Button variant="primary" className="mt-2" loading={progress.opening} onClick={onOpen}>
          {t("Try again")}</Button>
      </Step>
    );
  const installed = isInstalled(progress);
  // Installed, but this platform's app cannot take a handed-over project yet: the folder is the way in.
  if (installed && !progress.route.handoff)
    return (
      <Step n={3} state={NOW} title={title}>
        <p className={NOTE}>{t("Open HyperFrames and drop this folder in:")}</p>
        {folder}
      </Step>
    );
  return (
    <Step n={3} state={installed ? NOW : TODO} title={title}>
      <p className={NOTE}>{t("Same project, same files, in the desktop app.")}</p>
      <Button
        variant="primary"
        className="mt-2"
        disabled={!progress.route.handoff}
        loading={progress.opening}
        onClick={onOpen}
      >
        {t("Open in desktop app")}</Button>
    </Step>
  );
}

export function GuideCard(props: CardProps) {
  const { t } = useI18n();
  const { progress } = props;
  const subtitle = subtitleOf(progress);
  return (
    <div data-testid="desktop-guide">
      <div className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-3 bg-linear-to-b from-accent/8 to-transparent px-4 pt-4 pb-3">
        <FrameyGlyph size={46} mood={moodOf(progress)} />
        <div className="min-w-0">
          <p className="text-step-14 font-semibold text-balance text-text-0">
            {t("Edit this video in the desktop app")}</p>
          <p className={NOTE}>
            <Swap value={subtitle}>{subtitle}</Swap>
          </p>
        </div>
      </div>
      <ol className="m-0 grid list-none px-4 pt-1 pb-4">
        <DownloadStep {...props} />
        <InstallStep {...props} />
        <OpenStep {...props} />
      </ol>
    </div>
  );
}
