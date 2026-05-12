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
}:
# Builds the @open-design/web Next.js static export.
#
# Output layout: $out/ contains the contents of `apps/web/out/` (an
# index.html plus _next/ and asset subdirectories). Drop $out into any
# static file server.
#
# OD_DAEMON_URL is set to "" at build time so the bundled JS issues
# relative requests (`/api/*`, `/artifacts/*`, `/frames/*`) instead of
# baking a build-time daemon URL into the export. The serving
# environment is therefore expected to be same-origin with the daemon —
# the bundled caddy in the modules reverse-proxies those paths to
# `127.0.0.1:<cfg.port>`, and a custom nginx/caddy must do the same.
let
  pname = "open-design-web";
  version = (lib.importJSON ../package.json).version;

  # Vendored pnpm store. The hash MUST be pinned on first build:
  # `nix build .#web` will fail with the expected hash printed; copy
  # that into `pnpmDepsHash` below. Bump it whenever pnpm-lock.yaml
  # changes.
  pnpmDepsHash = "sha256-HFLm+8hv3o5x3Xem4MXNsNclIgiVRc70+EBafL0rVn8=";
  # pnpmDepsHash = lib.fakeHash;
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version src;

    nativeBuildInputs = [
      nodejs
      pnpm_10
      pnpmConfigHook
    ];

    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version src;
      hash = pnpmDepsHash;
      fetcherVersion = 3;
    };

    env = {
      NODE_ENV = "production";
      OD_DAEMON_URL = "";
    };

    buildPhase = ''
      runHook preBuild
      for target in \
        packages/contracts \
        packages/sidecar-proto \
        packages/sidecar \
        packages/platform
      do
        pnpm -C "$target" run --if-present build
      done

      # next.config.ts gates static-export emission on NODE_ENV=production
      # and writes to apps/web/out/.
      pnpm --filter @open-design/web run build
      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall
      mkdir -p $out
      cp -r apps/web/out/. $out/
      runHook postInstall
    '';

    passthru = {
      inherit nodejs;
      pnpmDeps = finalAttrs.pnpmDeps;
    };

    meta = with lib; {
      description = "Open Design — Next.js static SPA (apps/web)";
      homepage = "https://github.com/nexu-io/open-design";
      license = licenses.asl20;
      platforms = platforms.linux ++ platforms.darwin;
    };
  })
