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
  pnpmDepsSrc ? src,
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
  rebuildNativeAddons = import ./rebuild-native-addons.nix { inherit lib nodejs; };
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version src;

    pnpmWorkspaces = pnpmWorkspaceFilters;

    nativeBuildInputs = [
      nodejs
      pnpm_10
      pnpmConfigHook
      makeWrapper
      # Required to rebuild native addons (better-sqlite3, node-pty) from
      # source. node-gyp drives this via Python; gnumake/pkg-config + the C++
      # compiler from stdenv complete the toolchain.
      python3
      gnumake
      pkg-config
    ];

    # `fetchPnpmDeps` defaults to `pkgs.pnpm`; pin to the flake's
    # `pnpm_10` so the dep-fetch matches the install phase.
    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version;
      src = pnpmDepsSrc;
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

      # Build native addons (better-sqlite3, node-pty) from source.
      #
      # Shared with nix/package-desktop.nix via rebuild-native-addons.nix;
      # that file documents why each addon must be compiled here (no usable
      # prebuild for our Node target / platform) and why node-gyp is invoked
      # directly instead of `pnpm rebuild`.
      ${rebuildNativeAddons { messageSuffix = "pnpm install may have failed"; }}

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

      # Runtime package exports point at dist/. Keep workspace package
      # manifests for Node resolution and prune source/test/build config files
      # before Nix fixup scans the output tree.
      for target in ${lib.escapeShellArgs workspacePaths}; do
        if [ "$target" = "apps/daemon" ]; then
          find "$out/lib/open-design/$target" -mindepth 1 -maxdepth 1 \
            ! -name dist \
            ! -name bin \
            ! -name node_modules \
            ! -name package.json \
            -exec rm -rf {} +
        else
          find "$out/lib/open-design/$target" -mindepth 1 -maxdepth 1 \
            ! -name dist \
            ! -name node_modules \
            ! -name package.json \
            -exec rm -rf {} +
        fi
      done

      # Root devDependencies expose non-daemon workspaces via pnpm symlinks,
      # but the daemon derivation intentionally filters those sources out
      # when they are not needed at runtime. Prune the dangling symlinks from
      # the copied node_modules tree so Nix fixup does not fail on broken
      # links.
      rm -f \
        $out/lib/open-design/node_modules/@open-design/components \
        $out/lib/open-design/node_modules/@open-design/tools-dev \
        $out/lib/open-design/node_modules/@open-design/tools-pack \
        $out/lib/open-design/node_modules/@open-design/tools-release \
        $out/lib/open-design/node_modules/@open-design/tools-serve \
        $out/lib/open-design/node_modules/.bin/tools-dev \
        $out/lib/open-design/node_modules/.bin/tools-pack \
        $out/lib/open-design/node_modules/.bin/tools-release \
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
      description = "OpenDesign daemon — local agent orchestrator + API (`od` CLI)";
      homepage = "https://github.com/nexu-io/open-design";
      license = licenses.asl20;
      mainProgram = "od";
      platforms = platforms.linux ++ platforms.darwin;
    };
  })
