import type { DesignSystemSummary } from '../types';

export interface DesignSystemGithubEvidence {
  /** The design system references at least one GitHub repo in its provenance. */
  required: boolean;
  /** Connector notes and file snapshots have both been captured. */
  ready: boolean;
  /** Count of `context/github/<repo>.md` connector notes present. */
  noteCount: number;
  /** Count of `context/github/<repo>/files/...` snapshot files present. */
  snapshotCount: number;
  hasSourceManifest: boolean;
}

function normalizeDesignSystemPath(path: string): string {
  return path.replace(/\\/g, '/').replace(/^\.?\//, '').toLowerCase();
}

/**
 * Inspect the captured files for a design system to decide how far GitHub
 * intake has progressed. When the system declares no GitHub repos this returns
 * `ready: true` so non-GitHub systems never see repo prompts.
 */
export function designSystemGithubEvidenceState(
  system: DesignSystemSummary,
  names: string[],
): DesignSystemGithubEvidence {
  const expectedRepos = system.provenance?.githubUrls?.length ?? 0;
  const required = expectedRepos > 0;
  if (!required) {
    return {
      required: false,
      ready: true,
      noteCount: 0,
      snapshotCount: 0,
      hasSourceManifest: names.some(
        (name) => normalizeDesignSystemPath(name) === 'context/source-context.md',
      ),
    };
  }
  const normalized = names.map(normalizeDesignSystemPath);
  const noteCount = normalized.filter((name) => /^context\/github\/[^/]+\.md$/u.test(name)).length;
  const snapshotCount = normalized.filter((name) => /^context\/github\/[^/]+\/files\//u.test(name)).length;
  return {
    required: true,
    ready: noteCount >= expectedRepos && snapshotCount > 0,
    noteCount,
    snapshotCount,
    hasSourceManifest: normalized.includes('context/source-context.md'),
  };
}

/**
 * True when a design system points at GitHub repos but the repository evidence
 * is not fully captured yet. This is the single signal that gates the
 * "Connect your repo" CTA in the review banner and the chat empty state.
 */
export function designSystemNeedsRepoConnect(
  system: DesignSystemSummary | null | undefined,
  names: string[],
): boolean {
  if (!system) return false;
  return !designSystemGithubEvidenceState(system, names).ready;
}

/**
 * Instruction dropped into the chat composer when GitHub is connected and the
 * user clicks "Import repo". The design-system project agent already has the
 * bounded `od tools connectors github-design-context` command in
 * `context/source-context.md`; this prompt tells it to run that intake so the
 * evidence notes and file snapshots get captured, which is what clears the CTA.
 */
export const REPO_IMPORT_PROMPT =
  'Pull the linked GitHub repository into this design system. Read `context/source-context.md`, then run the bounded `github-design-context` intake command it lists for each linked repo so the evidence notes and file snapshots under `context/github/<repo>/files/` are captured. After the snapshots land, update DESIGN.md, the token files, and the preview cards from that evidence.';

export interface RepoConnectCopy {
  /** Heading used by the review banner. */
  bannerTitle: string;
  /** Short title used by the chat empty-state card. */
  cardTitle: string;
  /** Supporting sentence for the review banner. */
  bannerBody: string;
  /** Supporting sentence for the chat empty-state card. */
  cardBody: string;
  /** Action button label. */
  buttonLabel: string;
}

/**
 * Copy for the "Connect your repo" CTA, split by live GitHub connector status.
 * When GitHub is already connected the copy stops asking the user to connect
 * and instead points at the re-import step that actually pulls repo files.
 * Both the review banner and the chat empty-state card share this so the two
 * surfaces never drift.
 */
export function repoConnectCopy(githubConnected: boolean): RepoConnectCopy {
  if (githubConnected) {
    return {
      bannerTitle: 'GitHub is connected',
      cardTitle: 'GitHub is connected',
      bannerBody: 'Re-import this repo to pull its files into your design system.',
      cardBody: 'Re-import this repo to pull its files into your design system.',
      buttonLabel: 'Import repo',
    };
  }
  return {
    bannerTitle: 'Connect your repo to pull aspects of your design system',
    cardTitle: 'Connect your repo',
    bannerBody:
      'Connect GitHub so Open Design can read your repository and pull colors, type, and components into this design system.',
    cardBody: 'Pull colors, type, and components from your repository into this design system.',
    buttonLabel: 'Connect GitHub',
  };
}
