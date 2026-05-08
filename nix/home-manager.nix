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
  #
  # The web frontend is a static SPA bundled at build time with
  # `OD_DAEMON_URL=""`, so the bundled JS calls relative URLs like
  # `/api/agents`, `/artifacts/...`, and `/frames/...`. The daemon
  # serves those routes on `cfg.port`; caddy reverse-proxies them so
  # the SPA works same-origin without CORS or runtime config.
  #
  # /api/* needs SSE-safe proxying:
  #   * `flush_interval -1`         → stream chunks immediately
  #   * no `encode` on the API route → gzip would buffer chunked SSE
  #     responses for ~80s and surface as ERR_INCOMPLETE_CHUNKED_ENCODING
  #     in browsers (same failure mode QUICKSTART.md calls out for
  #     nginx).
  #   * generous read/write timeouts for long-running streams.
  caddyfile = pkgs.writeText "open-design-web.Caddyfile" ''
    {
      auto_https off
      admin off
      persist_config off
    }

    ${cfg.webFrontend.host}:${toString cfg.webFrontend.port} {
      handle /api/* {
        reverse_proxy 127.0.0.1:${toString cfg.port} {
          flush_interval -1
          transport http {
            read_timeout 86400s
            write_timeout 86400s
          }
        }
      }
      handle /artifacts/* {
        reverse_proxy 127.0.0.1:${toString cfg.port}
      }
      handle /frames/* {
        reverse_proxy 127.0.0.1:${toString cfg.port}
      }
      handle {
        root * ${cfg.webFrontend.package}
        try_files {path} {path}/ /index.html
        file_server
        encode gzip
      }
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

  # Conservative loopback check used to gate the allowedOrigins
  # assertion. Anything not matched here requires the operator to
  # declare external origins explicitly so the daemon's CSRF gate
  # actually accepts SPA writes.
  isLoopbackHost = h:
    h == "127.0.0.1"
    || h == "localhost"
    || h == "::1"
    || h == "[::1]"
    || lib.hasPrefix "127." h;

  daemonEnv =
    {
      OD_PORT = toString cfg.port;
      OD_DATA_DIR = toString cfg.dataDir;
      PATH = lib.concatStringsSep ":" daemonPathEntries;
    }
    // lib.optionalAttrs cfg.webFrontend.enable {
      # Tell the daemon's same-origin allowlist about the caddy port,
      # otherwise PUT/POST requests from the SPA served on
      # `webFrontend.port` get 403'd by the /api middleware
      # (apps/daemon/src/server.ts buildAllowedOrigins).
      OD_WEB_PORT = toString cfg.webFrontend.port;
    }
    // lib.optionalAttrs (cfg.webFrontend.allowedOrigins != []) {
      # Operator-declared external origins for the LAN-exposure escape
      # hatch (webFrontend.host non-loopback). Honored regardless of
      # `webFrontend.enable` so users who serve the SPA through their
      # own reverse proxy (or expose the daemon's `/api` directly) can
      # still widen the daemon's same-origin allowlist via this
      # option. Comma-joined; parsed by configuredAllowedOrigins() in
      # apps/daemon/src/origin-validation.ts.
      OD_ALLOWED_ORIGINS = lib.concatStringsSep "," cfg.webFrontend.allowedOrigins;
    }
    // cfg.extraEnv;

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

      # Fail-closed: if the operator widens the bundled caddy bind to
      # a non-loopback interface but does not declare which external
      # origins the SPA will be loaded from, the daemon's CSRF gate
      # will silently 403 every PUT/POST. Catch that at eval time so
      # the broken state never reaches the user's session.
      assertions = [
        {
          assertion =
            !cfg.webFrontend.enable
            || isLoopbackHost cfg.webFrontend.host
            || cfg.webFrontend.allowedOrigins != [];
          message = ''
            services.open-design.webFrontend.host = "${cfg.webFrontend.host}" exposes the
            bundled web frontend on a non-loopback interface, but
            services.open-design.webFrontend.allowedOrigins is empty.

            The daemon's same-origin allowlist would reject every API
            write the SPA issues from that host. Either keep the
            default loopback bind, or declare every external origin
            the SPA will be loaded from, e.g.

              services.open-design.webFrontend.allowedOrigins = [
                "http://laptop.local:''${toString cfg.webFrontend.port}"
              ];
          '';
        }
      ];
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
          Restart = "on-failure";
          RestartSec = 3;
        };
      };
    })

    # ----- macOS: launchd agents -------------------------------------
    (lib.mkIf (pkgs.stdenv.isDarwin && cfg.autoStart) (let
      # launchd has no EnvironmentFile equivalent. When the user supplies
      # one, wrap the daemon exec in a tiny shell that sources the file
      # at runtime — keeps secrets out of the world-readable Nix store
      # while still honoring the documented `environmentFile` option on
      # Darwin (parity with the Linux systemd path above).
      daemonLaunchScript = pkgs.writeShellScript "open-design-daemon-launch" ''
        set -a
        . ${lib.escapeShellArg (toString cfg.environmentFile)}
        set +a
        exec ${lib.escapeShellArg daemonExe} --port ${toString cfg.port} --no-open
      '';
      programArguments =
        if cfg.environmentFile != null
        then [(toString daemonLaunchScript)]
        else [daemonExe "--port" (toString cfg.port) "--no-open"];
    in {
      launchd.agents.open-design = {
        enable = true;
        config = {
          Label = "io.nexu.open-design";
          ProgramArguments = programArguments;
          RunAtLoad = true;
          KeepAlive = true;
          EnvironmentVariables = daemonEnv;
          StandardOutPath = "${cfg.dataDir}/open-design.out.log";
          StandardErrorPath = "${cfg.dataDir}/open-design.err.log";
        };
      };
    }))

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
        };
      };
    })
  ]);
}
