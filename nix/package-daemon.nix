{
  lib,
  stdenv,
  dream2nix,
  nixpkgs,
  system,
  nodejs,
  pnpm_10,
  fetchPnpmDeps,
  pnpmConfigHook,
  src,
  workspacePaths,
  makeWrapper,
  python3,
  gnumake,
  pkg-config,
}:
# Builds the @open-design/daemon workspace package — produces $out/bin/od.
#
# Implementation note on dream2nix:
#   The flake takes `dream2nix` as an input (per the project's Nix
#   contract) but the build itself uses stdenv.mkDerivation. dream2nix's
#   nodejs builders consume npm's package-lock.json — they have no
#   first-class pnpm-lock.yaml + workspace builder yet. When upstream
#   ships one, swap this file for a thin dream2nix module — the inputs
#   are already wired.
#
# pnpm version note:
#   `package.json` declares `engines.pnpm` and pnpm enforces it on
#   `pnpm install` (regardless of `engine-strict`). The nixpkgs
#   default `pnpm` is generally incompatible — older than the
#   floor or newer than the ceiling depending on which nixpkgs
#   the consumer follows. The flake overrides `pkgs.pnpm_10` to
#   the exact tarball pinned by `packageManager` (see flake.nix
#   for the override + hash bump). This derivation uses
#   `pnpm_10` for both phases: in `nativeBuildInputs` so the
#   install-phase `pnpmConfigHook` resolves it from PATH, and
#   `pnpm = pnpm_10` to `fetchPnpmDeps` to override its
#   `pkgs.pnpm` default.
#
# Workspace siblings the daemon depends on are built in dependency order
# before the daemon itself; tsc emits each package's dist/, which is what
# the daemon resolves at runtime via pnpm's symlinked node_modules.
let
  pname = "open-design-daemon";
  version = (lib.importJSON ../package.json).version;

  pnpmDepsHash = (import ./pnpm-deps.nix).daemonHash;
  pnpmWorkspaceFilters = map (workspacePath: "./${workspacePath}") workspacePaths;
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version src;

    pnpmWorkspaces = pnpmWorkspaceFilters;

    nativeBuildInputs = [
      nodejs
      pnpm_10
      pnpmConfigHook
      makeWrapper
      # Required to rebuild better-sqlite3's native binding from source.
      # node-gyp drives this via Python; gnumake/pkg-config + the C++
      # compiler from stdenv complete the toolchain.
      python3
      gnumake
      pkg-config
    ];

    # `fetchPnpmDeps` defaults to `pkgs.pnpm`; pin to the flake's
    # `pnpm_10` so the dep-fetch matches the install phase.
    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version src;
      hash = pnpmDepsHash;
      pnpm = pnpm_10;
      pnpmWorkspaces = pnpmWorkspaceFilters;
      fetcherVersion = 3;
    };

    env.NODE_ENV = "production";

    # pnpm_10.configHook runs in postConfigureHooks: it unpacks
    # `pnpmDeps`, points pnpm at the unpacked store, and runs
    # `pnpm install --offline --ignore-scripts --frozen-lockfile`.
    # No custom configurePhase needed.

    buildPhase = ''
      runHook preBuild

      # Build better-sqlite3's native binding from source.
      #
      # Why from source on Node 24:
      #   better-sqlite3 (even 12.9.0, latest as of 2026-05) only
      #   publishes prebuilds up to node-v131 (Node 22). No v137
      #   (Node 24) prebuild exists. `prebuild-install` would itself
      #   fail the GitHub fetch and fall through to a compile, so we
      #   skip the download attempt entirely and compile.
      #
      # Why not `pnpm rebuild`:
      #   In pnpm 10, `onlyBuiltDependencies` interacts with the
      #   "approve-builds" consent gate; `pnpm rebuild <pkg>` silently
      #   no-ops in some configurations. Invoke node-gyp directly to
      #   sidestep all of that.
      #
      # Env vars:
      #   * npm_config_nodedir → use the headers shipped with the
      #     nixpkgs nodejs we're already building against, so node-gyp
      #     doesn't try to fetch them from nodejs.org/dist (no network
      #     in the build sandbox).
      #   * npm_config_build_from_source → tell better-sqlite3's
      #     prebuild-install fallback chain to skip the CDN download
      #     and compile.
      #
      # node-gyp lookup:
      #   nixpkgs nodejs ships node-gyp bundled inside npm at
      #   ${nodejs}/lib/node_modules/npm/bin/node-gyp-bin. Putting
      #   that on PATH gives us a `node-gyp` shim without depending
      #   on pnpm-exec resolving from inside better-sqlite3's tree
      #   (better-sqlite3 doesn't list node-gyp as a direct dep).
      export npm_config_nodedir=${nodejs}
      export npm_config_build_from_source=true
      export PATH="${nodejs}/lib/node_modules/npm/bin/node-gyp-bin:$PATH"

      bsq_dir=$(find node_modules/.pnpm -mindepth 2 -maxdepth 4 \
        -type d -path '*/better-sqlite3@*/node_modules/better-sqlite3' \
        -print -quit)
      if [ -z "$bsq_dir" ]; then
        echo "ERROR: better-sqlite3 not found under node_modules/.pnpm — pnpm install may have failed" >&2
        exit 1
      fi

      echo "Building better-sqlite3 from source at $bsq_dir"
      ( cd "$bsq_dir" && node-gyp rebuild --release --build-from-source )

      # Fail fast if the .node file didn't land where bindings.js
      # looks for it. Without this assertion, a silent skip produces
      # a "valid" derivation that crashes at runtime with
      # "Could not locate the bindings file".
      if [ ! -f "$bsq_dir/build/Release/better_sqlite3.node" ]; then
        echo "ERROR: better_sqlite3.node was not produced at $bsq_dir/build/Release/" >&2
        find "$bsq_dir" -name '*.node' -print >&2 || true
        exit 1
      fi

      for target in ${lib.escapeShellArgs workspacePaths}; do
        pnpm -C "$target" run --if-present build
      done
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out/lib/open-design $out/bin

      # Copy the whole workspace tree — pnpm's symlinks under node_modules
      # resolve sibling packages by relative paths, so we cannot prune to
      # just apps/daemon.
      cp -r . $out/lib/open-design/

      # Root devDependencies expose non-daemon workspaces via pnpm symlinks,
      # but the daemon derivation intentionally filters those sources out
      # when they are not needed at runtime. Prune the dangling symlinks from
      # the copied node_modules tree so Nix fixup does not fail on broken
      # links.
      rm -f \
        $out/lib/open-design/node_modules/@open-design/components \
        $out/lib/open-design/node_modules/@open-design/tools-dev \
        $out/lib/open-design/node_modules/@open-design/tools-pack \
        $out/lib/open-design/node_modules/@open-design/tools-serve \
        $out/lib/open-design/node_modules/.bin/tools-dev \
        $out/lib/open-design/node_modules/.bin/tools-pack \
        $out/lib/open-design/node_modules/.bin/tools-serve

      chmod +x $out/lib/open-design/apps/daemon/dist/cli.js

      makeWrapper ${nodejs}/bin/node $out/bin/od \
        --add-flags $out/lib/open-design/apps/daemon/dist/cli.js \
        --set NODE_ENV production
      runHook postInstall
    '';

    passthru = {
      inherit nodejs;
      pnpmDeps = finalAttrs.pnpmDeps;
    };

    meta = with lib; {
      description = "Open Design daemon — local agent orchestrator + API (`od` CLI)";
      homepage = "https://github.com/nexu-io/open-design";
      license = licenses.asl20;
      mainProgram = "od";
      platforms = platforms.linux ++ platforms.darwin;
    };
  })
