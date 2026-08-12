# Website output modes

Open Design can enforce a daemon-wide website layout for every run surface,
including the web UI, CLI, MCP, and A2A. The mode is optional and immutable
for the lifetime of the daemon.

## Start the service

Direct daemon startup:

```powershell
od --site-output-mode single-html
od --site-output-mode multi-file
```

Development startup:

```powershell
pnpm tools-dev run web --site-output-mode single-html
pnpm tools-dev run web --site-output-mode multi-file
```

Hosted and packaged launchers can set `OD_SITE_OUTPUT_MODE` to either value.
The CLI option takes precedence over the environment variable. When neither is
set, Open Design behaves exactly as before and does not add output-policy
prompting, repair, validation, or response metadata.

## Result layouts

`single-html` produces exactly one visible website file:

```text
index.html
```

CSS and JavaScript are inline, local binary resources become data URLs, and
remote runtime dependencies are localized through Open Design's SSRF-protected
asset fetch boundary or replaced/removed with a warning.

`multi-file` produces at least:

```text
index.html
styles.css
script.js
assets/
```

Additional HTML, CSS, and JavaScript files are allowed. Binary resources live
under `assets/`; the directory is created even when it is empty.

## Enforcement behavior

The selected policy is added to the stable agent prompt, then enforced again
after generated artifacts are persisted. Repair is staged beneath the resolved
daemon data root, validated before commit, validated again after commit, and
rolled back on failure. Hidden Open Design and source-control directories are
outside the visible website repair set.

Clarification-only turns that return a valid `<question-form>` do not run the
website postprocessor. The eventual production turn does. A constrained
production turn that has no usable HTML fails without replacing the existing
website files.

Successful constrained runs expose an `outputPolicy` summary through run
status and the final A2A artifact. Existing clients remain compatible because
the field is optional.
