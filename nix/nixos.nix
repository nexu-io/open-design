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

{ moduleCommon, flake }:
{ config, lib, pkgs, ... }:

let
  cfg = config.services.open-design;

  commonOpts = moduleCommon {
    inherit lib pkgs flake;
    defaultDataDir = "/var/lib/open-design";
  };

  daemonExe = lib.getExe cfg.package;
  caddy = pkgs.caddy;

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

  daemonEnvironment = {
    OD_PORT = toString cfg.port;
    OD_DATA_DIR = toString cfg.dataDir;
  } // cfg.extraEnv;

  webEnvironment = {
    OD_DAEMON_URL = "http://localhost:${toString cfg.port}";
  };
in
{
  options.services.open-design = commonOpts // {
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
      users.groups.${cfg.group} = { };

      systemd.tmpfiles.rules = [
        "d ${toString cfg.dataDir} 0750 ${cfg.user} ${cfg.group} - -"
      ];

      networking.firewall.allowedTCPPorts =
        lib.optional cfg.openFirewall cfg.port
        ++ lib.optional (cfg.openFirewall && cfg.webFrontend.enable) cfg.webFrontend.port;
    }

    (lib.mkIf cfg.autoStart {
      systemd.services.open-design = {
        description = "Open Design daemon";
        wantedBy = [ "multi-user.target" ];
        after = [ "network-online.target" ];
        wants = [ "network-online.target" ];

        environment = daemonEnvironment;

        serviceConfig = {
          Type = "simple";
          User = cfg.user;
          Group = cfg.group;
          ExecStart = "${daemonExe} --port ${toString cfg.port} --no-open";
          Restart = "on-failure";
          RestartSec = 3;
          ReadWritePaths = [ (toString cfg.dataDir) ];
        } // hardening
          // lib.optionalAttrs (cfg.environmentFile != null) {
            EnvironmentFile = toString cfg.environmentFile;
          };
      };
    })

    (lib.mkIf cfg.webFrontend.enable {
      systemd.services.open-design-web = {
        description = "Open Design web frontend (static file server)";
        wantedBy = [ "multi-user.target" ];
        after = [ "network-online.target" ];
        wants = [ "network-online.target" ];

        environment = webEnvironment;

        serviceConfig = {
          Type = "simple";
          User = cfg.user;
          Group = cfg.group;
          ExecStart = "${lib.getExe caddy} run --config ${caddyfile} --adapter caddyfile";
          Restart = "on-failure";
          RestartSec = 3;
        } // hardening;
      };
    })
  ]);
}
