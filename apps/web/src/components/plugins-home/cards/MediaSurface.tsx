// Image / video preview surface for the plugins-home gallery.
//
// Renders the plugin's poster as the card's hero. When the manifest
// declares an `od.preview.video` URL we mount a `<video>` element on
// hover so users can scrub the looping clip without leaving the
// home view. Until then the poster image is the only thing the
// browser fetches — keeps a 50-tile gallery cheap.

import { useState } from 'react';
import type { MediaPreviewSpec } from '../preview';
import { Icon } from '../../Icon';

interface Props {
  preview: MediaPreviewSpec;
  pluginTitle: string;
  inView: boolean;
}

export function MediaSurface({ preview, pluginTitle, inView }: Props) {
  const [hovering, setHovering] = useState(false);
  const showVideo =
    inView && hovering && preview.mediaType === 'video' && Boolean(preview.videoUrl);
  const hasPoster = Boolean(preview.poster);

  return (
    <div
      className="plugins-home__media"
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {inView && preview.poster ? (
        <img
          className="plugins-home__media-img"
          src={preview.poster}
          alt={`${pluginTitle} preview`}
          loading="lazy"
          decoding="async"
          referrerPolicy="no-referrer"
        />
      ) : !hasPoster ? (
        <MediaFallback pluginTitle={pluginTitle} mediaType={preview.mediaType} />
      ) : (
        <div className="plugins-home__media-skeleton" aria-hidden />
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
      {preview.mediaType === 'video' && !preview.imageOnly ? (
        <span className="plugins-home__media-badge" aria-hidden>
          <Icon name="play" size={12} />
        </span>
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
