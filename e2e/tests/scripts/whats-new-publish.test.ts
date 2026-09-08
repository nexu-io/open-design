import { execFileSync, spawnSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";

import {
  WHATS_NEW_DOCUMENT_PATH,
  checkWhatsNewDocument,
} from "../../../scripts/check-whats-new-document.ts";
import {
  WHATS_NEW_WORKFLOW_PATH,
  findWhatsNewWorkflowViolations,
  parseWorkflowJobs,
  workflowJobNames,
} from "../../../scripts/check-whats-new-publish-workflow.ts";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");

// The daemon resolves a malformed What's New document to "no highlight"
// instead of an error, so every failure mode below is invisible at publish
// time: the upload succeeds and the card simply never appears. These cases
// exist to prove the guard can actually see each of them — a guard that only
// ever runs against the good document is an untested guard.
async function documentRoot(document: string): Promise<string> {
  const root = await mkdtemp(path.join(tmpdir(), "whats-new-guard-"));
  await mkdir(path.join(root, path.dirname(WHATS_NEW_DOCUMENT_PATH)), { recursive: true });
  await writeFile(path.join(root, WHATS_NEW_DOCUMENT_PATH), document, "utf8");
  return root;
}

const validDocument = {
  id: "1.2.3",
  title: "Headline",
  body: "First bullet.\nSecond bullet.",
  imageUrl: "https://whatsnew.open-design.ai/cover.webp",
  linkUrl: "https://open-design.ai/release/",
  locales: {
    "zh-CN": { title: "标题", body: "第一条。\n第二条。", linkUrl: "https://open-design.ai/zh/release/" },
  },
};

async function check(document: unknown): Promise<boolean> {
  return checkWhatsNewDocument(await documentRoot(JSON.stringify(document, null, 2)));
}

describe("what's new document guard", () => {
  let consoleError: ReturnType<typeof vi.spyOn>;
  let consoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
    consoleLog = vi.spyOn(console, "log").mockImplementation(() => {});
  });

  afterEach(() => {
    consoleError.mockRestore();
    consoleLog.mockRestore();
  });

  test("the repository document is publishable", async () => {
    await expect(checkWhatsNewDocument(repoRoot)).resolves.toBe(true);
  });

  test("a well-formed document passes", async () => {
    await expect(check(validDocument)).resolves.toBe(true);
  });

  test("the empty retirement document passes", async () => {
    await expect(check({})).resolves.toBe(true);
  });

  test("invalid JSON fails", async () => {
    await expect(checkWhatsNewDocument(await documentRoot("{ not json }"))).resolves.toBe(false);
  });

  test("a missing document fails", async () => {
    await expect(checkWhatsNewDocument(await mkdtemp(path.join(tmpdir(), "whats-new-guard-")))).resolves.toBe(false);
  });

  test.each(["id", "title", "body"] as const)("a missing %s fails", async (field) => {
    const { [field]: _dropped, ...rest } = validDocument;
    await expect(check(rest)).resolves.toBe(false);
  });

  test("an empty required string fails", async () => {
    await expect(check({ ...validDocument, title: "   " })).resolves.toBe(false);
  });

  test("a misspelled field fails instead of being silently ignored", async () => {
    const { imageUrl: cover, ...rest } = validDocument;
    await expect(check({ ...rest, imageURL: cover })).resolves.toBe(false);
  });

  test("a non-https imageUrl fails", async () => {
    await expect(check({ ...validDocument, imageUrl: "http://whatsnew.open-design.ai/cover.webp" })).resolves.toBe(
      false,
    );
  });

  test("a non-https locale linkUrl fails", async () => {
    await expect(
      check({
        ...validDocument,
        locales: { "zh-CN": { ...validDocument.locales["zh-CN"], linkUrl: "open-design.ai/zh/" } },
      }),
    ).resolves.toBe(false);
  });

  test("a locale whose overrides are all invalid fails", async () => {
    await expect(check({ ...validDocument, locales: { "zh-CN": { title: "" } } })).resolves.toBe(false);
  });

  test("a blank bullet line fails", async () => {
    await expect(check({ ...validDocument, body: "First bullet.\n\nSecond bullet." })).resolves.toBe(false);
  });

  test("the check is registered in the public guard entrypoint", () => {
    const names = execFileSync("pnpm", ["--silent", "guard", "--list-checks"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(names).toContain("what's new document");
  });
});

describe("what's new publisher", () => {
  // The publisher's own gate: a green upload means nothing unless the object
  // is read back from the origin the daemon fetches, and that read-back is
  // only evidence if a wrong body turns it red. The self-check asserts both
  // halves against a local origin.
  test("the read-back gate and the JSON gate can both fail", () => {
    const result = spawnSync("python3", [path.join(repoRoot, ".github/scripts/publish_whats_new.py"), "self-check"], {
      cwd: repoRoot,
      encoding: "utf8",
    });
    expect(result.stderr ?? "").toBe("");
    expect(result.status).toBe(0);
    expect(result.stdout).toContain("self-check passed");
  });

  // A malformed document must be rejected before anything else happens, so a
  // bad edit cannot reach the bucket even if the credentials are present.
  test("an invalid document is rejected before credentials are considered", async () => {
    const root = await documentRoot("{ not json }");
    const result = spawnSync("python3", [path.join(repoRoot, ".github/scripts/publish_whats_new.py")], {
      cwd: root,
      encoding: "utf8",
      env: {
        ...process.env,
        WHATS_NEW_DOCUMENT: WHATS_NEW_DOCUMENT_PATH,
        WHATS_NEW_DRY_RUN: "false",
        WHATS_NEW_STORAGE_ENDPOINT: "",
        WHATS_NEW_STORAGE_BUCKET: "",
        WHATS_NEW_STORAGE_ACCESS_KEY_ID: "",
        WHATS_NEW_STORAGE_SECRET_ACCESS_KEY: "",
      },
    });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("not valid JSON");
  });
});

// The card reaches every installed client the moment it is published, so
// "published" must imply "reviewed". Nothing written inside the workflow file
// can enforce that on its own: `workflow_dispatch` runs the workflow from the
// ref it is dispatched against, so every check in it is editable by whoever
// triggers it. The control is the `whats-new-publish` environment — main-only
// branch policy, R2 credentials as secrets on it — and that control only holds
// while the workflow keeps a specific shape: the job that can reach the
// credentials is the job that declares the environment, and it cannot start
// unless validation succeeded.
//
// Moving `environment:` or a `secrets.*` expression onto the job that runs
// from arbitrary refs reopens the hole with no visible symptom — the workflow
// still publishes correctly from `main`. Each case below mutates the real
// workflow into exactly one of those regressions and requires the checker to
// name it, so the assertions cannot pass by never looking at anything.
describe("what's new publish workflow trust boundary", () => {
  let workflow: string;

  beforeEach(async () => {
    workflow = await readFile(path.join(repoRoot, WHATS_NEW_WORKFLOW_PATH), "utf8");
  });

  /**
   * Apply one textual regression. Asserting the edit landed is the point: a
   * mutation that silently no-ops would leave the "this goes red" case green
   * for the wrong reason.
   */
  function mutate(source: string, find: string, replace: string): string {
    expect(source).toContain(find);
    const mutated = source.replace(find, replace);
    expect(mutated).not.toBe(source);
    return mutated;
  }

  test("the shipped workflow satisfies the boundary", () => {
    expect(findWhatsNewWorkflowViolations(workflow)).toEqual([]);
  });

  test("the parser sees the two real jobs, so the assertions are not vacuous", () => {
    expect(workflowJobNames(workflow)).toEqual(["validate", "publish"]);
    const parsed = parseWorkflowJobs(workflow);
    expect(parsed).not.toBeNull();
    expect(JSON.stringify(parsed?.jobs.get("validate"))).toContain("scripts/check-whats-new-document.ts");
    expect(JSON.stringify(parsed?.jobs.get("publish"))).toContain("publish_whats_new.py");
  });

  // The regression the reviewer named: the environment expression drifts off
  // the credential-bearing job and onto the one that any ref can dispatch.
  test("moving the environment onto the arbitrary-ref job is rejected", () => {
    const lifted = mutate(workflow, "    environment: whats-new-publish\n", "");
    const onValidate = mutate(
      lifted,
      "  validate:\n    name: validate document\n",
      "  validate:\n    name: validate document\n    environment: whats-new-publish\n",
    );
    const reported = findWhatsNewWorkflowViolations(onValidate).join("\n");
    expect(reported).toContain("job `validate` declares environment `whats-new-publish`");
    expect(reported).toContain("job `publish` declares environment (none)");
  });

  test("a mistyped environment name is rejected", () => {
    const mutated = mutate(workflow, "environment: whats-new-publish", "environment: whats-new-publish-2");
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("it must be exactly `whats-new-publish`");
  });

  test("dropping the environment entirely is rejected", () => {
    const mutated = mutate(workflow, "    environment: whats-new-publish\n", "");
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("declares environment (none)");
  });

  test("unhooking publish from validate is rejected", () => {
    const mutated = mutate(workflow, "    needs: validate\n", "");
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("must declare `needs: validate`");
  });

  test("publishing past a failed validate is rejected", () => {
    const mutated = mutate(
      workflow,
      "    if: needs.validate.outputs.publish == 'true'",
      "    if: always() && needs.validate.outputs.publish == 'true'",
    );
    const reported = findWhatsNewWorkflowViolations(mutated).join("\n");
    expect(reported).toContain("uses `always()`");
  });

  test("a dry run that can still publish is rejected", () => {
    const mutated = mutate(workflow, "    if: needs.validate.outputs.publish == 'true'\n", "");
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain(
      "must be gated on `if: needs.validate.outputs.publish == 'true'`",
    );
  });

  test.each(["CLOUDFLARE_R2_WHATS_NEW_AK", "CLOUDFLARE_R2_WHATS_NEW_BUCKET"] as const)(
    "reading %s from the arbitrary-ref job is rejected",
    (secret) => {
      const mutated = mutate(
        workflow,
        "      - name: Setup Node.js",
        `      - name: Leak\n        env:\n          STOLEN: \${{ secrets.${secret} }}\n        run: env\n\n      - name: Setup Node.js`,
      );
      const reported = findWhatsNewWorkflowViolations(mutated).join("\n");
      expect(reported).toContain("job `validate` reads the `secrets` context");
      expect(reported).toContain(secret);
    },
  );

  /** A step that exfiltrates whatever `expression` resolves to. */
  function leakStep(expression: string): string {
    return ["      - name: Leak", "        env:", `          STOLEN: ${expression}`, "        run: env", ""].join(
      "\n",
    );
  }

  /** Splice a step into `validate`, the job any ref can dispatch. */
  function intoValidate(source: string, step: string): string {
    return mutate(source, "      - name: Setup Node.js", `${step}\n      - name: Setup Node.js`);
  }

  // GitHub's expression language reaches a secret in more shapes than
  // `secrets.NAME`, and a detector that enumerates shapes is only ever as good
  // as the list someone thought of. Each of these was verified to slip past
  // dot-notation matching, returning an empty violation list — in the guard
  // that exists specifically to stop a secret reaching the arbitrary-ref job.
  test.each([
    ["single-quoted bracket", "${{ secrets['UNRELATED_SECRET'] }}"],
    ["double-quoted bracket", '${{ secrets["UNRELATED_SECRET"] }}'],
    ["bracket with inner whitespace", "${{ secrets [ 'UNRELATED_SECRET' ] }}"],
    ["dot with surrounding whitespace", "${{ secrets . UNRELATED_SECRET }}"],
    ["the whole context serialized", "${{ toJSON(secrets) }}"],
    ["the whole context bare", "${{ secrets }}"],
    ["the whole context round-tripped", "${{ fromJSON(toJSON(secrets)).UNRELATED_SECRET }}"],
    ["an expression folded across lines", "${{\n            secrets.UNRELATED_SECRET\n            }}"],
  ] as const)("a secret reaching the arbitrary-ref job as %s is rejected", (_shape, expression) => {
    const mutated = intoValidate(workflow, leakStep(expression));
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("job `validate` reads");
  });

  // The one shape no raw-text scanner can see: a double-quoted YAML scalar
  // with a backslash line continuation. The source never contains the string
  // `secrets`; the parsed value does. Only reading the document as YAML — not
  // as text — closes this.
  test("a secret hidden by a YAML line continuation is rejected", () => {
    const hidden = ['          STOLEN: "${{ sec\\', "            rets.UNRELATED_SECRET }}\""].join("\n");
    const step = ["      - name: Leak", "        env:", hidden, "        run: env", ""].join("\n");
    const mutated = intoValidate(workflow, step);
    // Precondition: the giveaway substring is genuinely absent from the source,
    // so a passing assertion below cannot be text matching by accident.
    expect(mutated).not.toContain("secrets.UNRELATED_SECRET");
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("job `validate` reads");
  });

  test.each([
    ["a run: block", "      - name: Leak\n        run: echo ${{ secrets['UNRELATED_SECRET'] }}\n"],
    [
      "a with: input",
      "      - name: Leak\n        uses: actions/github-script@v8\n        with:\n          github-token: ${{ secrets['UNRELATED_SECRET'] }}\n",
    ],
  ] as const)("a secret reaching the arbitrary-ref job through %s is rejected", (_where, step) => {
    const mutated = intoValidate(workflow, step);
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("job `validate` reads");
  });

  // `secrets:` as a job key passes credentials into a called workflow without
  // any `${{ }}` expression at all, so expression scanning alone cannot see it.
  test("passing secrets into a called workflow is rejected", () => {
    // No `${{ }}` anywhere, so expression scanning alone cannot see this one.
    const mutated = mutate(
      workflow,
      "  validate:\n    name: validate document\n",
      "  validate:\n    name: validate document\n    secrets:\n      PASSED: literal\n",
    );
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("job `validate` declares a `secrets:` key");
  });

  // A document this guard cannot understand must fail, never pass quietly:
  // "no violations found" and "nothing was examined" have to be distinct.
  test.each([
    ["unparseable YAML", (source: string) => `${source}\n  : : :\n`],
    ["a jobs mapping written in flow style", () => "name: x\njobs: {validate: {runs-on: a}, publish: {runs-on: b}}\n"],
    ["a renamed publish job", (source: string) => source.replace("  publish:\n", "  upload:\n")],
  ] as const)("%s fails closed", (_shape, transform) => {
    expect(findWhatsNewWorkflowViolations(transform(workflow)).length).toBeGreaterThan(0);
  });

  test("any secret at all on the arbitrary-ref job is rejected, not just the R2 four", () => {
    const mutated = mutate(
      workflow,
      "      - name: Setup Node.js",
      "      - name: Leak\n        env:\n          STOLEN: ${{ secrets.GITHUB_TOKEN }}\n        run: env\n\n      - name: Setup Node.js",
    );
    const reported = findWhatsNewWorkflowViolations(mutated).join("\n");
    expect(reported).toContain("job `validate` reads the `secrets` context");
    expect(reported).toContain("GITHUB_TOKEN");
  });

  test("dropping one of the four credential bindings is rejected", () => {
    const mutated = mutate(
      workflow,
      "          WHATS_NEW_STORAGE_BUCKET: ${{ secrets.CLOUDFLARE_R2_WHATS_NEW_BUCKET }}\n",
      "",
    );
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain(
      "no longer reads `secrets.CLOUDFLARE_R2_WHATS_NEW_BUCKET`",
    );
  });

  test("handing the whole secret store to a called workflow is rejected", () => {
    const mutated = mutate(
      workflow,
      "  validate:\n    name: validate document\n",
      "  validate:\n    name: validate document\n    secrets: inherit\n",
    );
    expect(findWhatsNewWorkflowViolations(mutated).join("\n")).toContain("job `validate` declares a `secrets:` key");
  });

  // The boundary has to be checked by something that actually runs. An edit to
  // `.github/workflows/whats-new-publish.yml` selects neither
  // `web_tests_required` nor `ui_p0_validation_required`, so the `e2e_vitest`
  // workload holding this file does NOT run for it. `pnpm guard` does, from
  // the unconditional preflight job — which is why the assertions above live
  // in a guard check rather than only here.
  test("the check is registered in the public guard entrypoint", () => {
    const names = execFileSync("pnpm", ["--silent", "guard", "--list-checks"], {
      cwd: repoRoot,
      encoding: "utf8",
    })
      .trim()
      .split("\n");
    expect(names).toContain("what's new publish workflow");
  });
});
