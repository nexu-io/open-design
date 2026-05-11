# NixOS module for Open Design — secondary interface for shared/server
# installs (e.g. running the daemon as a long-lived service on a team
# build host). For individual developer machines, prefer the Home
# Manager module (nix/home-manager.nix).
#
# Usage:
#   imports = [ inputs.open-design.nixosModules.default ];
#   services.open-design = {
#     enable = true;
#     autoStart = true;
#     openFirewall = true;
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
    defaultDataDir = "/var/lib/open-design";
  };

  daemonExe = lib.getExe cfg.package;
  caddy = pkgs.caddy;

  # See nix/home-manager.nix for the rationale behind these handle
  # blocks. The static SPA calls `/api/*`, `/artifacts/*`, `/frames/*`
  # at the same origin; caddy proxies those to the daemon. SSE on
  # `/api/*` requires no buffering (flush_interval, no encode).
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

  hardening = {
    NoNewPrivileges = true;
    ProtectSystem = "strict";
    ProtectHome = true;
    PrivateTmp = true;
    ProtectKernelTunables = true;
    ProtectKernelModules = true;
    ProtectControlGroups = true;
    RestrictSUIDSGID = true;
    LockPersonality = true;
  };

  # System systemd units launch with a minimal default PATH that excludes
  # NixOS profile dirs where agent CLIs live. The daemon scans
  # `process.env.PATH` to discover them, so an explicit PATH is required
  # or the UI reports "no agents detected". The service runs as a system
  # user, so per-user profile dirs aren't included by default — operators
  # who install agents into a specific location should add it via
  # `services.open-design.extraBinPaths`.
  daemonPathEntries =
    [
      "/run/wrappers/bin"
      "/run/current-system/sw/bin"
      "/nix/var/nix/profiles/default/bin"
      "/usr/local/bin"
      "/usr/bin"
      "/bin"
    ]
    ++ cfg.extraBinPaths;

  # Conservative loopback check used to gate the allowedOrigins
  # assertion. See nix/home-manager.nix for the rationale.
  isLoopbackHost = h:
    h == "127.0.0.1"
    || h == "localhost"
    || h == "::1"
    || h == "[::1]"
    || lib.hasPrefix "127." h;

  daemonEnvironment =
    {
      OD_PORT = toString cfg.port;
      OD_DATA_DIR = toString cfg.dataDir;
      PATH = lib.concatStringsSep ":" daemonPathEntries;
    }
    // lib.optionalAttrs cfg.webFrontend.enable {
      # See nix/home-manager.nix — the daemon's /api origin allowlist
      # needs to know about the caddy port or it will 403 SPA writes.
      OD_WEB_PORT = toString cfg.webFrontend.port;
    }
    // lib.optionalAttrs (cfg.webFrontend.allowedOrigins != []) {
      # Operator-declared external origins for the LAN-exposure escape
      # hatch. Honored regardless of `webFrontend.enable` so operators
      # exposing the daemon's `/api` directly (no bundled caddy in
      # front) — the path documented under `openFirewall` — can still
      # widen the daemon's same-origin allowlist via this option.
      # Comma-joined; parsed by configuredAllowedOrigins() in
      # apps/daemon/src/origin-validation.ts.
      OD_ALLOWED_ORIGINS = lib.concatStringsSep "," cfg.webFrontend.allowedOrigins;
    }
    // cfg.extraEnv;
in {
  options.services.open-design =
    commonOpts
    // {
      user = lib.mkOption {
        type = lib.types.str;
        default = "open-design";
        description = "User the daemon runs as.";
      };

      group = lib.mkOption {
        type = lib.types.str;
        default = "open-design";
        description = "Group the daemon runs as.";
      };

      openFirewall = lib.mkOption {
        type = lib.types.bool;
        default = false;
        description = ''
          Open the daemon `port` in the system firewall, plus
          `webFrontend.port` when the bundled web service is enabled.

          Note: by default both the daemon and the bundled web frontend
          bind to loopback only, so opening the firewall has no effect
          until you also widen the bind address — set
          `services.open-design.webFrontend.host = "0.0.0.0"` and
          declare `services.open-design.webFrontend.allowedOrigins` so
          the daemon's CSRF gate accepts the externally reachable
          origin the SPA is loaded from.

          If you also need the daemon's `/api` exposed directly (i.e.
          without the bundled caddy in front), set
          `extraEnv.OD_BIND_HOST` to the externally reachable address
          (e.g. a LAN IP or Tailscale host) — not `0.0.0.0`, since the
          daemon's `Origin` allowlist is built from the literal bind
          host and browsers send `Origin: http://<actual-host>:<port>`,
          not `http://0.0.0.0:<port>`. Alternatively keep
          `OD_BIND_HOST = "0.0.0.0"` and add the externally reachable
          origin (e.g. `http://laptop.local:7456`) to
          `webFrontend.allowedOrigins`, which feeds `OD_ALLOWED_ORIGINS`.
        '';
      };
    };

  config = lib.mkIf cfg.enable (lib.mkMerge [
    {
      users.users.${cfg.user} = {
        isSystemUser = true;
        group = cfg.group;
        home = cfg.dataDir;
        description = "Open Design daemon";
      };
      users.groups.${cfg.group} = {};

      systemd.tmpfiles.rules = [
        "d ${toString cfg.dataDir} 0750 ${cfg.user} ${cfg.group} - -"
      ];

      networking.firewall.allowedTCPPorts =
        lib.optional cfg.openFirewall cfg.port
        ++ lib.optional (cfg.openFirewall && cfg.webFrontend.enable) cfg.webFrontend.port;

      # Fail-closed: if the operator widens the bundled caddy bind to
      # a non-loopback interface but does not declare which external
      # origins the SPA will be loaded from, the daemon's CSRF gate
      # will silently 403 every PUT/POST. Catch that at eval time.
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

    (lib.mkIf cfg.autoStart {
      systemd.services.open-design = {
        description = "Open Design daemon";
        wantedBy = ["multi-user.target"];
        after = ["network-online.target"];
        wants = ["network-online.target"];

        environment = daemonEnvironment;

        serviceConfig =
          {
            Type = "simple";
            User = cfg.user;
            Group = cfg.group;
            ExecStart = "${daemonExe} --port ${toString cfg.port} --no-open";
            Restart = "on-failure";
            RestartSec = 3;
            ReadWritePaths = [(toString cfg.dataDir)];
          }
          // hardening
          // lib.optionalAttrs (cfg.environmentFile != null) {
            EnvironmentFile = toString cfg.environmentFile;
          };
      };
    })

    (lib.mkIf cfg.webFrontend.enable {
      systemd.services.open-design-web = {
        description = "Open Design web frontend (static file server)";
        wantedBy = ["multi-user.target"];
        after = ["network-online.target"];
        wants = ["network-online.target"];

        serviceConfig =
          {
            Type = "simple";
            User = cfg.user;
            Group = cfg.group;
            ExecStart = "${lib.getExe caddy} run --config ${caddyfile} --adapter caddyfile";
            Restart = "on-failure";
            RestartSec = 3;
          }
          // hardening;
      };
    })
  ]);
}
