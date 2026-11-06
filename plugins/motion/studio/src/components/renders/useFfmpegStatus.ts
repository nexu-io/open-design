import { useCallback, useEffect, useRef, useState } from "react";
import { studioApiFetch } from "../../utils/studioApiFetch";

/**
 * What the dev server knows about this machine's FFmpeg, as reported by
 * `GET /api/environment/ffmpeg`. Studio asks when the Render panel opens so a
 * missing encoder is a prompt with an install command, not a failed export an
 * hour into the work.
 */
export interface FfmpegStatus {
  ok: boolean;
  /** Short headline, e.g. "FFmpeg not found". Absent when ok. */
  title?: string;
  /** Why it cannot run, in the server's words. Absent when ok. */
  detail?: string;
  /** Prose remediation, including the manual route where one exists. */
  hint?: string;
  /** A single pasteable install command, when this platform has one. */
  command?: string;
}

/**
 * `null` means "no answer", NOT "missing". An unreachable or older dev server
 * is not evidence that FFmpeg is absent, and blocking Export on a failed probe
 * would lock out people whose setup is fine. Unknown always fails open.
 */
type ProbeResult = FfmpegStatus | null;

/**
 * One line naming the problem and the fix, for the render row Studio writes
 * when it refuses to start. Prefers the command over the prose hint: the row
 * is narrow, and the command is the part the user acts on.
 */
export function ffmpegInstallMessage(status: FfmpegStatus | null): string {
  const title = status?.title ?? "FFmpeg not found";
  const remedy = status?.command ?? status?.hint;
  return remedy ? `${title}. Install it with: ${remedy}` : `${title}. Install FFmpeg to export.`;
}

// The Render panel unmounts on every right-panel tab switch, and each miss
// re-probes the filesystem server-side. Remember the answer for the tab's life.
let cached: ProbeResult = null;

const asText = (value: unknown): string | undefined =>
  typeof value === "string" && value ? value : undefined;

/** Parses the endpoint's answer, or `null` for anything that is not one. */
function parseStatus(body: unknown): ProbeResult {
  if (typeof body !== "object" || body === null) return null;
  const { ok, title, detail, hint, command } = body as Record<string, unknown>;
  if (typeof ok !== "boolean") return null;
  return {
    ok,
    title: asText(title),
    detail: asText(detail),
    hint: asText(hint),
    command: asText(command),
  };
}

async function probe(): Promise<ProbeResult> {
  try {
    const res = await studioApiFetch("/api/environment/ffmpeg");
    return res.ok ? parseStatus(await res.json()) : null;
  } catch {
    return null;
  }
}

export function useFfmpegStatus(): {
  status: ProbeResult;
  checking: boolean;
  recheck: () => void;
} {
  const [status, setStatus] = useState<ProbeResult>(cached);
  const [checking, setChecking] = useState(cached === null);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const run = useCallback(async () => {
    setChecking(true);
    const next = await probe();
    cached = next;
    if (!mounted.current) return;
    setStatus(next);
    setChecking(false);
  }, []);

  useEffect(() => {
    if (cached !== null) return;
    void run();
  }, [run]);

  // Someone who just installed FFmpeg should not have to restart Studio to
  // prove it. Drops the cache so the server re-probes rather than replaying
  // the stale "not found" it already cached against.
  const recheck = useCallback(() => {
    cached = null;
    void run();
  }, [run]);

  return { status, checking, recheck };
}
