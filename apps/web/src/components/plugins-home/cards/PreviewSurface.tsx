// Switchboard component that renders the right preview surface
// for a plugin card based on the inferred preview kind.
//
// The surface is the visual hero of every card. It lazy-mounts
// expensive content (iframes, network images, video poll loops)
// via IntersectionObserver so a 350-plugin gallery does not
// hammer the daemon on first paint. The text-fallback variant
// short-circuits the lazy mount because it has no off-screen cost.

import { useCallback } from 'react';
import type { PluginPreviewSpec } from '../preview';
import { useInView } from '../useInView';
import { DesignSystemSurface } from './DesignSystemSurface';
import { HtmlSurface } from './HtmlSurface';
import { MediaSurface } from './MediaSurface';
import { TextSurface } from './TextSurface';

interface Props {
  pluginId: string;
  pluginTitle: string;
  preview: PluginPreviewSpec;
  // Some small surfaces can opt into wider visibility margins; the Community
  // gallery leaves this false so template arrival does not start many previews.
  eager?: boolean;
}

export function PreviewSurface({ pluginId, pluginTitle, preview, eager = false }: Props) {
  const usesBakedClipKeepalive =
    preview.kind === 'media' && preview.mediaType === 'video' && preview.loopHoldMs != null;
  // Visibility zones:
  //  - `inView` (tight): mount cheap-but-live content — iframes, design surfaces.
  //    Kept tight so a 350-plugin gallery never spins up dozens of live iframes.
  //  - `mediaReady` (medium): fetch cheap media posters a little earlier than
  //    live content, without widening iframe/design-system work.
  //  - `keep` (wide): keep the <video> + poster MOUNTED across a few screens, so
  //    scrolling away and back doesn't remount + reload the clip. The bytes are
  //    HTTP-cached (immutable), but a fresh <video> still re-fetches metadata and
  //    re-decodes the first frame, which reads as a load every scroll-back.
  //  - `visible` (no margin): only DECODE/play while truly on screen, so the
  //    kept-mounted off-screen clips stay paused on their poster instead of all
  //    running simultaneous decodes.
  const { ref: nearRef, inView } = useInView<HTMLDivElement>({
    rootMargin: eager ? '480px' : '120px',
    once: false,
  });
  const { ref: mediaRef, inView: mediaReady } = useInView<HTMLDivElement>({
    rootMargin: eager ? '720px' : '360px',
    once: false,
  });
  const { ref: keepRef, inView: keep } = useInView<HTMLDivElement>({
    rootMargin: eager ? '1800px' : '1500px',
    once: false,
  });
  const { ref: visibleRef, inView: visible } = useInView<HTMLDivElement>({
    rootMargin: '0px',
    once: false,
  });
  // The prefetch zone (warm the full clip a row ahead) lives inside MediaSurface
  // so only baked-clip cards pay for that observer — html/design/text/plain-video
  // tiles can never upgrade `preload`, so they must not rerender on its threshold.
  const setRef = useCallback(
    (node: HTMLDivElement | null) => {
      nearRef.current = node;
      mediaRef.current = node;
      keepRef.current = node;
      visibleRef.current = node;
    },
    [nearRef, mediaRef, keepRef, visibleRef],
  );

  return (
    <div
      ref={setRef}
      className={`plugins-home__preview plugins-home__preview--${preview.kind}`}
      data-preview-kind={preview.kind}
    >
      {preview.kind === 'media' ? (
        <MediaSurface
          preview={preview}
          pluginTitle={pluginTitle}
          inView={usesBakedClipKeepalive ? keep : mediaReady}
          visible={visible}
        />
      ) : preview.kind === 'html' ? (
        <HtmlSurface
          preview={preview}
          pluginId={pluginId}
          pluginTitle={pluginTitle}
          inView={inView}
          eager={eager}
        />
      ) : preview.kind === 'design' ? (
        <DesignSystemSurface preview={preview} inView={inView} />
      ) : (
        <TextSurface pluginTitle={pluginTitle} />
      )}
    </div>
  );
}
