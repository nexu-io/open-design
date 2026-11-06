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
 * deployment-branch policy allows `main` and trusted `release/v*` branches,
 * and the R2 credentials are secrets on it. That control only holds while
 * the workflow keeps a specific shape:
 *
 *   the job that can reach the credentials is the job that declares the
 *   environment, and it cannot start unless validation succeeded first.
 *
 * Move `environment:` or a secret onto the job that runs from arbitrary refs
 * and the boundary is gone, with no failing test and no visible symptom — the
 * workflow still publishes correctly from `main`. This guard is what makes
 * that edit red.
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
 * ── Why this reads the document as YAML, not as text ──────────────────
 *
 * The first version matched `${{ secrets.NAME }}` with a regex over the raw
 * file. That is a detector built from a list of shapes someone thought of, and
 * it is only as good as the list. Verified bypasses of it, all of which reached
 * a secret into the arbitrary-ref job while the check returned no violations:
 * `secrets['NAME']`, `secrets["NAME"]`, `secrets [ 'NAME' ]`,
 * `secrets . NAME`, `toJSON(secrets)`, a bare `secrets`, and
 * `fromJSON(toJSON(secrets)).NAME`.
 *
 * One of them cannot be fixed by a better regex at all. A double-quoted YAML
 * scalar may carry a backslash line continuation, so
 *
 *     STOLEN: "${{ sec\
 *       rets.NAME }}"
 *
 * parses to `${{ secrets.NAME }}` while the *source text* contains no such
 * substring. Any raw-text scanner is blind to it by construction. Reading the
 * document through a YAML parser is what closes that class, and it removes the
 * hand-rolled job splitter along with its own failure modes (flow-style
 * mappings, quoted job keys, unusual indentation).
 *
 * Detection is then one rule rather than a shape list: GitHub's expression
 * language has no string-to-context evaluation, so a secret cannot be reached
 * without naming the `secrets` context as an identifier. Finding that
 * identifier inside any `${{ … }}` expression catches every access form,
 * including ones nobody has thought of yet.
 *
 * Run standalone: `pnpm exec tsx scripts/check-whats-new-publish-workflow.ts`
 * Or as part of `pnpm guard` (registered in scripts/guard.ts).
 * ─────────────────────────────────────────────────────────────────── */

import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { parse } from "yaml";

const repoRoot = path.resolve(import.meta.dirname, "..");

export const WHATS_NEW_WORKFLOW_PATH = ".github/workflows/whats-new-publish.yml";

/** The protected environment. A typo here silently creates an unprotected one. */
export const WHATS_NEW_PUBLISH_ENVIRONMENT = "whats-new-publish";

/** The job allowed to hold the environment and the credentials. */
export const WHATS_NEW_PUBLISH_JOB = "publish";

/** The job whose output gates publication. */
export const WHATS_NEW_VALIDATE_JOB = "validate";

/** The gate that keeps a dry run from publishing. */
const PUBLISH_CONDITION = "needs.validate.outputs.publish == 'true'";

/**
 * Status functions that would let publication run past a failed `validate`, or
 * past a failed guard step inside `publish`.
 */
const CONDITION_ESCAPES = ["always", "cancelled", "failure"] as const;

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

// ─── GitHub Actions expression scanning ──────────────────────────────

/**
 * The `${{ … }}` expressions in one scalar, in source order.
 *
 * Single-quoted string literals are skipped while scanning for the closing
 * `}}` (GitHub escapes a quote by doubling it). Without that, `format('}}')`
 * would end the span early and hide whatever follows it in the same
 * expression.
 */
function expressionSpans(scalar: string): string[] {
  const spans: string[] = [];
  let cursor = 0;

  while (cursor < scalar.length) {
    const start = scalar.indexOf("${{", cursor);
    if (start < 0) break;

    let index = start + 3;
    let quoted = false;
    while (index < scalar.length) {
      const character = scalar[index];
      if (quoted) {
        if (character === "'") {
          if (scalar[index + 1] === "'") {
            index += 2;
            continue;
          }
          quoted = false;
        }
        index += 1;
        continue;
      }
      if (character === "'") {
        quoted = true;
        index += 1;
        continue;
      }
      if (character === "}" && scalar[index + 1] === "}") break;
      index += 1;
    }

    spans.push(scalar.slice(start + 3, Math.min(index, scalar.length)));
    cursor = index + 2;
  }

  return spans;
}

/** Blank out string literals so their contents cannot read as identifiers. */
function withoutStringLiterals(expression: string): string {
  return expression.replace(/'(?:''|[^'])*'/g, " ");
}

/**
 * `secrets` used as a context identifier, not as a property name on something
 * else (`inputs.secrets`) and not as part of a longer word.
 */
