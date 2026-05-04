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
# OD_DAEMON_URL is set to "" at build time so the static export does not
# resolve a localhost daemon during static generation. The runtime
# daemon URL is supplied by the serving environment (see
# nix/home-manager.nix and nix/nixos.nix, which export
# OD_DAEMON_URL=http://localhost:<cfg.port> into the static-server unit
# so the SPA can read it via the runtime config endpoint).
let
  pname = "open-design-web";
  version = (lib.importJSON ../package.json).version;

  # Vendored pnpm store. The hash MUST be pinned on first build:
  # `nix build .#web` will fail with the expected hash printed; copy
  # that into `pnpmDepsHash` below. Bump it whenever pnpm-lock.yaml
  # changes.
  pnpmDepsHash = "sha256-z6FsL7JIy0wEXDPvQgahlY9JbzV4ssx7K1/+fpS+mGA=";
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
