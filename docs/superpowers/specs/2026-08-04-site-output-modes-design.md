# Service-level website output modes

## Summary

Open Design will support two optional, daemon-wide website output policies:

- `single-html`: every successful website run produces one self-contained
  `index.html` file;
- `multi-file`: every successful website run produces a predictable multi-file
  website rooted at `index.html`, with CSS, JavaScript, and an `assets/`
  directory.

The policy is selected when the daemon starts. If no policy is selected, Open
Design keeps its current behavior without prompt, filesystem, response, or
deployment changes.

The selected policy applies to runs started from every surface that uses the
daemon run pipeline, including the web application, the `od` CLI, A2A, MCP, and
other agent integrations. A request cannot override the daemon-wide policy.

## Goals

1. Make generated websites predictable enough to package and deploy without
   relying on the selected agent to follow formatting instructions perfectly.
2. Preserve the current unrestricted output behavior when no mode is selected.
3. Apply the same policy to every agent runtime and request surface.
4. Prevent a run from reporting success with a website that violates the
   selected policy.
5. Keep automatic repair recoverable and bounded.

## Non-goals

- Changing the current deployment provider implementations.
- Adding an in-product mode selector to the web UI. This is an operator-level
  daemon startup policy.
- Intercepting or replacing individual agent filesystem tools.
- Supporting a per-project or per-run output-mode override in the first
  version.
- Guaranteeing that an empty directory is visible after upload to hosting
  providers that do not represent empty directories.

## Selected approach

The implementation combines three enforcement layers:

1. A prompt contract tells the agent which output structure it must produce.
2. A deterministic postprocessor repairs the generated website after all agent
   output has been persisted.
3. A strict validator gates successful run completion.

Prompt-only enforcement is insufficient because an agent can ignore or
partially follow instructions. Intercepting every filesystem operation would
require runtime-specific work across Codex, Claude, OpenCode, ACP, and other
adapters. The selected approach uses the existing shared run-finalization path,
so one implementation covers every runtime.

## Startup contract

### Supported values

The canonical option is:

```text
--site-output-mode single-html
--site-output-mode multi-file
```

The corresponding environment variable is:

```text
OD_SITE_OUTPUT_MODE=single-html
OD_SITE_OUTPUT_MODE=multi-file
```

When neither is supplied, the resolved mode is `none` and current behavior is
preserved.

### Precedence and validation

Precedence is:

1. command-line option;
2. `OD_SITE_OUTPUT_MODE`;
3. `none`.

An empty value, an unsupported value, or a missing value after the CLI option
must fail startup with a concise error. A single enum option is used instead of
two booleans so mutually exclusive modes cannot be enabled together.

### Entry points

The option is supported by direct daemon startup and by `tools-dev`:

```powershell
od --site-output-mode single-html
od --site-output-mode multi-file

pnpm tools-dev run web --site-output-mode single-html
pnpm tools-dev run web --site-output-mode multi-file
```

`tools-dev` validates the value and propagates it to the daemon sidecar as
`OD_SITE_OUTPUT_MODE`. Packaged or hosted launchers may use the same environment
variable without adding the mode to the five-field sidecar process stamp.

The mode is resolved once when the daemon starts and remains immutable for the
life of that process. Switching modes requires a daemon restart.

## Scope of filesystem enforcement

The policy applies to the current project's visible, deployable website files.
Hidden and internal directories such as `.od/`, `.od-skills/`, `.git/`, and
daemon scratch data are outside the repair set.

This scope matches the current deployment behavior, which includes visible
project files. It also avoids deleting Open Design runtime state while allowing
the postprocessor to normalize files generated earlier in the same managed
project.

Path handling must:

- resolve every candidate relative to the project root;
- reject traversal outside the project root;
- refuse to follow symlinks outside the project root;
- use platform-correct path handling on Windows and POSIX;
- enforce bounded file counts and byte limits before buffering or encoding
  assets.

## Prompt enforcement

The selected mode contributes a stable system-instruction block to every run.
It is included in the stable prompt fingerprint, so changing the daemon mode
invalidates resumable-session prompt reuse rather than silently continuing with
the old policy.

The prompt block:

- names the required file structure;
- prohibits external runtime dependencies;
- tells the agent where images, fonts, CSS, and JavaScript must live;
- tells the agent that a deterministic validator will reject nonconforming
  output;
- does not replace discovery, skills, workflows, design systems, or the user's
  request.

No prompt block is added in `none` mode.

## Shared finalization flow

For a successful agent process, website enforcement runs after plain-stream
artifacts have been persisted and before HTML version snapshots and successful
run finalization:

```text
agent exits successfully
  -> persist streamed artifacts
  -> repair selected site output mode
  -> validate repaired output
  -> snapshot HTML versions
  -> persist delivered session state
  -> mark run succeeded
```

This placement ensures the repairer sees every artifact regardless of the
agent's output protocol and ensures version snapshots represent the delivered,
repaired HTML.

