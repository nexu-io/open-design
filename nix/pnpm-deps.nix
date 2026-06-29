{
  # Vendored pnpm store hashes for the workspace packages built by the flake.
  # Generated lock artifact; do not hand-edit outside intentional Nix maintenance.
  #
  # The daemon and web derivations now build from different filtered source
  # trees, so each fetchPnpmDeps invocation needs its own fixed-output hash.
  # Refresh a hash whenever pnpm-lock.yaml or that derivation's source filter
  # changes:
  # 1. Temporarily set the consuming `hash = lib.fakeHash;`
  # 2. Run the relevant nix build/flake check
  # 3. Copy the expected hash printed by Nix into the matching field below
  daemonHash = "sha256-6VgQHQbQmmprFXG+/L8P5S89gXObjSDw0Q2an20/lVo=";
  webHash = "sha256-Ct9Upg6aF5521musoiy1muA8YyB+zwuZzmokRV0tEw0=";
}
