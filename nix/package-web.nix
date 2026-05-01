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
  version = "0.1.0";
  pnpmDepsHash = "sha256-+aXODhoOgjnd5WpRoWufwCEVER4xUZHeZKZkmGWHUPo=";
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version src;

    nativeBuildInputs = [
      nodejs
      pnpm_10
      pnpm_10.configHook
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