Non-website runs with no HTML output are not silently converted into a website.
When a constrained service receives a website-generation run that produces no
usable HTML, repair cannot preserve the requested content, so the run is rolled
back and failed rather than returning a fabricated success page.

## Transaction and recovery

Repair uses a staged transaction:

1. Enumerate and validate the visible website file set.
2. Copy the pre-repair file set to a run-scoped backup beneath the resolved
   daemon data root.
3. Build the repaired result in a bounded staging directory beneath the daemon
   data root.
4. Validate the staged result.
5. Replace only the visible website output paths.
6. Validate the committed result once more.
7. On any error, restore the original file set and fail the run.

Backups and staging data are daemon-owned data and therefore derive from the
resolved daemon data root. They are not written into the visible project tree.
Cleanup is best-effort after a successful commit; failed restoration is logged
as a high-severity diagnostic and the run remains failed.

## `single-html` policy

### Required result

The visible output contains exactly:

```text
index.html
```

Project metadata is updated so `entryFile` is `index.html`.

### Entry selection

The source entry is selected in this order:

1. a valid existing project `metadata.entryFile`;
2. `index.html`;
3. the only HTML file generated or modified by the run;
4. a deterministic first HTML candidate when several remain.

If several pages exist, only the selected entry page is delivered in
`single-html` mode. The repair summary records the omitted pages as warnings.

### Transformation

The postprocessor:

- inlines local stylesheets into `<style>` elements;
- recursively resolves CSS `@import` statements;
- rewrites CSS `url(...)` resources to data URLs;
- bundles local JavaScript and module dependencies into inline scripts;
- converts local images, icons, and fonts into MIME-correct Base64 data URLs;
- preserves literal inline SVG;
- rewrites referenced local binary resources before deleting source files;
- removes every other visible website file after the staged output passes
  validation.

Remote images, fonts, stylesheets, scripts, frames, and other runtime resources
are prohibited. Ordinary navigation links such as `<a href="https://...">`
remain allowed because they are user navigation, not runtime dependencies.

### Validation

The strict validator requires:

- one visible file named `index.html`;
- no visible sibling files or directories;
- no local or remote stylesheet and script references;
- no unresolved module import that requires another file;
- no external resource URLs in HTML or CSS;
- image resources represented as Base64 data URLs or literal inline SVG;
- every data URL to have a valid media type and decodable payload;
- valid project-relative metadata with `entryFile: index.html`.

## `multi-file` policy

### Required result

The minimum structure is:

```text
index.html
styles.css
script.js
assets/
```

Additional HTML, CSS, and JavaScript files are allowed. The visible root may
contain HTML, CSS, JavaScript, and the `assets/` directory only. The
`assets/` tree contains binary site resources such as images, icons, and fonts.

An empty `assets/` directory is created when no binary resources exist. Hosting
providers generally do not transmit empty directories, so its guaranteed
existence applies to the local generated project, not to a provider's remote
file listing.

### Transformation

The postprocessor:

- normalizes the selected entry page to `index.html`;
- externalizes inline CSS into local CSS files and ensures `styles.css`
  exists;
- externalizes inline JavaScript and module dependencies into local JavaScript
  files and ensures `script.js` exists;
- decodes image and font data URLs into `assets/`;
- moves local images, icons, and fonts into `assets/`;
- rewrites HTML, CSS, and JavaScript resource paths after moves;
- uses a content hash in colliding asset names so distinct files are never
  overwritten;
- creates empty canonical CSS and JavaScript files when the page genuinely
  requires neither;
- removes or relocates visible files outside the allowed structure only after
  staged validation succeeds.

All runtime resource references must be relative and remain inside the visible
output root. Remote runtime dependencies and image data URLs are not permitted
in the final multi-file result. Literal inline SVG remains allowed.

### Validation

The strict validator requires:

- `index.html` and at least one HTML file;
- at least one CSS file and one JavaScript file;
- an `assets/` directory, even when empty;
- no visible root entries outside the allowed structure;
- no remote runtime-resource URL;
- no Base64 image or font resource that should have been extracted;
- no broken, traversing, or root-absolute resource reference;
- every local reference to resolve to an existing file inside the output root;
- project metadata with `entryFile: index.html`.

## External resource repair

Both constrained modes prohibit external runtime dependencies.

The repairer may download a remote resource only through an existing Open
Design safe-fetch boundary that enforces SSRF protection, redirects, content
type, response size, and timeouts. It must not add an unrestricted `fetch()`
path.

When localization fails:

- an image is replaced with a local, MIME-correct placeholder;
- a font declaration is rewritten to a safe system-font fallback;
- an external stylesheet, script, frame, or unsupported dependency is removed;
- the repair result records a warning describing the degraded resource.

The repaired output still has to pass the same strict validator. Warnings do
not permit a policy violation.

## Failure semantics

A constrained run never reports success with invalid output.

If deterministic repair cannot produce compliant output within safety limits,
the daemon:

1. restores the pre-repair visible output;
2. emits a structured non-retryable site-output diagnostic;
3. marks the run failed;
4. retains a bounded repair summary for observability.

