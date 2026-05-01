{
  lib,
  stdenv,
  dream2nix,
  nixpkgs,
  system,
  nodejs,
  pnpm_10,
  fetchPnpmDeps,
  src,
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
#   The repo pins `packageManager: pnpm@10.33.2`; nixpkgs ships pnpm
#   10.33.0 (`pkgs.pnpm_10`). pnpm 10.x is forward-compatible across
#   patch versions and only emits a warning, not an error.
#
# Workspace siblings the daemon depends on (contracts, sidecar-proto,
# sidecar, platform) are built in dependency order before the daemon
# itself; tsc emits each package's dist/, which is what the daemon
# resolves at runtime via pnpm's symlinked node_modules.
let
  pname = "open-design-daemon";
  version = "0.1.0";

  # Vendored pnpm store. The hash MUST be pinned on first build:
  # `nix build .#daemon` will fail with the expected hash printed; copy
  # that into `pnpmDepsHash` below. Bump it whenever pnpm-lock.yaml
  # changes.
  pnpmDepsHash = "sha256-+aXODhoOgjnd5WpRoWufwCEVER4xUZHeZKZkmGWHUPo=";
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version src;

    nativeBuildInputs = [
      nodejs
      pnpm_10
      pnpm_10.configHook
      makeWrapper
      # Required to rebuild better-sqlite3's native binding from source.
      # node-gyp drives this via Python; gnumake/pkg-config + the C++
      # compiler from stdenv complete the toolchain.
      python3
      gnumake
      pkg-config
    ];

    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version src;
      hash = pnpmDepsHash;
      fetcherVersion = 3;
    };

    env.NODE_ENV = "production";

    # pnpm_10.configHook runs in postConfigureHooks: it unpacks
    # `pnpmDeps`, points pnpm at the unpacked store, and runs
    # `pnpm install --offline --ignore-scripts --frozen-lockfile`.
    # No custom configurePhase needed.

    buildPhase = ''
      runHook preBuild

      # better-sqlite3 ships prebuilts on npm but the configHook ran
      # `pnpm install --ignore-scripts`, so the native binding wasn't
      # built yet. Rebuild from source now that python3 + gnumake + the
      # C++ compiler are on PATH. `npm_config_build_from_source=true`
      # forces compilation rather than the prebuild-install download
      # path (which would need network access we don't have here).
      export npm_config_build_from_source=true
      pnpm rebuild better-sqlite3

      for target in \
        packages/contracts \
        packages/sidecar-proto \
        packages/sidecar \
        packages/platform \
        apps/daemon
      do
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