const SECRETS_CONTEXT = /(?<![A-Za-z0-9_$.])secrets(?![A-Za-z0-9_$])/;

/**
 * Whether this scalar reads the `secrets` context in any form.
 *
 * This is the whole point of the rewrite: it is one rule, not an enumeration.
 * `secrets.A`, `secrets['A']`, `secrets["A"]`, `secrets [ 'A' ]`,
 * `toJSON(secrets)`, a bare `secrets`, and any future spelling all name the
 * context, because the expression language offers no other way to reach one.
 */
function usesSecretsContext(scalar: string): boolean {
  return expressionSpans(scalar).some((expression) => SECRETS_CONTEXT.test(withoutStringLiterals(expression)));
}

/** Secret names read by dot or bracket access, for binding completeness. */
function referencedSecretNames(scalar: string): string[] {
  const names: string[] = [];
  for (const expression of expressionSpans(scalar)) {
    for (const match of expression.matchAll(/\bsecrets\s*\.\s*([A-Za-z0-9_]+)/g)) names.push(match[1] as string);
    for (const match of expression.matchAll(/\bsecrets\s*\[\s*'([^']+)'\s*\]/g)) names.push(match[1] as string);
    for (const match of expression.matchAll(/\bsecrets\s*\[\s*"([^"]+)"\s*\]/g)) names.push(match[1] as string);
  }
  return names;
}

// ─── Parsed-document traversal ───────────────────────────────────────

function isMapping(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** Every string in a subtree, keys included — nothing is out of scope. */
function scalarStrings(value: unknown, collected: string[] = []): string[] {
  if (typeof value === "string") collected.push(value);
  else if (Array.isArray(value)) for (const item of value) scalarStrings(item, collected);
  else if (isMapping(value)) {
    for (const [key, child] of Object.entries(value)) {
      collected.push(key);
      scalarStrings(child, collected);
    }
  }
  return collected;
}

/** Every `if:` expression in a subtree — job-level and step-level alike. */
function conditionals(value: unknown, collected: string[] = []): string[] {
  if (Array.isArray(value)) for (const item of value) conditionals(item, collected);
  else if (isMapping(value)) {
    for (const [key, child] of Object.entries(value)) {
      if (key === "if" && typeof child === "string") collected.push(child);
      conditionals(child, collected);
    }
  }
  return collected;
}

/** Job-level `environment:`, which may be a name or a `{ name, url }` mapping. */
function declaredEnvironment(job: unknown): string | null {
  if (!isMapping(job)) return null;
  const environment = job.environment;
  if (typeof environment === "string") return environment;
  if (isMapping(environment) && typeof environment.name === "string") return environment.name;
  return environment === undefined ? null : "(unrecognized)";
}

/** Job-level `needs:`, normalized to a list. */
function declaredNeeds(job: unknown): string[] | null {
  if (!isMapping(job) || job.needs === undefined) return null;
  if (typeof job.needs === "string") return [job.needs];
  if (Array.isArray(job.needs) && job.needs.every((item) => typeof item === "string")) return job.needs as string[];
  return [];
}

export interface WorkflowJobs {
  readonly jobs: ReadonlyMap<string, unknown>;
  /** Everything outside `jobs:` — workflow-level `env:` reaches every job. */
  readonly workflowLevel: unknown;
}

/**
 * Parse the workflow into its jobs. Returns null when the document cannot be
 * understood, which callers must treat as a violation rather than as "nothing
 * found" — "no problems" and "nothing was examined" have to stay distinct.
 */
export function parseWorkflowJobs(workflow: string): WorkflowJobs | null {
  let document: unknown;
  try {
    document = parse(workflow);
  } catch {
    return null;
  }
  if (!isMapping(document) || !isMapping(document.jobs)) return null;

  const { jobs, ...workflowLevel } = document;
  return { jobs: new Map(Object.entries(jobs)), workflowLevel };
}

/** Job ids in declaration order. Exported for coverage of the parse step. */
export function workflowJobNames(workflow: string): string[] {
  return [...(parseWorkflowJobs(workflow)?.jobs.keys() ?? [])];
}

// ─── The boundary ────────────────────────────────────────────────────

/**
 * The properties that make the environment an actual control rather than a
 * label. Returns one human-readable violation per broken property.
 */
export function findWhatsNewWorkflowViolations(workflow: string): string[] {
  const parsed = parseWorkflowJobs(workflow);
  if (parsed == null) {
    return [
      `${WHATS_NEW_WORKFLOW_PATH} could not be read as a workflow document with a \`jobs:\` mapping; this guard cannot vouch for a file it cannot parse`,
    ];
  }

  const violations: string[] = [];
  const { jobs, workflowLevel } = parsed;
  const publish = jobs.get(WHATS_NEW_PUBLISH_JOB);

  if (!jobs.has(WHATS_NEW_VALIDATE_JOB)) {
    violations.push(`no \`${WHATS_NEW_VALIDATE_JOB}\` job; publication must be gated on a validation job`);
  }

  if (publish === undefined) {
    violations.push(
      `no \`${WHATS_NEW_PUBLISH_JOB}\` job; the credential-bearing job must be named \`${WHATS_NEW_PUBLISH_JOB}\` so this guard can hold it to the boundary`,
    );
    return violations;
  }

  // 1. The credential-bearing job is bound to the protected environment.
  const environment = declaredEnvironment(publish);
  if (environment !== WHATS_NEW_PUBLISH_ENVIRONMENT) {
    violations.push(
      `job \`${WHATS_NEW_PUBLISH_JOB}\` declares environment ${environment == null ? "(none)" : `\`${environment}\``}; it must be exactly \`${WHATS_NEW_PUBLISH_ENVIRONMENT}\`, whose deployment-branch policy restricts publication to main and trusted release branches`,
    );
  }

  // 2. It cannot start unless validation actually succeeded. `needs:` is the
  //    skip-propagating half; the `if:` is the "validated but deliberately a
  //    dry run" half.
  const needs = declaredNeeds(publish);
  if (needs == null || needs.length !== 1 || needs[0] !== WHATS_NEW_VALIDATE_JOB) {
    violations.push(
      `job \`${WHATS_NEW_PUBLISH_JOB}\` must declare \`needs: ${WHATS_NEW_VALIDATE_JOB}\` so a failed validation skips it`,
    );
  }
  const jobCondition = isMapping(publish) && typeof publish.if === "string" ? publish.if.trim() : null;
  if (jobCondition !== PUBLISH_CONDITION) {
    violations.push(
      `job \`${WHATS_NEW_PUBLISH_JOB}\` must be gated on \`if: ${PUBLISH_CONDITION}\` so a dry run cannot publish`,
    );
  }
  // A status function anywhere in the job — its own `if` or a step's — would
  // let work continue past a failure that was supposed to stop it.
  for (const condition of conditionals(publish)) {
    for (const escape of CONDITION_ESCAPES) {
      if (new RegExp(`\\b${escape}\\s*\\(`).test(condition)) {
        violations.push(
          `job \`${WHATS_NEW_PUBLISH_JOB}\` uses \`${escape}()\` in \`${condition}\`; that lets work continue past a failure that must stop it`,
        );
      }
    }
  }

  // 3. The four bucket credentials are read by that job.
  const publishSecretNames = new Set(scalarStrings(publish).flatMap(referencedSecretNames));
  for (const secret of WHATS_NEW_R2_SECRETS) {
    if (!publishSecretNames.has(secret)) {
      violations.push(
        `job \`${WHATS_NEW_PUBLISH_JOB}\` no longer reads \`secrets.${secret}\`; the publisher needs all four bindings`,
      );
    }
  }

  // 4. Nothing else may reach a secret. Every other job runs from arbitrary
  //    refs, and workflow-level `env:` is inherited by all of them.
  const elsewhere: Array<[string, unknown]> = [
    ["the workflow level", workflowLevel],
    ...[...jobs].filter(([name]) => name !== WHATS_NEW_PUBLISH_JOB).map(([name, job]): [string, unknown] => [
      `job \`${name}\``,
      job,
    ]),
  ];

  for (const [label, subtree] of elsewhere) {
    if (subtree !== workflowLevel) {
      const otherEnvironment = declaredEnvironment(subtree);
      if (otherEnvironment != null) {
        violations.push(
          `${label} declares environment \`${otherEnvironment}\`; only \`${WHATS_NEW_PUBLISH_JOB}\` may attach an environment, because any other job can be dispatched from an unreviewed ref`,
        );
      }
      // `secrets:` as a job key passes credentials into a called workflow with
      // no `${{ }}` expression at all, so expression scanning cannot see it.
      if (isMapping(subtree) && subtree.secrets !== undefined) {
        violations.push(
          `${label} declares a \`secrets:\` key; that hands credentials to a called workflow, routing around the environment boundary`,
        );
      }
    }

    for (const scalar of scalarStrings(subtree)) {
      if (!usesSecretsContext(scalar)) continue;
      violations.push(
        `${label} reads the \`secrets\` context in \`${scalar.replace(/\s+/g, " ").trim().slice(0, 120)}\`; anything that runs from arbitrary refs must hold no secrets`,
      );
    }
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
      "The card reaches every installed client on publish, so publication must stay bound to the `whats-new-publish` environment (main and trusted release branches) and unreachable without a green validate. See docs/whats-new.md.",
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
