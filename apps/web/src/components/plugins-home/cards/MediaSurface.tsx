// Image / video preview surface for the plugins-home gallery.
//
// Renders the plugin's poster as the card's hero. For plain video-template
// plugins the `<video>` only mounts on hover, so an idle gallery just fetches
// posters.
//
// Baked plugin previews (the home gallery's html plugins, pre-rendered by
// scripts/bake-plugin-previews.mjs) carry a `loopHoldMs`: the clip leads with a
// `[0, holdMs]` in-place-animation span, then pans top->bottom. We treat those
// as a cheap stand-in for the old live hover-pan iframe — the `<video>` mounts
// as soon as the tile is on-screen and loops the in-place span while idle
// (animated pages still look alive), and on hover jumps to the pan. The element
// stays mounted the whole time it's on-screen, so hover never remounts/reloads
// the source and can't flash black at the hand-off, and `preload="auto"`
// buffers the whole small clip up front so the idle->pan jump never stalls.

import { useEffect, useRef, useState } from 'react';
import type { MediaPreviewSpec } from '../preview';

interface Props {
  preview: MediaPreviewSpec;
  pluginTitle: string;
  inView: boolean;
}

export function MediaSurface({ preview, pluginTitle, inView }: Props) {
  const [hovering, setHovering] = useState(false);
  // Track per-URL poster load failure so a 404 / decode error / dead
  // host swaps in the typographic fallback instead of leaving the
  // browser's default broken-image glyph on the card. Reset whenever
  // the poster URL itself changes — the previous failure must not
  // poison a freshly-assigned URL (filter rotations, daemon
  // repopulating a preview after an offline flip). #2955.
  const [posterLoadFailed, setPosterLoadFailed] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setPosterLoadFailed(false);
  }, [preview.poster]);

  const isVideo = preview.mediaType === 'video' && Boolean(preview.videoUrl);
  const holdMs = preview.loopHoldMs ?? null;
  // Baked hover-pan clips (holdMs set) play as soon as they're on-screen so the
  // in-place span can loop while idle; plain video-template plugins keep the
  // cheaper poster-until-hover behaviour.
  const idlePlays = isVideo && holdMs != null;
  const showVideo = inView && isVideo && (idlePlays || hovering);

  // Idle: loop the leading [0, holdMs] in-place-animation span. Hover: jump to
  // holdMs and loop the pan span [holdMs, end] so it responds immediately
  // instead of waiting out the remaining hold. One element, never remounted
  // while on-screen.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showVideo || holdMs == null) return;
    const hold = holdMs / 1000;
    const clamp = (t: number) => {
      if (hovering) {
        if (t < hold) v.currentTime = hold;
      } else if (t >= hold) {
        v.currentTime = 0;
      }
    };
    // Frame-accurate loop boundary. `timeupdate` fires only ~4x/s, which let the
    // idle loop overshoot ~250ms past holdMs and briefly reveal the pan (a small
    // downward lurch each cycle). requestVideoFrameCallback fires once per
    // rendered frame, so the reset lands within ~1 frame of the boundary.
    type RVFCVideo = HTMLVideoElement & {
      requestVideoFrameCallback?: (cb: (now: number, meta: { mediaTime: number }) => void) => number;
      cancelVideoFrameCallback?: (id: number) => void;
    };
    const vv = v as RVFCVideo;
    clamp(v.currentTime);
    if (typeof vv.requestVideoFrameCallback === 'function') {
      let id = 0;
      const tick = (_now: number, meta: { mediaTime: number }) => {
        clamp(meta?.mediaTime ?? v.currentTime);
        id = vv.requestVideoFrameCallback!(tick);
      };
      id = vv.requestVideoFrameCallback(tick);
      return () => vv.cancelVideoFrameCallback?.(id);
    }
    const onTime = () => clamp(v.currentTime);
    v.addEventListener('timeupdate', onTime);
    return () => v.removeEventListener('timeupdate', onTime);
  }, [showVideo, hovering, holdMs]);

  // The `autoplay` attribute alone doesn't reliably start a freshly-mounted
  // muted clip here (Electron/Chromium leaves it paused at readyState 1), so
  // kick it off explicitly on mount and again once it has buffered.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showVideo) return;
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    tryPlay();
    v.addEventListener('canplay', tryPlay);
    return () => v.removeEventListener('canplay', tryPlay);
  }, [showVideo]);

  const hasPoster = Boolean(preview.poster);
  const useFallback = !hasPoster || posterLoadFailed;

  return (
    <div
      className="plugins-home__media"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {inView && preview.poster && !posterLoadFailed ? (
        <img
          className="plugins-home__media-img"
          src={preview.poster}
          alt={`${pluginTitle} preview`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => setPosterLoadFailed(true)}
        />
      ) : useFallback ? (
        <MediaFallback pluginTitle={pluginTitle} />
      ) : (
        <div
          className={`plugins-home__media-skeleton${inView ? ' is-active' : ''}`}
          aria-hidden
        />
      )}
      {showVideo ? (
        <video
          ref={videoRef}
          className="plugins-home__media-video"
          src={preview.videoUrl ?? undefined}
          poster={preview.poster ?? undefined}
          autoPlay
          muted
          playsInline
          loop
          // On-screen baked clips buffer the whole (small ~450KB) clip so the
          // idle->pan hand-off never stalls; hover-only videos stay lazy.
          preload={idlePlays ? 'auto' : 'none'}
          // Look like an inert iframe thumbnail: no native controls or PiP, and
          // clicks fall through to the card (open detail) instead of the video.
          disablePictureInPicture
          tabIndex={-1}
          aria-hidden
          style={{ pointerEvents: 'none' }}
        />
      ) : null}
    </div>
  );
}

function MediaFallback({
  pluginTitle,
}: {
  pluginTitle: string;
}) {
  const trimmed = pluginTitle.trim();
  const glyph = String.fromCodePoint(trimmed.codePointAt(0) ?? 0x2022).toUpperCase();
  return (
    <div className="plugins-home__media-fallback" aria-hidden>
      <span className="plugins-home__media-fallback-glyph">{glyph}</span>
    </div>
  );
}
