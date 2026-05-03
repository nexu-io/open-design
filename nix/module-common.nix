# Shared option definitions for the Open Design Home Manager and NixOS
# modules. Returns a plain attrset of options (NOT a NixOS module). The
# consuming module imports this and merges the result into its own
# `options.<scope>.open-design`.
#
# The two callers differ only in:
#   - default `dataDir` (HM: $HOME/.od; NixOS: /var/lib/open-design)
#   - service supervision (HM: systemd --user / launchd agents;
#     NixOS: system systemd units + dynamic user)
# Everything else — port, autoStart, environmentFile, agents, webFrontend —
# is identical across both, so it lives here.
{
  lib,
  pkgs,
  flake,
  defaultDataDir,
}: let
  # Agent CLIs the daemon scans for on PATH (apps/daemon/src/agents.ts).
  # Keep this list in sync with that file.
  supportedAgents = [
    "claude"
    "codex"
    "gemini"
    "opencode"
    "cursor-agent"
    "qwen"
    "copilot"
  ];

  flakePackages =
    if flake ? packages.${pkgs.stdenv.hostPlatform.system}
    then flake.packages.${pkgs.stdenv.hostPlatform.system}
    else {};
in {
  enable = lib.mkEnableOption "Open Design — local-first design product daemon";

  package = lib.mkOption {
    type = lib.types.package;
    default =
      flakePackages.daemon or (throw
        "open-design: no daemon package available for ${pkgs.stdenv.hostPlatform.system}; set services.open-design.package explicitly");
    defaultText = lib.literalExpression "open-design.packages.\${pkgs.stdenv.hostPlatform.system}.daemon";
    description = "The Open Design daemon package providing the `od` binary.";
  };

  port = lib.mkOption {
    type = lib.types.port;
    default = 7457;
    description = ''
      TCP port the daemon API binds to. Passed to `od --port`.
      The frontend (whether served via `webFrontend` or your own server)
      must point its `OD_DAEMON_URL` at this port.
    '';
  };

  dataDir = lib.mkOption {
    type = lib.types.path;
    default = defaultDataDir;
    defaultText =
      lib.literalExpression
      (
        if defaultDataDir == "/var/lib/open-design"
        then "\"/var/lib/open-design\""
        else "\"\${config.home.homeDirectory}/.od\""
      );
    description = ''
      Directory holding the daemon's runtime state: SQLite database
      (`app.sqlite`), per-project working trees under `projects/<id>/`,
      and saved artifact bundles under `artifacts/`.
    '';
  };

  autoStart = lib.mkOption {
    type = lib.types.bool;
    default = false;
    description = ''
      Whether to register a service that starts the daemon automatically.
      Independent of `webFrontend.enable` — you can run either or both.
    '';
  };

  environmentFile = lib.mkOption {
    type = lib.types.nullOr lib.types.path;
    default = null;
    description = ''
      Path to a file containing `KEY=VALUE` lines passed to the daemon's
      service environment. Use this for runtime secrets (BYOK API keys,
      provider tokens, etc.).

      WARNING: never put secret values directly into Nix configuration —
      the Nix store is world-readable. Generate this file out-of-band
      with sops-nix (https://github.com/Mic92/sops-nix) or agenix
      (https://github.com/ryantm/agenix).
    '';
    example = "/run/secrets/open-design.env";
  };

  extraEnv = lib.mkOption {
    type = lib.types.attrsOf lib.types.str;
    default = {};
    description = ''
      Additional non-secret environment variables for the daemon
      service (e.g. `OD_CODEX_DISABLE_PLUGINS = "1"`). Secrets belong
      in `environmentFile`, not here.
    '';
    example = lib.literalExpression ''
      {
        OD_CODEX_DISABLE_PLUGINS = "1";
      }
    '';
  };

  agents = lib.mkOption {
    type = lib.types.listOf (lib.types.enum supportedAgents);
    default = [];
    description = ''
      Declarative record of which code-agent CLIs the user intends to
      have on PATH for the daemon to detect. This option is documentary
      — Open Design discovers agents by scanning PATH at runtime. Listing
      them here makes the intent explicit so configuration reviewers can
      tell what the user expects without grepping shell history.

      Supported names: ${lib.concatStringsSep ", " supportedAgents}.
    '';
    example = ["claude" "codex"];
  };

  webFrontend = {
    # The Open Design web frontend is a static SPA built by
    # `apps/web` → `apps/web/out/`. The daemon is a separate Express
    # process that serves the JSON API at `/api/*`. The SPA reads
    # `OD_DAEMON_URL` to know where to send requests.
    #
    # Enabling `webFrontend` runs a tiny static file server (caddy) that
    # hosts the SPA on a sibling port. This is for users who just want
    # `nix run`-style convenience without configuring nginx/caddy by
    # hand.
    #
    # If you already serve the static export through your own reverse
    # proxy, leave `webFrontend.enable = false` and point your server
    # at `${cfg.webFrontend.package}` instead.
    enable = lib.mkOption {
      type = lib.types.bool;
      default = false;
      description = ''
        Run a lightweight static file server for the Next.js export.
        Independent of the daemon service: enable either or both.
      '';
    };

    port = lib.mkOption {
      type = lib.types.port;
      # Confirmed via QUICKSTART.md examples (`--web-port 5175`) and
      # tools-dev defaults — pick 5174 to leave 5175 free for the dev
      # tools-dev workflow on the same machine.
      default = 5174;
      description = ''
        TCP port the static file server binds to. The bundled SPA will
        call the daemon at `OD_DAEMON_URL` (which the service unit sets
        to `http://localhost:''${toString cfg.port}`).
      '';
    };

    package = lib.mkOption {
      type = lib.types.package;
      default =
        flakePackages.web or (throw
          "open-design: no web package available for ${pkgs.stdenv.hostPlatform.system}; set services.open-design.webFrontend.package explicitly");
      defaultText = lib.literalExpression "open-design.packages.\${pkgs.stdenv.hostPlatform.system}.web";
      description = "Built static export to serve (Next.js out/ tree).";
    };
  };
}
