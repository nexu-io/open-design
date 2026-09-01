import type { Metadata } from 'next';
import styles from './page.module.css';

export const metadata: Metadata = {
  title: 'Cowork · LeastGen Studio',
};

/**
 * LeastGen Cowork, embedded in the same web application as the Studio.
 *
 * Cowork's web runtime is the LeastGen Coworker app (Svelte + Vite, repo at
 * ../leastgen-app relative to this repo's LeastGen home), served separately
 * (dev: Vite on :5173; prod: the same bundle behind the LeastGen ingress).
 * Framing it here keeps ONE page hosting both products: the rail switcher
 * lands on /cowork, the back action returns to the Studio shell.
 *
 * The chrome mirrors the Coworker app's own Titlebar idiom (38px bar,
 * slate-950 shell, emerald accents, badge pills) so the two products read
 * as one continuous surface.
 *
 * Override the target with NEXT_PUBLIC_COWORK_URL when Cowork is served
 * from another origin (e.g. https://cowork.leastgen.com).
 */
const COWORK_URL = process.env.NEXT_PUBLIC_COWORK_URL ?? 'http://localhost:5173';

export default function CoworkPage() {
  return (
    <div className={styles.shell}>
      <div className={styles.bar}>
        <div className={styles.identity}>
          <span className={styles.mark} aria-hidden>
            <svg
              width="12"
              height="12"
              viewBox="0 0 82 82"
              fill="none"
              stroke="#ffffff"
              strokeWidth="6"
            >
              <line x1="41" y1="21" x2="19" y2="61" />
              <line x1="41" y1="21" x2="63" y2="61" />
              <line x1="19" y1="61" x2="63" y2="61" />
              <circle cx="41" cy="21" r="11" />
              <circle cx="19" cy="61" r="8.5" />
              <circle cx="63" cy="61" r="8.5" />
            </svg>
          </span>
          <span className={styles.name}>LeastGen Cowork</span>
          <span className={styles.dash}>—</span>
          <span className={styles.sub}>Design &amp; Agent Workspace</span>
        </div>
        <div className={styles.actions}>
          <a
            className={styles.pill}
            href={COWORK_URL}
            target="_blank"
            rel="noreferrer"
          >
            OPEN STANDALONE ↗
          </a>
          <a className={`${styles.pill} ${styles.pillAccent}`} href="/">
            <span className={styles.liveDot} aria-hidden />
            ← BACK TO STUDIO
          </a>
        </div>
      </div>
      <iframe
        className={styles.frame}
        src={COWORK_URL}
        title="LeastGen Cowork"
        allow="clipboard-write; clipboard-read; fullscreen"
        allowFullScreen
      />
    </div>
  );
}
