// Intro hero for the standalone "Create design system" page.
//
// Sets the product rhythm before the form: how many steps, roughly how long,
// and what the user walks away with — paired with an abstract, brand-agnostic
// preview of a generated system (palette / type scale / components) so the
// outcome feels tangible. Standalone-only; the embedded onboarding variant
// keeps its own compact framing.

import { Icon } from './Icon';
import styles from './DesignSystemCreateHero.module.css';

const STEPS: { n: number; title: string; desc: string }[] = [
  { n: 1, title: 'Website or DESIGN.md', desc: 'Paste a link, pick a brand, or copy tokens' },
  { n: 2, title: 'Add material', desc: 'Images, fonts, repo or .fig — optional' },
  { n: 3, title: 'Generate', desc: 'Fast extract first; AI can refine later' },
];

// A calm, brand-agnostic palette — illustrative only.
const SWATCHES = ['#4f46e5', '#0ea5e9', '#14b8a6', '#f59e0b', '#f43f5e'];

export function DesignSystemCreateHero({ stacked = false }: { stacked?: boolean } = {}) {
  return (
    <section className={`${styles.hero}${stacked ? ` ${styles.heroStacked}` : ''}`}>
      <div className={styles.copy}>
        <span className={styles.eyebrow}>
          <Icon name="sparkles" size={13} />
          Design system
        </span>
        <h1 className={styles.title}>Design a system, in minutes</h1>
        <p className={styles.lede}>
          Turn a website or DESIGN.md — plus whatever context you already have — into a
          complete, on-brand design system you can use right away.
        </p>
        <div className={styles.meta}>
          <span className={styles.metaPill}>
            <strong>3</strong> steps
          </span>
          <span className={styles.metaDot} aria-hidden />
          <span className={styles.metaPill}>~3 min</span>
          <span className={styles.metaDot} aria-hidden />
          <span className={styles.metaPill}>DESIGN.md · tokens · UI kit · previews</span>
        </div>
        <ol className={styles.steps}>
          {STEPS.map((step) => (
            <li key={step.n} className={styles.step}>
              <span className={styles.stepNo}>{step.n}</span>
              <span className={styles.stepText}>
                <strong>{step.title}</strong>
                <em>{step.desc}</em>
              </span>
            </li>
          ))}
        </ol>
      </div>
      <ShowcasePreview />
    </section>
  );
}

function ShowcasePreview() {
  return (
    <div className={styles.showcase} aria-hidden>
      <div className={styles.showcaseGlow} />
      <div className={styles.showcaseCard}>
        <div className={styles.showcaseHead}>
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.dot} />
          <span className={styles.showcaseTitle}>Your design system</span>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Palette</span>
          <div className={styles.swatches}>
            {SWATCHES.map((color) => (
              <span key={color} className={styles.swatch} style={{ background: color }} />
            ))}
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Type scale</span>
          <div className={styles.typeScale}>
            <span className={styles.typeLg}>Aa</span>
            <span className={styles.typeMd}>Aa</span>
            <span className={styles.typeSm}>Aa</span>
          </div>
        </div>

        <div className={styles.section}>
          <span className={styles.sectionLabel}>Components</span>
          <div className={styles.components}>
            <span className={styles.fauxBtn}>Primary</span>
            <span className={styles.fauxBtnGhost}>Ghost</span>
            <div className={styles.fauxCard}>
              <span className={styles.fauxBar} />
              <span className={styles.fauxBarShort} />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
