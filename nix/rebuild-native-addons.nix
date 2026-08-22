# Build native Node addons from source inside a Nix pnpm workspace install.
#
# Why from source:
#   Neither addon ships a usable prebuild for our runtime target, so the
#   packaged daemon/runtime must compile them during the derivation build:
#   - better-sqlite3 publishes prebuilds only up to node-v131 (Node 22);
#     there is no v137 (Node 24) prebuild, so `prebuild-install` would
#     fail its CDN/GitHub fetch and fall through to a compile anyway.
#   - node-pty@1.1.0 ships prebuilds for Darwin and Windows only; on Linux
#     the addon must always be compiled or `require("node-pty")` fails at
#     runtime and the daemon's /api/projects/:id/terminals route reports
#     TERMINAL_SPAWN_FAILED for every packaged terminal.
#
# Why not `pnpm rebuild`:
#   In pnpm 10, `onlyBuiltDependencies` interacts with the
#   "approve-builds" consent gate; `pnpm rebuild <pkg>` can silently
#   no-op. Invoke node-gyp directly to sidestep that path.
#
# Env vars:
#   * npm_config_nodedir → use the headers shipped with the nixpkgs nodejs
#     we're already building against, so node-gyp does not fetch them
#     (there is no network in the build sandbox).
#   * npm_config_build_from_source → skip prebuilt-binary download attempts.
#
# node-gyp lookup:
#   nixpkgs nodejs ships node-gyp bundled inside npm at
#   ${nodejs}/lib/node_modules/npm/bin/node-gyp-bin.
{ lib, nodejs }:
{
  # Human-readable context appended to "not found" errors.
  messageSuffix ? null,
}:
let
  suffix = lib.optionalString (messageSuffix != null && messageSuffix != "") " - ${messageSuffix}";

  addons = [
    {
      dirVar = "bsq_dir";
      findPath = "*/better-sqlite3@*/node_modules/better-sqlite3";
      artifact = "build/Release/better_sqlite3.node";
    }
    {
      dirVar = "pty_dir";
      findPath = "*/node-pty@*/node_modules/node-pty";
      artifact = "build/Release/pty.node";
    }
  ];

  renderAddon = addon:
    let
      # Bash variable reference for this addon's directory, built by
      # concatenation so the emitted script reads e.g. "$bsq_dir".
      dollarDirVar = "$" + addon.dirVar;
    in ''
      ${addon.dirVar}=$(find node_modules/.pnpm -mindepth 2 -maxdepth 4 \
        -type d -path '${addon.findPath}' \
        -print -quit)
      if [ -z "${dollarDirVar}" ]; then
        echo "ERROR: ${addon.findPath} not found under node_modules/.pnpm${suffix}" >&2
        exit 1
      fi

      echo "Building native addon from source at ${dollarDirVar}"
      ( cd "${dollarDirVar}" && node-gyp rebuild --release --build-from-source )

      # Fail fast if the .node file did not land where require() expects it.
      if [ ! -f "${dollarDirVar}/${addon.artifact}" ]; then
        echo "ERROR: ${addon.artifact} was not produced at ${dollarDirVar}/build/Release/" >&2
        find "${dollarDirVar}" -name '*.node' -print >&2 || true
        exit 1
      fi
    '';
in
  lib.concatStringsSep "\n" (
    [
      ''
        export npm_config_nodedir=${nodejs}
        export npm_config_build_from_source=true
        export PATH="${nodejs}/lib/node_modules/npm/bin/node-gyp-bin:$PATH"
      ''
    ]
    ++ map renderAddon addons
  )
