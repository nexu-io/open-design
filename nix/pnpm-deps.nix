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
  daemonHash = "sha256-w1y5qrGa/vZtg4LXQvyrUp4a4Rk9x6z7ve4Up65P6cA=";
  webHash = "sha256-Uj9HlDpTtO8y/0ykTVkFtM0oukt1zSYsmIp7JZ9NJJc=";
}
