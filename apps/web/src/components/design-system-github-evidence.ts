import type { Dict } from '../i18n/types';
import type { DesignSystemSummary } from '../types';

type TranslateFn = (key: keyof Dict, vars?: Record<string, string | number>) => string;

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
 * user clicks "Import repo". Built from the design system's linked repo URLs so
 * it runs even before `context/source-context.md` exists. The CTA shows for any
 * incomplete GitHub-backed system, and that manifest may not be written yet, so
 * keying the prompt to the manifest would dead-start the recovery on a missing
 * file. When the manifest is present the agent is told to follow the exact
 * bounded commands it lists.
 */
export function buildRepoImportPrompt(
  system: DesignSystemSummary | null | undefined,
  names: string[],
): string {
  const githubUrls = system?.provenance?.githubUrls ?? [];
  const repoList = githubUrls.length ? ` for ${githubUrls.join(', ')}` : '';
  const hasManifest = names.some(
    (name) => normalizeDesignSystemPath(name) === 'context/source-context.md',
  );
  const manifestClause = hasManifest
    ? ' If `context/source-context.md` is present, follow the exact bounded commands it lists.'
    : '';
  return (
    `Pull the linked GitHub repository into this design system. Run the bounded \`github-design-context\` intake${repoList} so the evidence notes and file snapshots under \`context/github/<repo>/files/\` are captured.${manifestClause}` +
    ' After the snapshots land, update DESIGN.md, the token files, and the preview cards from that evidence.'
  );
}

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
 * `undefined` means the status fetch has not resolved yet: show a neutral,
 * pending label so a fast click can't fire the wrong action (connect vs import)
 * before we know whether GitHub is connected. Once known, connected copy points
 * at the re-import step and not-connected copy asks the user to connect. Both
 * the review banner and the chat empty-state card share this so they never
 * drift.
 */
export function repoConnectCopy(t: TranslateFn, githubConnected: boolean | undefined): RepoConnectCopy {
  if (githubConnected === undefined) {
    return {
      bannerTitle: t('ds.repoConnectBannerTitle'),
      cardTitle: t('ds.repoConnectCardTitle'),
      bannerBody: t('ds.repoConnectPendingBody'),
      cardBody: t('ds.repoConnectPendingBody'),
      buttonLabel: t('ds.repoConnectPendingButton'),
    };
  }
  if (githubConnected) {
    return {
      bannerTitle: t('ds.repoConnectedTitle'),
      cardTitle: t('ds.repoConnectedTitle'),
      bannerBody: t('ds.repoConnectedBody'),
      cardBody: t('ds.repoConnectedBody'),
      buttonLabel: t('ds.repoImportButton'),
    };
  }
  return {
    bannerTitle: t('ds.repoConnectBannerTitle'),
    cardTitle: t('ds.repoConnectCardTitle'),
    bannerBody: t('ds.repoConnectBannerBody'),
    cardBody: t('ds.repoConnectCardBody'),
    buttonLabel: t('ds.repoConnectButton'),
  };
}
