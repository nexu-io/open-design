import { useEffect, useId, useState } from 'react';
import { useT } from '../../i18n';
import styles from './HeroPostcard.module.css';

const STORAGE_KEY = 'od.homeHero.postcardPreset';
const POSTCARD_IMAGES = Array.from(
  { length: 15 },
  (_, index) => `/home-hero/postcards/portrait-${String(index + 1).padStart(2, '0')}.jpg`,
);

function readStoredImage(): string | null {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && POSTCARD_IMAGES.includes(stored) ? stored : null;
  } catch {
    return null;
  }
}

/**
 * Postcard that sits above the home headline: a tilted print with a rotating
 * ring of text and postal cancellation marks. The ring and marks are purely
 * ornamental; the print itself is a button that swaps in a random portrait from the supplied collection.
 */
export function HeroPostcard({
  image = POSTCARD_IMAGES[0] ?? '/home-hero/postcards/portrait-01.jpg',
  ringTextTop = 'The General Intelligence',
  ringTextBottom = 'of New York',
}: {
  image?: string;
  ringTextTop?: string;
  ringTextBottom?: string;
}) {
  const t = useT();
  // The ring's <textPath> references its path by id; scope it per instance.
  const pathId = `${useId()}-ring`;
  // Read after mount so server and first client render agree.
  const [customImage, setCustomImage] = useState<string | null>(null);
  useEffect(() => {
    setCustomImage(readStoredImage());
  }, []);

  function changeImage() {
    const candidates = POSTCARD_IMAGES.filter((src) => src !== (customImage ?? image));
    const next = candidates[Math.floor(Math.random() * candidates.length)];
    if (!next) return;
    setCustomImage(next);
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // The image still changes when storage is unavailable.
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.stage}>
        <button
          type="button"
          className={styles.card}
          aria-label={t('homeHero.postcardChange')}
          title={t('homeHero.postcardChange')}
          data-testid="home-hero-postcard"
          onClick={changeImage}
        >
          <img
            className={`${styles.photo} ${styles.photoCustom}`}
            src={customImage ?? image}
            alt=""
            draggable={false}
          />
          <svg className={styles.ring} viewBox="0 0 140 140" aria-hidden>
            <defs>
              <path
                id={pathId}
                d="M 70,70 m -50,0 a 50,50 0 1,1 100,0 a 50,50 0 1,1 -100,0"
                fill="transparent"
              />
            </defs>
            <text className={styles.ringText}>
              <textPath href={`#${pathId}`} startOffset="0%">
                {ringTextTop} • {ringTextBottom} •
              </textPath>
            </text>
          </svg>
          <svg className={styles.marks} viewBox="0 0 100 60" aria-hidden>
            {[15, 25, 35].map((y) => (
              <path
                key={y}
                d={`M 10 ${y} Q 20 ${y - 5} 30 ${y} Q 40 ${y + 5} 50 ${y} Q 60 ${y - 5} 70 ${y} Q 80 ${y + 5} 90 ${y}`}
                stroke="#888"
                strokeWidth="1.5"
                fill="none"
                opacity="0.6"
              />
            ))}
          </svg>
          <span className={styles.editBadge} aria-hidden>
            <svg width="16" height="16" aria-hidden="true" viewBox="0 0 24 24" fill="currentColor"><path d="M5.46257 4.43262C7.21556 2.91688 9.5007 2 12 2C17.5228 2 22 6.47715 22 12C22 14.1361 21.3302 16.1158 20.1892 17.7406L17 12H20C20 7.58172 16.4183 4 12 4C9.84982 4 7.89777 4.84827 6.46023 6.22842L5.46257 4.43262ZM18.5374 19.5674C16.7844 21.0831 14.4993 22 12 22C6.47715 22 2 17.5228 2 12C2 9.86386 2.66979 7.88416 3.8108 6.25944L7 12H4C4 16.4183 7.58172 20 12 20C14.1502 20 16.1022 19.1517 17.5398 17.7716L18.5374 19.5674Z"></path></svg>
          </span>
        </button>
      </div>
    </div>
  );
}
