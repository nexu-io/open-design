// Image / video preview surface for the plugins-home gallery.
//
// Renders the plugin's poster as the card's hero. When the manifest
// declares an `od.preview.video` URL we mount a `<video>` element on
// hover so users can scrub the looping clip without leaving the
// home view. Until then the poster image is the only thing the
// browser fetches — keeps a 50-tile gallery cheap.

import { useEffect, useState } from 'react';
import type { MediaPreviewSpec } from '../preview';
import { Icon } from '../../Icon';

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
  useEffect(() => {
    setPosterLoadFailed(false);
  }, [preview.poster]);
  const showVideo =
    inView && hovering && preview.mediaType === 'video' && Boolean(preview.videoUrl);
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
        <MediaFallback pluginTitle={pluginTitle} mediaType={preview.mediaType} />
      ) : (
        <div
          className={`plugins-home__media-skeleton${inView ? ' is-active' : ''}`}
          aria-hidden
        />
      )}
      {showVideo ? (
        <video
          className="plugins-home__media-video"
          src={preview.videoUrl ?? undefined}
          autoPlay
          muted
          playsInline
          loop
          preload="none"
        />
      ) : null}
    </div>
  );
}

function MediaFallback({
  mediaType,
  pluginTitle,
}: {
  mediaType: MediaPreviewSpec['mediaType'];
  pluginTitle: string;
}) {
  const trimmed = pluginTitle.trim();
  const glyph = String.fromCodePoint(trimmed.codePointAt(0) ?? 0x2022).toUpperCase();
  const icon = mediaType === 'video' ? 'play' : mediaType === 'audio' ? 'mic' : 'image';
  return (
    <div className="plugins-home__media-fallback" aria-hidden>
      <span className="plugins-home__media-fallback-glyph">{glyph}</span>
      <span className="plugins-home__media-fallback-icon">
        <Icon name={icon} size={15} />
      </span>
    </div>
  );
}
