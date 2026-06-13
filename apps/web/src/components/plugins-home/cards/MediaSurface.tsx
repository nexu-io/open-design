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
// stays mounted across a generous margin, so hover never remounts/reloads the
// source and can't flash black at the hand-off; it only decodes/plays while the
// tile is truly visible, and `preload="metadata"` paints the first frame off the
// faststart header instead of buffering the whole clip up front.

import { useEffect, useRef, useState } from 'react';
import type { MediaPreviewSpec } from '../preview';

interface Props {
  preview: MediaPreviewSpec;
  pluginTitle: string;
  // `inView` (a generous margin) MOUNTS the clip so its first frame is ready
  // before the tile scrolls in; `visible` (no margin) gates actually
  // playing/decoding it, so off-screen tiles in the mount margin stay paused on
  // their poster instead of all spinning up decodes + clip downloads at once.
  inView: boolean;
  visible?: boolean;
}

export function MediaSurface({ preview, pluginTitle, inView, visible = inView }: Props) {
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
  // Prefetch zone: warm the full clip into the HTTP cache a row or two ahead so
  // playback starts instantly on scroll-in instead of buffering from the
  // +faststart header at the moment the tile appears. Keep the root ref stable
  // across card reuse, and gate observer creation on `idlePlays` inside the
  // effect: non-baked media cards pay no observer/rerender cost, while a reused
  // card that flips from non-baked -> baked still subscribes correctly.
  const approachRef = useRef<HTMLDivElement>(null);
  const [approaching, setApproaching] = useState(false);
  useEffect(() => {
    if (!idlePlays) {
      setApproaching(false);
      return;
    }

    const node = approachRef.current;
    if (!node) return;

    if (typeof IntersectionObserver === 'undefined') {
      setApproaching(true);
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          setApproaching(entry.isIntersecting);
        }
      },
      { rootMargin: '1000px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [idlePlays]);
  // Mount across the wider `inView` margin so hover/scroll-in never remounts +
  // reloads the source, but only decode/buffer when truly `visible` (or
  // hovering) — otherwise every tile in the margin runs a simultaneous decode +
  // full-clip download and the gallery stutters / first frames lag.
  const showVideo = inView && isVideo && (idlePlays || hovering);
  const playing = showVideo && ((idlePlays && visible) || hovering);

  // Idle: loop the leading [0, holdMs] in-place-animation span. Hover: jump to
  // holdMs and loop the pan span [holdMs, end] so it responds immediately
  // instead of waiting out the remaining hold. One element, never remounted
  // while on-screen.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !playing || holdMs == null) return;
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
  }, [playing, hovering, holdMs]);

  // The `autoplay` attribute alone doesn't reliably start a freshly-mounted
  // muted clip here (Electron/Chromium leaves it paused at readyState 1), so
  // kick it off explicitly on mount and again once it has buffered.
  useEffect(() => {
    const v = videoRef.current;
    if (!v || !showVideo) return;
    if (!playing) {
      // Mounted but off-screen (in the margin) or idle-disabled: hold the poster
      // frame, don't decode.
      v.pause();
      return;
    }
    const tryPlay = () => {
      const p = v.play();
      if (p && typeof p.catch === 'function') p.catch(() => {});
    };
    tryPlay();
    v.addEventListener('canplay', tryPlay);
    return () => v.removeEventListener('canplay', tryPlay);
  }, [showVideo, playing]);

  const hasPoster = Boolean(preview.poster);
  const useFallback = !hasPoster || posterLoadFailed;

  return (
    <div
      ref={approachRef}
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
          // Tiered preload so scroll-in is instant without saturating the
          // network on first paint. In the wide mount margin: `metadata` (moov +
          // first frame off the +faststart header). Once `approaching` (or
          // hovering): `auto`, warming the whole clip into the HTTP cache a row
          // or two ahead so it plays without a buffering beat. Hover-only video
          // templates stay `none` until hovered.
          preload={approaching || hovering ? 'auto' : idlePlays ? 'metadata' : 'none'}
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