Examples include unreadable files, unsafe paths, irrecoverably malformed HTML,
missing usable HTML, output-size overflow, failed commit, or failed final
validation.

There is no second model call in this version. Repair is deterministic, so it
does not add provider cost or another nondeterministic generation step.

## Result and A2A metadata

Successful constrained runs expose a summary shaped like:

```json
{
  "outputPolicy": {
    "mode": "single-html",
    "validation": "passed",
    "repaired": true,
    "warnings": [],
    "entryFile": "index.html"
  }
}
```

The summary is attached to run diagnostics and, when A2A is used, to the final
Open Design artifact metadata. Contract additions are optional so existing A2A
clients remain compatible. In `none` mode, the field is absent.

The summary never includes local absolute paths, backup paths, secrets, or
resource contents.

## Code boundaries

### New daemon modules

```text
apps/daemon/src/site-output/
  mode.ts
  prompt.ts
  enforce.ts
  single-html.ts
  multi-file.ts
  validate.ts
  resources.ts
```

- `mode.ts`: mode type, environment and CLI parsing, precedence, startup
  errors.
- `prompt.ts`: stable prompt block for the selected mode.
- `enforce.ts`: transaction orchestration and repair summary.
- `single-html.ts`: single-file transformation.
- `multi-file.ts`: multi-file transformation.
- `validate.ts`: policy-independent enumeration and mode-specific validators.
- `resources.ts`: bounded MIME detection, Base64 conversion, safe resource
  localization, and reference rewriting.

These modules receive explicit project and daemon-data paths. They do not infer
daemon data roots from the current working directory.

### Existing modules

- `apps/daemon/src/daemon-startup.ts`: parse the direct daemon CLI option.
- `apps/daemon/src/server.ts`: resolve and wire the immutable service policy,
  add the prompt block to the stable fingerprint, and call enforcement before
  successful finalization.
- `tools/dev/src/cli-args.ts`: treat `--site-output-mode` as a valued option.
- `tools/dev/src/config.ts`: add the typed option.
- `tools/dev/src/index.ts`: validate and propagate `OD_SITE_OUTPUT_MODE` to the
  daemon sidecar.
- `packages/contracts/src/api/a2a.ts`: add optional output-policy result types.
- `apps/daemon/src/a2a/daemon-client.ts`: expose the per-run result summary in
  the final A2A artifact.
- A2A and operator documentation: document startup examples and compatibility.

The output mode is not added to the sidecar process stamp. The stamp must keep
its existing five fields.

## Test plan

### Parsing and propagation

- direct CLI accepts both supported values;
- `tools-dev` accepts and propagates both supported values;
- CLI overrides the environment value;
- absent configuration resolves to `none`;
- missing and unsupported values fail startup;
- default-start argument rewriting does not mistake the option value for an
  application name.

### Single-file repair

- CSS and JavaScript are inlined;
- nested CSS imports and URLs are resolved;
- images, icons, and fonts become valid Base64 data URLs;
- module dependencies are bundled;
- additional pages and visible files are removed only after validation;
- internal hidden directories remain untouched;
- external resources localize or degrade with warnings;
- invalid and oversized resources fail and restore the original tree;
- Windows path separators and case behavior are covered.

### Multi-file repair

- a single inline HTML page becomes the canonical minimum tree;
- additional HTML pages are preserved;
- CSS and JavaScript files are always present;
- Base64 resources are extracted to `assets/`;
- local resources move to `assets/` and references are rewritten;
- name collisions use content hashes;
- `assets/` exists when empty;
- external dependencies do not remain;
- unsupported visible files are removed or relocated transactionally;
- broken and traversing references fail validation and restore the tree.

### Run and protocol integration

- repair runs after plain-stream artifact persistence and before version
  snapshots;
- all supported agent stream formats use the same finalization hook;
- a repair failure prevents `succeeded` status;
- the repaired entry file is reflected in project metadata and previews;
- A2A completion includes optional output-policy metadata;
- the A2A clarification loop continues to work under both modes;
- `none` mode leaves prompts, files, run results, and A2A artifacts unchanged.

### Validation commands

```powershell
pnpm --filter @open-design/daemon test
pnpm --filter @open-design/daemon typecheck
pnpm --filter @open-design/tools-dev typecheck
pnpm --filter @open-design/tools-dev build
pnpm guard
pnpm typecheck
```

Focused tests should run before full workspace validation.

## Acceptance criteria

- Starting without a mode produces no behavior change.
- Starting with `single-html` makes every successful website run deliver only
  a self-contained `index.html` with no external runtime dependencies.
- Starting with `multi-file` makes every successful website run deliver the
  required local multi-file structure with no external runtime dependencies.
- A mode cannot be overridden by an individual web, CLI, MCP, or A2A request.
- Invalid repaired output is rolled back and the run fails.
- Internal Open Design files are never deleted by site-output repair.
- Existing A2A clients remain compatible.
