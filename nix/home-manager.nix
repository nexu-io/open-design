# Home Manager module for Open Design — primary interface for individual
# developers. Linux uses systemd --user units; macOS uses launchd agents.
#
# Both the daemon and the optional web frontend are user-scoped and run
# as the user's UID — there is no system user, no setuid, and no
# privileged port binding by default.
#
# Usage:
#   imports = [ inputs.open-design.homeManagerModules.default ];
#   services.open-design = {
#     enable = true;
#     autoStart = true;
#     webFrontend.enable = true;
#   };
{
  moduleCommon,
  flake,
}: {
  config,
  lib,
  pkgs,
  ...
}: let
  cfg = config.services.open-design;

  commonOpts = moduleCommon {
    inherit lib pkgs flake;
    defaultDataDir = "${config.home.homeDirectory}/.od";
  };

  daemonExe = lib.getExe cfg.package;

  # Static file server. caddy is the sweet spot: single binary, handles
  # SPA-style fallback if any deep link bypasses the trailingSlash
  # directories Next.js emits, and ~30MB is acceptable for an opt-in
  # service. Users who want lighter can override
  # `services.open-design.webFrontend.package` and bring their own
  # server — though that disables the bundled service in favor of
  # whatever they wire up.
  caddy = pkgs.caddy;

  # Synthesize a Caddyfile pointing at the static package's out tree.
  caddyfile = pkgs.writeText "open-design-web.Caddyfile" ''
    {
      auto_https off
      admin off
      persist_config off
    }

    :${toString cfg.webFrontend.port} {
      root * ${cfg.webFrontend.package}
      file_server
      try_files {path} {path}/ /index.html
      encode gzip
    }
  '';

  # systemd --user units (and macOS launchd agents) start with a minimal
  # default PATH that excludes Home Manager and NixOS user-profile bin
  # directories. The daemon scans `process.env.PATH` for agent CLIs, so
  # without an explicit PATH the UI reports "no agents detected" even when
  # claude / codex / opencode / ... are installed.
  #
  # `${config.home.profileDirectory}/bin` covers both standalone HM
  # (~/.nix-profile/bin) and HM-as-NixOS-module (/etc/profiles/per-user/<u>/bin).
  # The remaining Linux entries pick up wrappers, the system profile, and
  # the default Nix profile. Darwin gets the standard launchd PATH.
  daemonPathEntries =
    ["${config.home.profileDirectory}/bin"]
    ++ lib.optionals pkgs.stdenv.isLinux [
      "/run/wrappers/bin"
      "/etc/profiles/per-user/${config.home.username}/bin"
      "/run/current-system/sw/bin"
      "/nix/var/nix/profiles/default/bin"
      "/usr/local/bin"
      "/usr/bin"
      "/bin"
    ]
    ++ lib.optionals pkgs.stdenv.isDarwin [
      "/usr/local/bin"
      "/usr/bin"
      "/bin"
      "/usr/sbin"
      "/sbin"
    ]
    ++ cfg.extraBinPaths;

  daemonEnv =
    {
      OD_PORT = toString cfg.port;
      OD_DATA_DIR = toString cfg.dataDir;
      PATH = lib.concatStringsSep ":" daemonPathEntries;
    }
    // cfg.extraEnv;

  webEnv = {
    OD_DAEMON_URL = "http://localhost:${toString cfg.port}";
  };

  envToList = e: lib.mapAttrsToList (k: v: "${k}=${v}") e;
in {
  options.services.open-design = commonOpts;

  config = lib.mkIf cfg.enable (lib.mkMerge [
    {
      home.packages = [cfg.package];

      # Ensure the data directory exists ahead of first daemon launch.
      # mkdir -p so this is safe to re-run.
      home.activation.openDesignDataDir = lib.hm.dag.entryAfter ["writeBoundary"] ''
        run mkdir -p ${lib.escapeShellArg (toString cfg.dataDir)}
      '';
    }

    # ----- Linux: systemd --user units --------------------------------
    (lib.mkIf (pkgs.stdenv.isLinux && cfg.autoStart) {
      systemd.user.services.open-design = {
        Unit = {
          Description = "Open Design daemon (user service)";
          After = ["network-online.target"];
          Wants = ["network-online.target"];
        };
        Install.WantedBy = ["default.target"];
        Service =
          {
            Type = "simple";
            ExecStart = "${daemonExe} --port ${toString cfg.port} --no-open";
            Environment = envToList daemonEnv;
            Restart = "on-failure";
            RestartSec = 3;
          }
          // lib.optionalAttrs (cfg.environmentFile != null) {
            EnvironmentFile = toString cfg.environmentFile;
          };
      };
    })

    (lib.mkIf (pkgs.stdenv.isLinux && cfg.webFrontend.enable) {
      systemd.user.services.open-design-web = {
        Unit = {
          Description = "Open Design web frontend (static file server)";
          After = ["network-online.target"];
          Wants = ["network-online.target"];
        };
        Install.WantedBy = ["default.target"];
        Service = {
          Type = "simple";
          ExecStart = "${lib.getExe caddy} run --config ${caddyfile} --adapter caddyfile";
          Environment = envToList webEnv;
          Restart = "on-failure";
          RestartSec = 3;
        };
      };
    })

    # ----- macOS: launchd agents -------------------------------------
    (lib.mkIf (pkgs.stdenv.isDarwin && cfg.autoStart) {
      launchd.agents.open-design = {
        enable = true;
        config = {
          Label = "io.nexu.open-design";
          ProgramArguments = [
            daemonExe
            "--port"
            (toString cfg.port)
            "--no-open"
          ];
          RunAtLoad = true;
          KeepAlive = true;
          EnvironmentVariables = daemonEnv;
          StandardOutPath = "${cfg.dataDir}/open-design.out.log";
          StandardErrorPath = "${cfg.dataDir}/open-design.err.log";
        };
      };
    })

    (lib.mkIf (pkgs.stdenv.isDarwin && cfg.webFrontend.enable) {
      launchd.agents.open-design-web = {
        enable = true;
        config = {
          Label = "io.nexu.open-design-web";
          ProgramArguments = [
            (lib.getExe caddy)
            "run"
            "--config"
            (toString caddyfile)
            "--adapter"
            "caddyfile"
          ];
          RunAtLoad = true;
          KeepAlive = true;
          EnvironmentVariables = webEnv;
        };
      };
    })
  ]);
}
