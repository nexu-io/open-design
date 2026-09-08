/* ───────────────────────────────────────────────────────────────────
 * Guard: the trust boundary of the "What's New" publish workflow.
 *
 * The card is visible to every installed client the moment it lands, so
 * "published" has to imply "reviewed". Nothing written inside
 * `.github/workflows/whats-new-publish.yml` can enforce that on its own:
 * `workflow_dispatch` runs the workflow file *from the ref it is dispatched
 * against*, so every check in that file is editable by whoever triggers it.
 *
 * The control is the `whats-new-publish` GitHub environment — its
 * deployment-branch policy allows `main` only, and the R2 credentials are
 * secrets on it. That control only holds while the workflow keeps a specific
 * shape:
 *
 *   the job that can reach the credentials is the job that declares the
 *   environment, and it cannot start unless validation succeeded first.
 *
 * Move `environment:` or a `secrets.*` expression onto the job that runs from
 * arbitrary refs and the boundary is gone, with no failing test and no visible
 * symptom — the workflow still publishes correctly from `main`. This guard is
 * what makes that edit red.
 *
 * It runs in `pnpm guard`, which CI invokes from the `preflight` job. That job
 * is enabled unconditionally in `.github/scripts/scopes.py` and its guard step
 * carries no `if`, so it runs on every pull request. That is load-bearing here
 * for the same reason it is for `check-whats-new-document.ts`: an edit to
 * `.github/workflows/whats-new-publish.yml` selects neither `web_tests_required`
 * nor `ui_p0_validation_required`, so the `e2e_vitest` workload does not run
 * for it. A lane-routed assertion would be skipped for exactly the change class
 * it exists to catch.
 *
 * Run standalone: `pnpm exec tsx scripts/check-whats-new-publish-workflow.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────── */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(import.meta.dirname, "..");

export const WHATS_NEW_WORKFLOW_PATH = ".github/workflows/whats-new-publish.yml";

/** The protected environment. A typo here silently creates an unprotected one. */
export const WHATS_NEW_PUBLISH_ENVIRONMENT = "whats-new-publish";

/** The job allowed to hold the environment and the credentials. */
export const WHATS_NEW_PUBLISH_JOB = "publish";

/** The job whose output gates publication. */
export const WHATS_NEW_VALIDATE_JOB = "validate";

/**
 * Secrets on the `whats-new-publish` environment. Kept here rather than read
 * out of the workflow so that *dropping* a binding is a violation too — a
 * publish job missing one of these fails at runtime with a credentials error,
 * which reads like a configuration problem rather than a workflow edit.
 */
export const WHATS_NEW_R2_SECRETS = [
  "CLOUDFLARE_R2_WHATS_NEW_AK",
  "CLOUDFLARE_R2_WHATS_NEW_SK",
  "CLOUDFLARE_R2_WHATS_NEW_URL",
  "CLOUDFLARE_R2_WHATS_NEW_BUCKET",
] as const;

export interface WorkflowJob {
  readonly name: string;
  /** The job's YAML body, with whole-line comments removed. */
  readonly body: string;
}

/**
 * Split the `jobs:` mapping into one body per job.
 *
 * Whole-line comments are dropped because this workflow documents its own
 * boundary in prose ("No environment, no secrets"). An assertion that a job
 * does not mention `environment` must not be satisfied — or defeated — by a
 * sentence about it.
 *
 * Block scalars (`run: |`) are tracked so a shell line that happens to sit at
 * two-space indentation cannot be mistaken for a job header. Returning the
 * jobs by name is what keeps every assertion below non-vacuous: a negative
 * assertion run against a body that was never extracted would pass for the
 * wrong reason, so callers must look each job up and fail when it is absent.
 */
