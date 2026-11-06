import { useI18n } from "../i18n/I18n";
import { useCallback, useEffect, useRef, useState } from "react";
import { useStudioShellContext } from "../contexts/StudioContext";
import { useFileManagerContextOptional } from "../contexts/FileManagerContext";
import { resolveTabId } from "../telemetry/tabId";
import { studioApiFetch } from "../utils/studioApiFetch";
import { trackStudioEvent } from "../utils/studioTelemetry";
import {
  GuideCard,
  Swap,
  isWaiting,
  labelOf,
  moodOf,
  type DesktopRoute,
  type Progress,
} from "./DesktopGuideCard";
import { FrameyGlyph } from "./FrameyGlyph";
import { Button, Popover, cn } from "./ui";

// "Install the desktop app": the preview server (`/api/open-in-desktop`) says whether to show it, whether the app is
// here and whether it takes the project. With the app ready a press opens the project in it; otherwise the press
// opens a card where Framey walks through download, install and open.
const ROUTE = "/api/open-in-desktop";
/** How far the pupils travel towards the pointer, in the glyph's own units. */
const GAZE = 2.2;
/** Long enough for the flight to finish before the label comes back. */
const OPENING_MS = 1600;
/** While the card is open and the app is not here yet, how often to ask the preview server again. */
const POLL_MS = 2000;
/** After this long without the app turning up, the card asks whether the download finished. */
const SLOW_MS = 60_000;

type OpenResult = { opened: true } | { opened: false; reason: string; downloadUrl: string };

type Eligibility = "open_in_app" | "download" | "no_app_for_platform";

/** Every Guide step change, for the funnel: never a download counted as an install. */
type GuideStep = "opened" | "closed" | "download_opened" | "install_detected";

/** The download, tagged with this page's telemetry `tab_id` so a later install can be matched to the press. */
const withCta = (url: string): string => {
  const tagged = new URL(url);
  tagged.searchParams.set("hf_cta", resolveTabId());
  return tagged.toString();
};

const eligibilityOf = (route: DesktopRoute): Eligibility =>
  route.handoff ? "open_in_app" : route.downloadUrl ? "download" : "no_app_for_platform";

/** The preview server's answer, or null when there is none (the desktop's own Studio, or no server). */
async function readRoute(): Promise<DesktopRoute | null> {
  const res = await studioApiFetch(ROUTE);
  if (!res.ok) return null;
  const body = (await res.json()) as {
    available?: unknown;
    handoff?: unknown;
    downloadUrl?: unknown;
    os?: unknown;
    installed?: unknown;
  } | null;
  if (!body) return null;
  const downloadUrl = typeof body.downloadUrl === "string" ? body.downloadUrl : null;
  return {
    handoff: body.available === true && body.handoff === true,
    downloadUrl: body.available === true ? downloadUrl : null,
    context: {
      os: typeof body.os === "string" ? body.os : "unknown",
      app_installed: body.installed === true,
      download_available: downloadUrl !== null,
    },
  };
}

/** Null hides the button: no route, or nothing here to open or download. `setRoute` takes a fresher answer. */
function useDesktopRoute() {
  const [route, setRoute] = useState<DesktopRoute | null>(null);
  useEffect(() => {
    let live = true;
    readRoute()
      .then((answered) => {
        if (!live || !answered) return;
        trackStudioEvent("desktop_cta_eligibility", {
          eligibility: eligibilityOf(answered),
          ...answered.context,
        });
        if (answered.handoff || answered.downloadUrl) setRoute(answered);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, []);
  return [route, setRoute] as const;
}

/** One impression per page, once the button is on screen. */
function useImpression(anchor: React.RefObject<HTMLElement | null>, route: DesktopRoute | null) {
  const shown = route !== null;
  const routeRef = useRef(route);
  routeRef.current = route;
  useEffect(() => {
    const el = anchor.current;
    if (!shown || !el) return;
    const record = () => {
      const now = routeRef.current!;
      trackStudioEvent("desktop_cta_impression", {
        eligibility: eligibilityOf(now),
        ...now.context,
      });
    };
    if (typeof IntersectionObserver === "undefined") return record();
    const seen = new IntersectionObserver((entries) => {
      if (!entries.some((entry) => entry.isIntersecting)) return;
      seen.disconnect();
      record();
    });
    seen.observe(el);
    return () => seen.disconnect();
  }, [anchor, shown]);
}

/** Framey looks at the pointer: one listener, one write per frame, no re-render. */
function useGaze(
  anchor: React.RefObject<HTMLElement | null>,
  eye: React.RefObject<SVGGElement | null>,
) {
  useEffect(() => {
    let frame = 0;
    const look = (event: PointerEvent) => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = anchor.current?.getBoundingClientRect();
        if (!box || !eye.current) return;
        const dx = event.clientX - (box.left + box.height / 2);
        const dy = event.clientY - (box.top + box.height / 2);
        const distance = Math.hypot(dx, dy) || 1;
        eye.current.style.transform = `translate(${(dx / distance) * GAZE}px, ${(dy / distance) * GAZE}px)`;
      });
    };
    window.addEventListener("pointermove", look);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", look);
    };
  }, [anchor, eye]);
}

