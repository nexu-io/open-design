# Motion in the OpenDesign repository

Motion lives in `plugins/motion/` as a standalone npm application. This directory contains its editor, local service, MCP, Skills, templates, tests and packaging tools. The OD bundled-plugin walker still scans only `plugins/_official/`; moving source here does not register Motion in the OD gallery or merge the applications' session stores.

## Source baseline

- Source: `core/open-motion`, commit `03a9f4d8506135a82feb4667551761ffcc87f01b` (2026-11-06 inspection).
- This snapshot includes source main `282aa8960cd384af80e1434eb55baa64e5923349` and the npm installer changes from source PR #27. That PR was not merged as part of this import.
- Source history remains in the original repository. OD records a source import rather than merging unrelated Git histories. Studio and template-library LICENSE/NOTICE files and font notices are preserved.
- Generated builds, dependencies, user projects, credentials and local evidence are excluded.

## Build from the OD repository root

```sh
npm --prefix plugins/motion ci
npm --prefix plugins/motion run check
npm --prefix plugins/motion run typecheck:studio
npm --prefix plugins/motion run package:npm
```

Use the Node version pinned in `.github/workflows/motion.yml` for reproducible packaging. Motion retains `package.json`, `package-lock.json`, its own dependency versions, and `scripts/runtime-lock.json`; it is intentionally outside OD's pnpm workspace. Do not replace this lockfile with OD's pnpm lockfile: downloaded application archives install their production dependencies using `npm ci`.

The output under `plugins/motion/dist/npm-local/` is a small installer `.tgz`, an independently installable application `.tar.gz`, a version manifest and SHA256 files. The application includes the built Studio, MCP and Skills. Browser and media programs are selected by OS/CPU from the pinned public runtime manifest and downloaded on first use. See [npm installation](npm-installation.md) for local artifact setup and supported hosts.

The package must work outside this checkout. Keep OD-private imports and unresolved `workspace:`, `link:` or `file:` dependencies out of distributable manifests. User data stays in the installer's selected data directory and is not relocated by this source import.

For a source checkout, run the existing module commands after `cd plugins/motion`. `bash plugins/motion/scripts/install-motion.command` installs from an existing checkout. The repository's `install.sh` now sparse-checks out this module from OpenDesign; its default-main URL works after the PR is merged. Existing external host manifests and installation formats remain separate from OD's `open-design.json` catalog format.

## CI and distribution

The root `.github/workflows/motion.yml` validates this independent distribution when Motion or its workflow changes. It builds and checks npm artifacts and the nine-tool phase-one ZIP. Manual builds default to npm; `format=full` keeps complete Mac/Windows ZIP construction available. There is no npm, Release or storage publication in this workflow, and requesting publication fails visibly. Artifacts are constructed in the runner only; this migration does not introduce a new public download service or personal cloud storage.

The legacy Forgejo upload helper and `scripts/publish-test-package.mjs` are retained for the existing company distribution integration, but are not called by OD CI. Release targeting and source-commit provenance must be configured for the intended company distribution repository before enabling publication from OD. The npm installer remains `private: true`; a successful local build is not a public npm release.

Accounts, billing, cloud-agent execution, OD desktop bundling and combined session navigation are outside this migration. Imported historical acceptance documents describe their original source baseline, not automatic acceptance of the new checkout.