export function parseWorkflowJobs(workflow: string): WorkflowJob[] {
  const lines = workflow.split("\n").filter((line) => !/^\s*#/.test(line));
  const jobsIndex = lines.indexOf("jobs:");
  if (jobsIndex < 0) return [];

  const jobs: WorkflowJob[] = [];
  let current: string | null = null;
  let buffer: string[] = [];
  let blockIndent: number | null = null;

  const flush = (): void => {
    if (current != null) jobs.push({ name: current, body: buffer.join("\n") });
  };

  for (const line of lines.slice(jobsIndex + 1)) {
    const indent = line.search(/\S/);

    if (blockIndent != null) {
      if (indent === -1 || indent > blockIndent) {
        buffer.push(line);
        continue;
      }
      blockIndent = null;
    }

    // A non-indented, non-blank line is the next top-level key: `jobs:` ended.
    if (indent === 0) break;

    const header = /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(line);
    if (header?.[1] != null) {
      flush();
      current = header[1];
      buffer = [];
      continue;
    }

    if (/:\s*[|>][-+]?\d*\s*$/.test(line)) blockIndent = indent;
    buffer.push(line);
  }

  flush();
  return jobs;
}

/** Job-level `environment:` value, or null when the job declares none. */
function declaredEnvironment(body: string): string | null {
  return /^ {4}environment:\s*(\S+)\s*$/m.exec(body)?.[1] ?? null;
}

/** Secret names the job reads through a `${{ secrets.NAME }}` expression. */
function referencedSecrets(body: string): string[] {
  return [...body.matchAll(/\$\{\{[^}]*?\bsecrets\.([A-Za-z0-9_]+)/g)].map((match) => match[1] as string);
}

/**
 * The properties that make the environment an actual control rather than a
 * label. Returns one human-readable violation per broken property.
 */
export function findWhatsNewWorkflowViolations(workflow: string): string[] {
  const violations: string[] = [];
  const jobs = parseWorkflowJobs(workflow);

  if (jobs.length === 0) {
    return [`no jobs found; ${WHATS_NEW_WORKFLOW_PATH} must declare a \`jobs:\` mapping`];
  }

  const publish = jobs.find((job) => job.name === WHATS_NEW_PUBLISH_JOB);
  const validate = jobs.find((job) => job.name === WHATS_NEW_VALIDATE_JOB);

  if (validate == null) {
    violations.push(`no \`${WHATS_NEW_VALIDATE_JOB}\` job; publication must be gated on a validation job`);
  }

  if (publish == null) {
    violations.push(
      `no \`${WHATS_NEW_PUBLISH_JOB}\` job; the credential-bearing job must be named \`${WHATS_NEW_PUBLISH_JOB}\` so this guard can hold it to the boundary`,
    );
    return violations;
  }

  // 1. The credential-bearing job is bound to the protected environment.
  const environment = declaredEnvironment(publish.body);
  if (environment !== WHATS_NEW_PUBLISH_ENVIRONMENT) {
    violations.push(
      `job \`${publish.name}\` declares environment ${environment == null ? "(none)" : `\`${environment}\``}; it must be exactly \`${WHATS_NEW_PUBLISH_ENVIRONMENT}\`, whose deployment-branch policy is what restricts publication to main`,
    );
  }

  // 2. It cannot start unless validation actually succeeded. `needs:` is the
  //    skip-propagating half; the `if:` is the "validated but deliberately a
  //    dry run" half. An `always()` / `!cancelled()` override would defeat the
  //    first by making the job run past a red `validate`.
  if (!/^ {4}needs:\s*validate\s*$/m.test(publish.body)) {
    violations.push(
      `job \`${publish.name}\` must declare \`needs: ${WHATS_NEW_VALIDATE_JOB}\` so a failed validation skips it`,
    );
  }
  if (!/^ {4}if:\s*needs\.validate\.outputs\.publish == 'true'\s*$/m.test(publish.body)) {
    violations.push(
      `job \`${publish.name}\` must be gated on \`if: needs.validate.outputs.publish == 'true'\` so a dry run cannot publish`,
    );
  }
  for (const escape of ["always()", "cancelled()", "failure()"]) {
    if (publish.body.includes(escape)) {
      violations.push(
        `job \`${publish.name}\` references \`${escape}\`; that lets publication run past a failed validation, which is exactly what must not happen`,
      );
    }
  }

  // 3. The four bucket credentials are read by that job and by no other.
  const publishSecrets = new Set(referencedSecrets(publish.body));
  for (const secret of WHATS_NEW_R2_SECRETS) {
    if (!publishSecrets.has(secret)) {
      violations.push(`job \`${publish.name}\` no longer reads \`secrets.${secret}\`; the publisher needs all four bindings`);
    }
  }

  // 4. Every other job runs from arbitrary refs, so it must be free of both
  //    the environment and any secret at all — not just the R2 four.
  for (const job of jobs) {
    if (job.name === WHATS_NEW_PUBLISH_JOB) continue;
    const otherEnvironment = declaredEnvironment(job.body);
    if (otherEnvironment != null) {
      violations.push(
        `job \`${job.name}\` declares environment \`${otherEnvironment}\`; only \`${WHATS_NEW_PUBLISH_JOB}\` may attach an environment, because any other job can be dispatched from an unreviewed ref`,
      );
    }
    for (const secret of new Set(referencedSecrets(job.body))) {
      violations.push(
        `job \`${job.name}\` reads \`secrets.${secret}\`; a job that runs from arbitrary refs must hold no secrets`,
      );
    }
  }

  // 5. `secrets: inherit` hands the whole store to a called workflow, which
  //    would route around every rule above.
  if (/^\s*secrets:\s*inherit\s*$/m.test(workflow)) {
    violations.push("`secrets: inherit` passes the full secret store to a called workflow; name secrets explicitly instead");
  }

  return violations;
}

export async function checkWhatsNewPublishWorkflow(root: string = repoRoot): Promise<boolean> {
  const workflowPath = path.join(root, WHATS_NEW_WORKFLOW_PATH);

  let workflow: string;
  try {
    workflow = await readFile(workflowPath, "utf8");
  } catch (error) {
    console.error(`What's New publish workflow check failed: cannot read ${WHATS_NEW_WORKFLOW_PATH}`);
    console.error(error);
    return false;
  }

  const violations = findWhatsNewWorkflowViolations(workflow);
  if (violations.length > 0) {
    console.error(`What's New publish workflow check failed for ${WHATS_NEW_WORKFLOW_PATH}:`);
    for (const violation of violations) console.error(`- ${violation}`);
    console.error(
      "The card reaches every installed client on publish, so publication must stay bound to the `whats-new-publish` environment (main-only) and unreachable without a green validate. See docs/whats-new.md.",
    );
    return false;
  }

  console.log(
    `What's New publish workflow check passed: only \`${WHATS_NEW_PUBLISH_JOB}\` holds the \`${WHATS_NEW_PUBLISH_ENVIRONMENT}\` environment and its ${WHATS_NEW_R2_SECRETS.length} R2 secrets, gated on \`${WHATS_NEW_VALIDATE_JOB}\`.`,
  );
  return true;
}

// ─── Standalone entrypoint ───────────────────────────────────────────

const isInvokedDirectly =
  process.argv[1] != null && fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

if (isInvokedDirectly) {
  const passed = await checkWhatsNewPublishWorkflow();
  if (!passed) process.exitCode = 1;
}
