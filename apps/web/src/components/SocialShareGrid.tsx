import { useEffect, useRef, useState } from 'react';
import type { SocialSharePlatform, SocialShareResponse } from '@open-design/contracts';
import { useT } from '../i18n';
import { copyToClipboard } from '../lib/copy-to-clipboard';
import { RemixIcon } from './RemixIcon';

const PLATFORM_ICON: Record<SocialSharePlatform, string> = {
  x: 'twitter-x-line',
  linkedin: 'linkedin-box-line',
  facebook: 'facebook-circle-line',
  reddit: 'reddit-line',
  telegram: 'telegram-line',
  whatsapp: 'whatsapp-line',
  weibo: 'weibo-line',
  line: 'line-line',
  instagram: 'instagram-line',
  xiaohongshu: 'book-open-line',
};

const PLATFORM_LABEL_KEY: Record<
  SocialSharePlatform,
  | 'socialShare.platform.x'
  | 'socialShare.platform.linkedin'
  | 'socialShare.platform.facebook'
  | 'socialShare.platform.reddit'
  | 'socialShare.platform.telegram'
  | 'socialShare.platform.whatsapp'
  | 'socialShare.platform.weibo'
  | 'socialShare.platform.line'
  | 'socialShare.platform.instagram'
  | 'socialShare.platform.xiaohongshu'
> = {
  x: 'socialShare.platform.x',
  linkedin: 'socialShare.platform.linkedin',
  facebook: 'socialShare.platform.facebook',
  reddit: 'socialShare.platform.reddit',
  telegram: 'socialShare.platform.telegram',
  whatsapp: 'socialShare.platform.whatsapp',
  weibo: 'socialShare.platform.weibo',
  line: 'socialShare.platform.line',
  instagram: 'socialShare.platform.instagram',
  xiaohongshu: 'socialShare.platform.xiaohongshu',
};

interface Props {
  share: SocialShareResponse;
  className?: string;
  // Fired at click time for both the intent and copy flavours so callers can
  // attach analytics without each one re-implementing the branch logic.
  onShare?: (platform: SocialSharePlatform) => void;
  onAfterShare?: () => void;
}

export function SocialShareGrid({ share, className, onShare, onAfterShare }: Props) {
  const t = useT();
  const [feedbackPlatform, setFeedbackPlatform] = useState<SocialSharePlatform | null>(null);
  const feedbackTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (feedbackTimerRef.current != null) clearTimeout(feedbackTimerRef.current);
    },
    [],
  );
  const platforms = Array.isArray(share.platforms) ? share.platforms : [];

  const copyAndOpen = async (
    platform: SocialSharePlatform,
    entryUrl: string | undefined,
  ) => {
    const pendingWindow = entryUrl ? window.open('about:blank', '_blank') : null;
    const ok = await copyToClipboard(share.copyText);
    if (!ok) {
      pendingWindow?.close();
      return;
    }
    setFeedbackPlatform(platform);
    if (feedbackTimerRef.current != null) clearTimeout(feedbackTimerRef.current);
    feedbackTimerRef.current = setTimeout(() => {
      feedbackTimerRef.current = null;
      setFeedbackPlatform((current) => (current === platform ? null : current));
    }, 1600);
    if (entryUrl) {
      if (pendingWindow) {
        pendingWindow.opener = null;
        pendingWindow.location.href = entryUrl;
      } else {
        window.open(entryUrl, '_blank', 'noopener,noreferrer');
      }
    }
    onAfterShare?.();
  };

  return (
    <div className={`social-share-grid${className ? ` ${className}` : ''}`}>
      {platforms.map((target) => {
        const label = t(PLATFORM_LABEL_KEY[target.platform]);
        const icon = <RemixIcon name={PLATFORM_ICON[target.platform]} size={15} />;
        if (target.mode === 'intent' && target.shareUrl) {
          return (
            <a
              key={target.platform}
              className={`social-share-button social-share-button--${target.platform}`}
              href={target.shareUrl}
              target="_blank"
              rel="noreferrer noopener"
              onClick={() => {
                onShare?.(target.platform);
                onAfterShare?.();
              }}
            >
              <span className="social-share-button__icon" aria-hidden>{icon}</span>
              <span>{label}</span>
            </a>
          );
        }
        return (
          <button
            key={target.platform}
            type="button"
            className={`social-share-button social-share-button--${target.platform}`}
            onClick={() => {
              onShare?.(target.platform);
              void copyAndOpen(target.platform, target.entryUrl);
            }}
          >
            <span className="social-share-button__icon" aria-hidden>{icon}</span>
            <span>
              {feedbackPlatform === target.platform
                ? t('socialShare.copied')
                : label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
