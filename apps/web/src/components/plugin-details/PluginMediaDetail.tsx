// Image / video / audio detail surface for the home plugin gallery.
//
// Visually this variant now matches the html-example and design-system
// modals — it reuses PreviewModal so every plugin variant shares the
// same chrome (title + subtitle, primary `Use plugin` CTA, sidebar
// toggle, fullscreen, share menu, close). The stage hosts the
// type-specific media (image / video / audio) via PreviewModal's
// `custom` view kind, and the right-side sidebar carries the prompt
// body + PluginMetaSections so users can read the prompt and inspect
// the manifest from the same column.

import { useEffect, useMemo, useState } from 'react';
import type {
  InstalledPluginRecord,
  PluginManifest,
} from '@open-design/contracts';
import { useT } from '../../i18n';
import { resolvePluginQueryFallback } from '../../state/projects';
import { Icon } from '../Icon';
import { PreviewModal, type PreviewView } from '../PreviewModal';
import { PluginMetaSections } from './PluginMetaSections';
import { PluginShareMenu } from './PluginShareMenu';

interface Props {
  record: InstalledPluginRecord;
  onClose: () => void;
  onUse: (record: InstalledPluginRecord) => void;
  isApplying?: boolean;
}

interface MediaPreview {
  poster: string | null;
  videoUrl: string | null;
  audioUrl: string | null;
  isVideo: boolean;
  isAudio: boolean;
}

function readMedia(record: InstalledPluginRecord): MediaPreview {
  const preview = record.manifest?.od?.preview as
    | {
        type?: unknown;
        poster?: unknown;
        video?: unknown;
        gif?: unknown;
        audio?: unknown;
      }
    | undefined;
  if (!preview) {
    return {
      poster: null,
      videoUrl: null,
      audioUrl: null,
      isVideo: false,
      isAudio: false,
    };
  }
  const poster = typeof preview.poster === 'string' ? preview.poster : null;
  const video = typeof preview.video === 'string' ? preview.video : null;
  const gif = typeof preview.gif === 'string' ? preview.gif : null;
  const audio = typeof preview.audio === 'string' ? preview.audio : null;
  const t = typeof preview.type === 'string' ? preview.type.toLowerCase() : '';
  const isVideo = t === 'video' || Boolean(video);
  const isAudio = t === 'audio' || Boolean(audio);
  return {
    poster: poster ?? gif,
    videoUrl: video,
    audioUrl: audio,
    isVideo,
    isAudio,
  };
}

export function PluginMediaDetail({
  record,
  onClose,
  onUse,
  isApplying,
}: Props) {
  const t = useT();
  const [copied, setCopied] = useState(false);

  const manifest: PluginManifest = record.manifest ?? ({} as PluginManifest);
  const od = manifest.od ?? {};
  const description = manifest.description ?? '';
  const query = resolvePluginQueryFallback(od.useCase?.query);
  const media = useMemo(() => readMedia(record), [record]);
  const hasAsset = Boolean(media.poster || media.videoUrl || media.audioUrl);

  // Reset transient state when the active record swaps so the next
  // open never inherits the previous plugin's copied flag.
  useEffect(() => {
    setCopied(false);
  }, [record.id]);

  function handleCopy() {
    if (!query) return;
    void navigator.clipboard.writeText(query).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    });
  }

  // Stage content — image / video / audio renderer placed in a
  // centered scrollable container so portrait and landscape assets
  // both look good on a wide modal stage.
  const stage = (
    <div
      className="plugin-media-stage"
      data-detail-variant="media"
      data-testid="plugin-details-modal"
      data-plugin-id={record.id}
    >
      {!hasAsset ? (
        <div className="plugin-media-stage__empty">
          {t('fileViewer.previewUnavailable')}
        </div>
      ) : media.isVideo && media.videoUrl ? (
        <video
          className="plugin-media-stage__video"
          src={media.videoUrl}
          poster={media.poster ?? undefined}
          controls
          preload="none"
          playsInline
        />
      ) : media.isAudio && media.audioUrl ? (
        <div className="plugin-media-stage__audio">
          {media.poster ? (
            <img
              className="plugin-media-stage__audio-poster"
              src={media.poster}
              alt={record.title}
              referrerPolicy="no-referrer"
              loading="lazy"
            />
          ) : (
            <div
              className="plugin-media-stage__audio-glyph"
              aria-hidden="true"
            >
              <Icon name="play" size={48} />
            </div>
          )}
          <audio
            className="plugin-media-stage__audio-player"
            src={media.audioUrl}
            controls
            preload="none"
          />
        </div>
      ) : media.poster ? (
        <img
          className="plugin-media-stage__image"
          src={media.poster}
          alt={record.title}
          loading="lazy"
          referrerPolicy="no-referrer"
        />
      ) : null}
    </div>
  );

  const views: PreviewView[] = [
    {
      id: 'media',
      label: media.isVideo ? 'Video' : media.isAudio ? 'Audio' : 'Image',
      custom: stage,
    },
  ];

  // Sidebar — prompt body sits at the top so users see the example
  // prompt as soon as the panel opens; the manifest inspector
  // (PluginMetaSections) stacks underneath so workflow / capabilities
  // / source provenance are part of the same scroll column.
  const sidebar = (
    <div className="plugin-info-pane plugin-media-sidebar">
      {query ? (
        <section className="plugin-media-sidebar__prompt">
          <header className="plugin-media-sidebar__prompt-head">
            <span className="plugin-media-sidebar__prompt-label">
              {t('promptTemplates.promptLabel')}
            </span>
            <button
              type="button"
              className="plugin-media-sidebar__prompt-copy"
              onClick={handleCopy}
            >
              <Icon name={copied ? 'check' : 'copy'} size={12} />
              {copied
                ? t('promptTemplates.copyDone')
                : t('promptTemplates.copyPrompt')}
            </button>
          </header>
          <pre className="plugin-media-sidebar__prompt-body">{query}</pre>
        </section>
      ) : null}
      <PluginMetaSections
        record={record}
        omit={{ description: true, query: true }}
        compact
        heading="Plugin info"
      />
    </div>
  );

  return (
    <PreviewModal
      title={record.title}
      subtitle={description || undefined}
      views={views}
      exportTitleFor={() => record.title}
      onClose={onClose}
      sidebar={{
        label: 'Plugin info',
        defaultOpen: true,
        contentKey: record.id,
        content: sidebar,
      }}
      primaryAction={{
        label: 'Use plugin',
        onClick: () => onUse(record),
        busy: !!isApplying,
        busyLabel: 'Applying…',
        testId: `plugin-details-use-${record.id}`,
      }}
      headerExtras={<PluginShareMenu record={record} variant="inline" />}
    />
  );
}
