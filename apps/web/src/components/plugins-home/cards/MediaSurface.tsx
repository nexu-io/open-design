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
import type { CSSProperties } from 'react';
import type { MediaPreviewSpec } from '../preview';

/**
 * Poster aspect ratios measured this session, keyed by poster URL.
 *
 * Component state is not enough to remember a shape. The <img> unmounts every
 * time a tile drifts past the mount margin, and the whole card unmounts on a
 * gallery tab switch — so a host that sizes itself from the picture forgot every
 * ratio the moment you looked away, and came back to a wall of identical
 * placeholder boxes (measured: 45 of 46 tiles back at the floor, one click after
 * they had all been measured). Keyed by URL rather than plugin id because the
 * ratio is a property of the file, so the same poster reused by two records is
 * measured once.
 *
 * Bounded by the catalogue: one entry per poster the session has actually
 * looked at, against ~460 records. Not persisted — a reload re-measures, which
 * is the same cost as the first visit.
 */
const posterRatios = new Map<string, number>();

function cachedRatio(poster: string | null): number | null {
  return poster ? (posterRatios.get(poster) ?? null) : null;
}

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
  // The poster's own aspect ratio, once it has reported real pixels — published
  // on this element as `--poster-ratio` plus a `data-poster-loaded` flag,
  // because a host that sizes itself FROM the image needs both.
  //
  // It has to be REMEMBERED, not read off the live <img>. The tag below
  // unmounts whenever the tile leaves the mount margin (`inView`, once: false),
  // and a host whose height came from the mounted image would snap back to its
  // placeholder size on every unmount — in the community gallery's 图片
  // masonry that re-balances all four columns, so scrolling became a continuous
  // reflow of the whole grid. This state outlives the <img>, so the box keeps
  // its shape whether or not the picture is currently in the DOM. Fixed-ratio
  // hosts (the plugins gallery) read neither. Reset with the URL, same
  // reasoning as the failure flag above.
  const [posterRatio, setPosterRatio] = useState<number | null>(() =>
    cachedRatio(preview.poster),
  );
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    setPosterLoadFailed(false);
    // Back to what is KNOWN about the new URL, not to nothing: a poster this
    // session has already measured keeps its shape from the first frame, so a
    // revisited tile never re-opens at the placeholder size.
    setPosterRatio(cachedRatio(preview.poster));
  }, [preview.poster]);
  // Some Chromium builds paint a solid black frame for an instant right as a
  // freshly-mounted `<video>` starts decoding, before its first real frame is
  // ready — with the video layered above the poster (z-index above the img),
  // that flash briefly blacks out the whole card (reported against the
  // community template gallery). Keep the video transparent until it reports
  // real decoded data so the poster underneath stays visible through that
  // gap instead of a black flash. Resets only on a genuine source change —
  // the element stays mounted while on-screen, so hover/idle toggling must
  // not re-hide an already-decoded frame.
  const [videoReady, setVideoReady] = useState(false);
  useEffect(() => {
    setVideoReady(false);
  }, [preview.videoUrl]);

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
      data-poster-loaded={posterRatio ? 'true' : undefined}
      style={posterRatio ? ({ '--poster-ratio': String(posterRatio) } as CSSProperties) : undefined}
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
          onLoad={(event) => {
            const { naturalWidth, naturalHeight } = event.currentTarget;
            if (naturalWidth > 0 && naturalHeight > 0) {
              const ratio = naturalWidth / naturalHeight;
              // Key on the PROP, not `img.src`: the element reports a resolved
              // absolute URL, and a relative poster (the daemon's baked ones)
              // would then be written under a key no lookup ever asks for.
              if (preview.poster) posterRatios.set(preview.poster, ratio);
              setPosterRatio(ratio);
            }
          }}
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
          onLoadedData={() => setVideoReady(true)}
          style={{ pointerEvents: 'none', opacity: videoReady ? 1 : 0 }}
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
