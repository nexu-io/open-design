import { useMemo } from 'react';

import { appendResourceQuery } from '../../collab/workspace-identity';
import { projectRawUrl } from '../../providers/registry';
import { selectBuildPreviewHtmlEntry } from '../auto-open-file';
import { DesignFilesBuildingState } from './DesignFilesBuildingState';
import { DesignFilesEmptyState } from './DesignFilesEmptyState';
import type { WorkspaceCollabContext } from '@open-design/contracts';
import type { ProjectFile } from '../../types';
import type { RunFailure, RunPhase, RunProgressStep } from '../../runtime/run-progress';

interface Props {
  projectId: string;
  /** Every file in the project; the entry page is picked out of them. */
  files: ProjectFile[];
  /** Bumped on every coalesced `file-changed` batch; part of the cache bust. */
  filesRefreshKey: number;
  workspaceContext: WorkspaceCollabContext | null;
  /** True while the chat agent is generating. */
  running: boolean;
  /** The running turn's tool calls, newest first. */
  steps: RunProgressStep[];
  /** What the turn is doing before it has called anything. */
  phase: RunPhase;
  /** Title of the question the finished turn is waiting on, if it asked one. */
  question?: string | null;
  /** How the finished turn died, if it did (see `runFailureState`). */
  failure?: RunFailure | null;
}

/**
 * The project as it LOOKS — its entry page, rendered, filling the pane.
 *
 * The workspace had no such surface: Design Files showed the artifacts as a
 * grid of cards, and seeing the thing itself meant opening a file into its own
 * tab. This pane is the other half of that pair — what the project presents,
 * next to what it is made of.
 *
 * While a run is writing that page this IS the build preview
 * (`DesignFilesBuildingState`): the same live frame with a cursor on the part
 * being written. Handing the running state to a second, plainer preview would
 * show the same page with less information in it.
 *
 * The entry page is chosen the way the build preview chooses it
 * (`selectBuildPreviewHtmlEntry`): the shallowest site entry, else the newest
 * HTML file.
 *
 * A project with no page yet gets the orbiting particle field with the run's
 * own state at its centre (`DesignFilesEmptyState`). That field belongs HERE,
 * on the surface that reports what the project looks like: it is the answer to
 * "why is there nothing to see yet" — the agent is thinking, or it is on its
 * fourth tool call, or the run failed. Design Files, next door, is a list of
 * files; an empty list is a sentence, not an animation.
 */
export function ProjectPreviewPane({
  projectId,
  files,
  filesRefreshKey,
  workspaceContext,
  running,
  steps,
  phase,
  question = null,
  failure = null,
}: Props) {
  const entry = useMemo(() => {
    const target = steps[0]?.location?.file;
    const active = target ? files.find((file) => file.kind === 'html' && (file.name === target || target.endsWith(`/${file.name}`))) : null;
    const name = active?.name ?? selectBuildPreviewHtmlEntry(files);
    return name ? files.find((file) => file.name === name) ?? null : null;
  }, [files, running, steps]);

  const src = useMemo(
    () =>
      entry
        ? appendResourceQuery(
            projectRawUrl(projectId, entry.name, workspaceContext),
            // Same two-part bust as the build preview: mtime, plus the refresh
            // key for a rewrite that lands inside one filesystem mtime tick.
            `v=${Math.round(entry.mtime)}&fr=${filesRefreshKey}`,
          )
        : null,
    [entry, projectId, workspaceContext, filesRefreshKey],
  );

  if (!entry) {
    return (
      <div className="project-live-preview-empty" data-testid="project-preview-empty">
        <DesignFilesEmptyState
          running={running}
          steps={steps}
          phase={phase}
          question={question}
          failure={failure}
        />
      </div>
    );
  }

  return (
    <div className="project-live-preview-stage" data-testid="project-preview">
      {running || failure ? (
        <DesignFilesBuildingState
          key={`${projectId}:${entry.name}`}
          failure={failure}
          projectId={projectId}
          file={entry}
          filesRefreshKey={filesRefreshKey}
          steps={steps}
          phase={phase}
          workspaceContext={workspaceContext}
        />
      ) : (
        <iframe
          key={`${projectId}:${entry.name}`}
          className="project-live-preview-frame"
          src={src ?? undefined}
          title={entry.name}
          data-testid="project-preview-frame"
          // No `allow-same-origin`: this is generated markup and the host needs
          // nothing from it. Unlike the build preview it DOES take pointer
          // events — a finished page is there to be scrolled and clicked.
          sandbox="allow-scripts allow-popups"
        />
      )}
    </div>
  );
}
