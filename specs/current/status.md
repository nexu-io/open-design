# Project Status

## Goal

Show a compact status on each project card that reflects the current state of the project's most relevant run.

## Status source

Project status should be a derived display value, based on runs associated with the project.

The recommended logic is:

1. If the project has an active run, show that active run's status.
2. If the project has no active run, show the latest run's terminal status.
3. If the project has no runs, show `not_started`.

An active run takes priority over the latest terminal run because it tells the user that work is currently happening in the project.

## Display statuses

```ts
type ProjectDisplayStatus =
  | 'not_started'
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'canceled';
```

| Display status | Label | Source status | Meaning |
| --- | --- | --- | --- |
| `not_started` | Not started | No run | The project exists and has no run history. |
| `queued` | Queued | `queued` | A run exists and is waiting to start. |
| `running` | Running | `running`, `starting` | A run is currently executing. |
| `succeeded` | Completed | `succeeded` | The latest relevant run completed successfully. |
| `failed` | Failed | `failed` | The latest relevant run failed. |
| `canceled` | Canceled | `canceled`, `cancelled` | The latest relevant run was canceled. |

## Derivation logic

```ts
function deriveProjectDisplayStatus(projectRuns: Run[]): ProjectDisplayStatus {
  const activeRun = projectRuns
    .filter((run) => run.status === 'queued' || run.status === 'running' || run.status === 'starting')
    .sort(byMostRecent)[0];

  if (activeRun) {
    return normalizeRunStatus(activeRun.status);
  }

  const latestRun = projectRuns.sort(byMostRecent)[0];

  if (latestRun) {
    return normalizeRunStatus(latestRun.status);
  }

  return 'not_started';
}

function normalizeRunStatus(status: RunStatus): ProjectDisplayStatus {
  if (status === 'starting') return 'running';
  if (status === 'cancelled') return 'canceled';
  return status;
}
```

## UI guidance

The project card should show the status near the existing metadata line, together with the relative timestamp when useful.

Examples:

- `Running · just now`
- `Queued · 1 minute ago`
- `Completed · 6 minutes ago`
- `Failed · 36 minutes ago`
- `Canceled · 3 hours ago`
- `Not started`

Use stronger visual treatment for active and error states:

- `running`: primary or accent indicator.
- `queued`: neutral pending indicator.
- `failed`: error indicator.
- `canceled`: muted neutral indicator.
- `succeeded`: subtle success indicator.
- `not_started`: muted placeholder indicator.

## Rationale

Project status represents the user's project-level mental model. Users need to know whether a project is waiting, actively running, completed, failed, canceled, or untouched.

Using `running` as the primary active label keeps the UI aligned with the underlying run model and covers generation, editing, repair, analysis, export, and future run types.
