import { useId } from 'react';
import styles from './FileSyncBadge.module.css';

/**
 * The two transient file-sync states a team-shared project's tab can be in.
 * `downloading` — a non-owner member's local copy has not yet caught up to
 * the published head (pulling FROM the team's shared source). `uploading` —
 * the project owner's local edits have not yet been published (pushing TO
 * the vela resource hub). Mirrors `ProjectSyncState` at the two ends that
 * matter to a viewer: a member never uploads, an owner never downloads.
 */
export type FileSyncBadgeState = 'downloading' | 'uploading';

export interface FileSyncBadgeProps {
  state: FileSyncBadgeState;
  /** Pixel size of the icon's bounding box. Matches the file-type icon it replaces. */
  size?: number;
  title?: string;
}

/**
 * Animated stand-in for a file's type icon while its content is mid-sync.
 * Two looping-arrow SVGs (product-provided assets, verbatim keyframes) —
 * see the design brief for recvqghymxqQQq. `useId()` scopes every element id
 * so multiple open tabs can render the same badge simultaneously without
 * colliding on a duplicate DOM id or a `url(#id)` clip-path reference
 * resolving to the wrong element.
 */
export function FileSyncBadge({ state, size = 13, title }: FileSyncBadgeProps) {
  return (
    <span className={styles.badge} style={{ width: size, height: size }} title={title}>
      {state === 'downloading' ? <DownloadingIcon size={size} /> : <UploadingIcon size={size} />}
    </span>
  );
}

/** Circular looping-arrow "pulling content in" icon (下载.svg, verbatim). */
function DownloadingIcon({ size }: { size: number }) {
  const uid = useId().replace(/[:]/g, '');
  const clipId = `${uid}-clip`;
  const arrowAId = `${uid}-a`;
  const arrowBId = `${uid}-b`;
  return (
    <svg width={size} height={size} viewBox="0 0 20 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <style>{`
        @keyframes ${uid}-kf-a {
          0% {
            animation-timing-function: cubic-bezier(0.642, -0.003, 0.4, 1.4);
            transform: translateX(14px) translateY(14px) translateX(0px) translateY(0px) rotate(-3.142rad) scaleX(1) scaleY(1) skewX(0rad);
          }
          50.5% {
            transform: translateX(14px) translateY(14px) translateX(0px) translateY(16px) rotate(-3.142rad) scaleX(1) scaleY(1) skewX(0rad);
          }
          100% {
            transform: translateX(14px) translateY(14px) translateX(0px) translateY(16px) rotate(-3.142rad) scaleX(1) scaleY(1) skewX(0rad);
          }
        }
        #${arrowAId} {
          transform-origin: 0 0;
          animation: ${uid}-kf-a 0.6s linear infinite;
        }
        @keyframes ${uid}-kf-b {
          0% {
            transform: translateX(14px) translateY(-33px) translateX(0px) translateY(30px) rotate(-3.142rad) scaleX(1) scaleY(1) skewX(0rad);
          }
          50.5% {
            animation-timing-function: cubic-bezier(0.59, -0.009, 0.4, 1.4);
            transform: translateX(14px) translateY(-33px) translateX(0px) translateY(30px) rotate(-3.142rad) scaleX(1) scaleY(1) skewX(0rad);
          }
          100% {
            transform: translateX(14px) translateY(-33px) translateX(0px) translateY(47px) rotate(-3.142rad) scaleX(1) scaleY(1) skewX(0rad);
          }
        }
        #${arrowBId} {
          transform-origin: 0 0;
          animation: ${uid}-kf-b 0.6s linear infinite;
        }
      `}</style>
      <g clipPath={`url(#${clipId})`}>
        <path
          d="M10 0C15.52 0 20 4.48 20 10C20 15.52 15.52 20 10 20C4.48 20 0 15.52 0 10C0 4.48 4.48 0 10 0ZM10 18C14.42 18 18 14.42 18 10C18 5.58 14.42 2 10 2C5.58 2 2 5.58 2 10C2 14.42 5.58 18 10 18Z"
          fill="currentColor"
        />
        <path id={arrowAId} transform="translate(14 14) rotate(-180)" d="M5 4V8H3V4H0L4 0L8 4H5Z" fill="currentColor" />
        <path id={arrowBId} transform="translate(14 -33) rotate(-180)" d="M5 4V8H3V4H0L4 0L8 4H5Z" fill="currentColor" />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="20" height="20" rx="26" fill="#fff" />
        </clipPath>
      </defs>
    </svg>
  );
}

/** File-with-looping-up-arrow "pushing content out" icon (文件上传.svg, verbatim). */
function UploadingIcon({ size }: { size: number }) {
  const uid = useId().replace(/[:]/g, '');
  const clipId = `${uid}-clip`;
  const arrowAId = `${uid}-a`;
  const arrowBId = `${uid}-b`;
  return (
    <svg width={size} height={(size * 20) / 18} viewBox="0 0 18 20" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden>
      <style>{`
        @keyframes ${uid}-kf-a {
          0% {
            animation-timing-function: cubic-bezier(0.7, -0.4, 0.4, 1.4);
            transform: translateX(5px) translateY(6px) translateX(0px) translateY(0px);
          }
          100% {
            transform: translateX(5px) translateY(6px) translateX(0px) translateY(-17px);
          }
        }
        #${arrowAId} {
          transform-origin: 0 0;
          animation: ${uid}-kf-a 0.6s linear infinite;
        }
        @keyframes ${uid}-kf-b {
          0% {
            animation-timing-function: cubic-bezier(0.7, -0.4, 0.4, 1.4);
            transform: translateX(5px) translateY(25px) translateX(0px) translateY(-3px);
          }
          100% {
            transform: translateX(5px) translateY(25px) translateX(0px) translateY(-19px);
          }
        }
        #${arrowBId} {
          transform-origin: 0 0;
          animation: ${uid}-kf-b 0.6s linear infinite;
        }
      `}</style>
      <g clipPath={`url(#${clipId})`}>
        <path id={arrowAId} transform="translate(5 6)" d="M5 4V8H3V4H0L4 0L8 4H5Z" fill="currentColor" />
        <path id={arrowBId} transform="translate(5 25)" d="M5 4V8H3V4H0L4 0L8 4H5Z" fill="var(--success, #22c55e)" />
        <path
          d="M12 2H2V18H16V6H12V2ZM0 0.9918C0 0.44405 0.44749 0 0.9985 0H13L17.9997 5L18 18.9925C18 19.5489 17.5551 20 17.0066 20H0.9934C0.44476 20 0 19.5447 0 19.0082V0.9918Z"
          fill="currentColor"
        />
      </g>
      <defs>
        <clipPath id={clipId}>
          <rect width="18" height="20" fill="#fff" />
        </clipPath>
      </defs>
    </svg>
  );
}
