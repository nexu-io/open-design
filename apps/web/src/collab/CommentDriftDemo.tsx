import { useMemo, useState } from 'react';
import type { PreviewComment } from '../types';
import {
  planLostAnchorWriteBacks,
  resolveCommentAnchor,
  type PreviewCommentSnapshot,
} from '../comments';
import styles from './CollabDemoView.module.css';

// A fixed comment anchored (at version 1) to a headline element. Every scenario
// below re-resolves THIS comment against a different set of live DOM snapshots,
// exactly as the drift ladder does in the preview overlay — real engine, only
// the snapshots are synthetic.
const COMMENT: PreviewComment = {
  id: 'c-demo',
  filePath: 'index.html',
  elementId: 'el-headline',
  selector: '.headline',
  htmlHint: '<h1 class="headline">',
  text: 'Tighten this headline',
  position: { x: 40, y: 30, width: 300, height: 48 },
  anchoredVersion: 1,
  createdAt: 1,
} as PreviewComment;

function snap(overrides: Partial<PreviewCommentSnapshot> = {}): PreviewCommentSnapshot {
  return {
    filePath: 'index.html',
    elementId: 'el-headline',
    selector: '.headline',
    label: 'Headline',
    htmlHint: '<h1 class="headline">',
    text: 'Tighten this headline',
    position: { x: 40, y: 30, width: 300, height: 48 },
    ...overrides,
  };
}

interface Scenario {
  key: string;
  label: string;
  note: string;
  snapshots: Map<string, PreviewCommentSnapshot>;
  currentVersion: number;
}

const SCENARIOS: Scenario[] = [
  {
    key: 'unchanged',
    label: 'Unchanged (v1)',
    note: 'Exact element still present at the anchored version.',
    snapshots: new Map([['el-headline', snap()]]),
    currentVersion: 1,
  },
  {
    key: 'rerendered',
    label: 'Re-rendered (v2)',
    note: 'Same element, but the document was re-published at a newer version.',
    snapshots: new Map([['el-headline', snap()]]),
    currentVersion: 2,
  },
  {
    key: 'churned',
    label: 'Id churned, content intact (v2)',
    note: 'The AI regenerated the DOM: element id changed, but selector/text still match — recovered by content.',
    snapshots: new Map([['el-x7f2', snap({ elementId: 'el-x7f2' })]]),
    currentVersion: 2,
  },
  {
    key: 'removed',
    label: 'Section removed (v2)',
    note: 'The anchoring content is gone entirely — no content match, so the pin becomes a badged ghost.',
    snapshots: new Map([['el-footer', snap({ elementId: 'el-footer', selector: '.footer', htmlHint: '<footer>', text: 'Contact us', label: 'Footer' })]]),
    currentVersion: 2,
  },
];

const STATE_LABEL: Record<string, string> = {
  anchored: 'Anchored',
  reanchored: 'Re-anchored',
  stale: 'Stale (content-recovered)',
  lost: 'Lost (ghost pin)',
};

/**
 * Visible demo of the comment drift ladder . Drives the real
 * {@link resolveCommentAnchor} + {@link planLostAnchorWriteBacks} so the four
 * anchor states and the durable last-good write-back can be seen, without the
 * full preview/snapshot machinery. Snapshots are synthetic (labelled below);
 * the resolution logic is production code.
 */
export function CommentDriftDemo() {
  const [scenarioKey, setScenarioKey] = useState(SCENARIOS[0]!.key);
  const scenario = SCENARIOS.find((s) => s.key === scenarioKey) ?? SCENARIOS[0]!;

  const resolution = useMemo(
    () => resolveCommentAnchor(COMMENT, scenario.snapshots, scenario.currentVersion),
    [scenario],
  );
  const writeBacks = useMemo(
    () => planLostAnchorWriteBacks([{ comment: COMMENT, resolution }]),
    [resolution],
  );

  return (
    <div className={styles.session}>
      <div className={styles.row}>
        <strong>Comment drift ladder</strong>
        <span className={styles.count}>real engine · synthetic snapshots</span>
      </div>

      <div className={styles.scenarioBtns}>
        {SCENARIOS.map((s) => (
          <button
            key={s.key}
            type="button"
            className={s.key === scenarioKey ? styles.scenarioActive : ''}
            onClick={() => setScenarioKey(s.key)}
          >
            {s.label}
          </button>
        ))}
      </div>

      <p className={styles.note}>{scenario.note}</p>

      <div className={styles.row}>
        <span className={styles.label}>Resolved state</span>
        <span className={styles.badge} data-anchor-state={resolution.state}>
          {STATE_LABEL[resolution.state] ?? resolution.state}
        </span>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Anchored to</span>
        <code className={styles.mono}>
          {resolution.snapshot
            ? resolution.state === 'lost'
              ? `ghost @ ${resolution.snapshot.position.x},${resolution.snapshot.position.y}`
              : resolution.snapshot.elementId
            : '—'}
        </code>
      </div>

      <div className={styles.row}>
        <span className={styles.label}>Durable write-back</span>
        <code className={styles.mono}>
          {writeBacks.length > 0
            ? `PATCH anchor → lost @ ${writeBacks[0]!.lastGoodPosition.x},${writeBacks[0]!.lastGoodPosition.y}`
            : 'none (derived state, not persisted)'}
        </code>
      </div>
    </div>
  );
}