/** While the card is open and the app is not here, ask the preview server again; stops on close or once found. */
function useInstallWatch(watching: boolean, onAnswer: (route: DesktopRoute) => void): void {
  useEffect(() => {
    if (!watching) return;
    let live = true;
    const ask = () =>
      readRoute()
        .then((answered) => live && answered && onAnswer(answered))
        .catch(() => {});
    void ask();
    const timer = setInterval(ask, POLL_MS);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [watching, onAnswer]);
}

const LOOK =
  "hf-framey-trigger gap-1.5 border border-accent/40 bg-accent/10 pl-1 font-semibold text-text-0 enabled:hover:bg-accent/20 hover:bg-accent/20";
const LOOK_FAILED = "border-danger/45 bg-danger/8 text-danger-ink enabled:hover:bg-danger/14";

/** The guide's state and the two actions that move it: the download and the hand-off. */
function useGuide(route: DesktopRoute | null, setRoute: (route: DesktopRoute) => void) {
  const { showToast } = useStudioShellContext();
  const [cardOpen, setCardOpen] = useState(false);
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const [downloaded, setDownloaded] = useState(false);
  const [slow, setSlow] = useState(false);
  const [arrived, setArrived] = useState(false);
  const installed = route?.context.app_installed === true;
  // The funnel counts one install per page, even if the app is removed and found again.
  const installCounted = useRef(false);

  const onAnswer = useCallback(
    (answered: DesktopRoute) => {
      if (!answered.context.app_installed) return;
      setRoute(answered);
      setArrived(true);
      if (installCounted.current) return;
      installCounted.current = true;
      trackStudioEvent("desktop_cta_guide", { step: "install_detected", ...answered.context });
    },
    [setRoute],
  );
  useInstallWatch(cardOpen && route !== null && !installed, onAnswer);

  useEffect(() => {
    if (!downloaded || installed) return;
    setSlow(false);
    const timer = setTimeout(() => setSlow(true), SLOW_MS);
    return () => clearTimeout(timer);
  }, [downloaded, installed]);

  if (!route) return null;
  const context = route.context;
  const guideStep = (step: GuideStep) =>
    trackStudioEvent("desktop_cta_guide", { step, ...context });
  const outcome = (result: "opened" | "sent_to_download" | "failed", reason?: string) =>
    trackStudioEvent("desktop_cta_outcome", {
      outcome: result,
      ...(reason ? { reason } : {}),
      ...context,
    });

  const showCard = (next: boolean) => {
    if (next === cardOpen) return;
    setCardOpen(next);
    guideStep(next ? "opened" : "closed");
  };

  const download = () => {
    if (!route.downloadUrl) return;
    trackStudioEvent("toolbar_action", { action: "get_desktop_app", ...context });
    const tab = window.open(withCta(route.downloadUrl), "_blank");
    if (!tab) {
      showToast(`Get the HyperFrames desktop app at ${route.downloadUrl}`, "info");
      outcome("failed", "download_tab_blocked");
      return;
    }
    tab.opener = null;
    setDownloaded(true);
    outcome("sent_to_download");
    guideStep("download_opened");
  };

  const landed = async (result: OpenResult) => {
    if (result.opened) {
      outcome("opened");
      showCard(false);
      showToast("Opening this project in the HyperFrames desktop app", "info");
      await new Promise((done) => setTimeout(done, OPENING_MS));
      return;
    }
    outcome("failed", result.reason);
    // The app is gone: back to the download. Anything else: say so where the person is, with a way through.
    if (result.reason === "not-installed")
      setRoute({ ...route, handoff: false, context: { ...context, app_installed: false } });
    else setFailed(true);
    showCard(true);
  };

  const open = async () => {
    if (opening) return;
    setOpening(true);
    setFailed(false);
    trackStudioEvent("toolbar_action", { action: "open_in_desktop", ...context });
    try {
      const res = await studioApiFetch(ROUTE, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ cta: resolveTabId() }),
      });
      await landed((await res.json()) as OpenResult);
    } catch {
      outcome("failed", "preview_server_unreachable");
      showToast("Couldn't reach the preview server to open the app", "error");
    } finally {
      setOpening(false);
    }
  };

  const progress: Progress = { route, opening, failed, downloaded, slow, arrived };
  return { progress, cardOpen, showCard, download, open };
}

export function OpenInDesktopButton() {
  const { t } = useI18n();
  const projectDir = useFileManagerContextOptional()?.projectDir ?? null;
  const [route, setRoute] = useDesktopRoute();
  const trigger = useRef<HTMLButtonElement>(null);
  const eye = useRef<SVGGElement>(null);
  useGaze(trigger, eye);
  useImpression(trigger, route);
  const guide = useGuide(route, setRoute);
  if (!guide) return null;
  const { progress, cardOpen, showCard, download, open } = guide;
  const label = labelOf(progress);
  const waiting = isWaiting(progress);

  return (
    <Popover
      open={cardOpen}
      // With the app ready the press is the hand-off itself; everything else opens the card.
      onOpenChange={(next) => {
        if (next && progress.route.handoff && !progress.failed) return void open();
        showCard(next);
      }}
      side="bottom"
      align="end"
      aria-label={t("Get the desktop app")}
      className="w-[360px] overflow-hidden p-0"
      trigger={
        <Button
          ref={trigger}
          variant="ghost"
          data-testid="header-open-in-desktop"
          data-opening={progress.opening || undefined}
          aria-busy={progress.opening || waiting || undefined}
          title={
            progress.route.handoff
              ? t("Open this project in the HyperFrames desktop app")
              : t("Get the free HyperFrames desktop app")
          }
          className={cn(LOOK, progress.failed && LOOK_FAILED)}
          icon={
            <FrameyGlyph size={24} className="hf-framey" eyeRef={eye} mood={moodOf(progress)} />
          }
        >
          <Swap value={label}>{label}</Swap>
          {waiting && (
            <span className="rounded-full bg-on px-1.5 text-[10px] leading-4 font-bold text-accent-ink tabular-nums">
              2 of 3
            </span>
          )}
        </Button>
      }
    >
      <GuideCard
        progress={progress}
        projectDir={projectDir}
        onDownload={download}
        onOpen={() => void open()}
      />
    </Popover>
  );
}
