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
