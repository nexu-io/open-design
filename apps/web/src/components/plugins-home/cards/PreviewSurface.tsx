// Switchboard component that renders the right preview surface
// for a plugin card based on the inferred preview kind.
//
// The surface is the visual hero of every card. It lazy-mounts
// expensive content (iframes, network images, video poll loops)
// via IntersectionObserver so a 350-plugin gallery does not
// hammer the daemon on first paint. The text-fallback variant
// short-circuits the lazy mount because it has no off-screen cost.

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
}

export function PreviewSurface({ pluginId, pluginTitle, preview }: Props) {
  const { ref, inView } = useInView<HTMLDivElement>({ rootMargin: '320px' });

  return (
    <div
      ref={ref}
      className={`plugins-home__preview plugins-home__preview--${preview.kind}`}
      data-preview-kind={preview.kind}
    >
      {preview.kind === 'media' ? (
        <MediaSurface preview={preview} pluginTitle={pluginTitle} inView={inView} />
      ) : preview.kind === 'html' ? (
        <HtmlSurface
          preview={preview}
          pluginId={pluginId}
          pluginTitle={pluginTitle}
          inView={inView}
        />
      ) : preview.kind === 'design' ? (
        <DesignSystemSurface preview={preview} />
      ) : (
        <TextSurface pluginTitle={pluginTitle} />
      )}
    </div>
  );
}
