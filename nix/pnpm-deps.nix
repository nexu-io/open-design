{
  # Vendored pnpm store hashes for the workspace packages built by the flake.
  #
  # The daemon and web derivations now build from different filtered source
  # trees, so each fetchPnpmDeps invocation needs its own fixed-output hash.
  # Refresh a hash whenever pnpm-lock.yaml or that derivation's source filter
  # changes:
  # 1. Temporarily set the consuming `hash = lib.fakeHash;`
  # 2. Run the relevant nix build/flake check
  # 3. Copy the expected hash printed by Nix into the matching field below
  daemonHash = "sha256-8hNsIjhLDEotXk+N/nq8sJt8RPI6u4Iu54b1xt6eVxg=";
  webHash = "sha256-0UKI+uXuevt3UuNg29ol7QIPnNkrViSqByO9KHMcpUU=";
}
