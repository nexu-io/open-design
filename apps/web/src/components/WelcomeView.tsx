import { Icon } from './Icon';
import { navigate } from '../router';

/**
 * First-run onboarding. Surfaces the three workflow features the
 * user is most likely to miss on their own:
 *   1. Super-System skill (the 14-video playbook agents inherit)
 *   2. Multi-CLI Fan Out + Compare tab
 *   3. Component / brand library at /components
 *
 * Each card has a single CTA that routes to the relevant surface.
 * No tracking, no dismiss-forever state — this view is reachable
 * only when the user navigates to /onboarding, so a "first run"
 * heuristic isn't needed.
 */
export function WelcomeView() {
  return (
    <div className="onboarding-view">
      <header className="onboarding-view__head">
        <h1 className="onboarding-view__title">Welcome to Open Design</h1>
        <p className="onboarding-view__sub">
          Three things to know before you start building.
        </p>
      </header>

      <div className="onboarding-view__grid">
        <OnboardingCard
          icon="sparkles"
          title="Super-System playbook"
          body="15 cross-cutting design + AI-coding rules distilled from 14 production videos. Auto-attached to every Fan Out by default — the agent reads PATTERNS.md + RESEARCH.md before it generates a single line."
          ctaLabel="Read the playbook"
          onClick={() => navigate({ kind: 'skill-detail', skillId: 'super-system' })}
        />
        <OnboardingCard
          icon="grid"
          title="Multi-CLI Fan Out"
          body="In the chat composer, click the grid icon next to send. Pick 2+ installed CLIs (Claude, Codex, Cursor, Gemini). Each gets a different role: design taste, logic, fast iterate, long-context extract. Compare tab shows them side by side with a winner picker."
          ctaLabel="Open Compare"
          onClick={() => navigate({ kind: 'home', view: 'compare' })}
        />
        <OnboardingCard
          icon="palette"
          title="Brand & component library"
          body="158 design systems shipped (Apple, Stripe, Linear, Monarch, Multica, EOS Design, …). Browse by vibe, filter by WCAG AA, copy any selector, or click 'Use in project' to attach a brand to a fresh chat."
          ctaLabel="Browse brands"
          onClick={() => navigate({ kind: 'home', view: 'components' })}
        />
      </div>

      <div className="onboarding-view__cheatsheet">
        <div className="onboarding-view__cheatsheet-head">Keyboard</div>
        <ul>
          <li><kbd>⌘</kbd> <kbd>K</kbd> — open command palette (skills · brands · runs)</li>
          <li><kbd>⌘</kbd> <kbd>1</kbd>–<kbd>9</kbd> — jump to nav-rail destinations</li>
          <li><kbd>⌘</kbd> <kbd>↵</kbd> — send a message in the composer</li>
        </ul>
      </div>
    </div>
  );
}

interface OnboardingCardProps {
  icon: 'sparkles' | 'grid' | 'palette';
  title: string;
  body: string;
  ctaLabel: string;
  onClick: () => void;
}
function OnboardingCard({ icon, title, body, ctaLabel, onClick }: OnboardingCardProps) {
  return (
    <article className="onboarding-card">
      <div className="onboarding-card__icon">
        <Icon name={icon} size={20} />
      </div>
      <h2 className="onboarding-card__title">{title}</h2>
      <p className="onboarding-card__body">{body}</p>
      <button type="button" className="onboarding-card__cta" onClick={onClick}>
        {ctaLabel} →
      </button>
    </article>
  );
}
