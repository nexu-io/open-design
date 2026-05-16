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
  # `pkgs.system` is a legacy alias removed when consumers set
  # `nixpkgs.config.allowAliases = false`. Use the canonical attribute
  # path so the module evaluates under both default and strict configs.
  systemAttr = pkgs.stdenv.hostPlatform.system;

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

      The static SPA issues relative `/api/*`, `/artifacts/*`, and
      `/frames/*` requests, so whatever fronts the bundle (the
      built-in `webFrontend` caddy or your own nginx/Caddy) must
      reverse-proxy those three path prefixes to `127.0.0.1:<this
      port>` and serve same-origin with the SPA. There is no runtime
      `OD_DAEMON_URL` injection — see section (4) of `nix/README.md`.
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

  extraBinPaths = lib.mkOption {
    type = lib.types.listOf lib.types.str;
    default = [];
    description = ''
      Extra absolute directories to prepend to the daemon service's
      PATH. The daemon discovers agent CLIs (claude, codex, gemini,
      opencode, ...) by scanning `process.env.PATH` at runtime, but
      systemd unit and macOS launchd agent invocations launch with a
      minimal default PATH that excludes Home Manager / NixOS user
      profiles — so without entries here the daemon will report
      "no agents detected" even when the CLIs are installed.

      Both modules pre-populate PATH with sensible defaults for their
      context (Home Manager: the user's HM profile and, on NixOS, the
      per-user/system profile dirs; NixOS: the system profile and
      wrapper dirs). Use this option to add additional locations
      (custom installs under `/opt`, project-local `bin/`, etc.).
    '';
    example = lib.literalExpression ''[ "/opt/agents/bin" ]'';
  };

  webFrontend = {
    # The Open Design web frontend is a static SPA built by
    # `apps/web` → `apps/web/out/`. The daemon is a separate Express
    # process that serves the JSON API at `/api/*`. The SPA is built
    # with `OD_DAEMON_URL=""`, so the bundled JS issues relative
    # `/api/*`, `/artifacts/*`, and `/frames/*` requests and expects
    # the static-server in front of it to reverse-proxy those to the
    # daemon — there is no runtime daemon-URL injection.
    #
    # Enabling `webFrontend` runs a tiny static file server (caddy) that
    # hosts the SPA on a sibling port and proxies the three path
    # prefixes back to the daemon. This is for users who just want
    # `nix run`-style convenience without configuring nginx/caddy by
    # hand.
    #
    # If you already serve the static export through your own reverse
    # proxy, leave `webFrontend.enable = false`, point your server's
    # document root at `${cfg.webFrontend.package}`, and replicate the
    # reverse-proxy rules (with SSE-safe streaming on `/api/*`).
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
        TCP port the static file server binds to. The bundled caddy
        serves the SPA on this port and reverse-proxies the SPA's
        relative API requests (`/api/*`, `/artifacts/*`, `/frames/*`)
        to the daemon at `127.0.0.1:''${toString cfg.port}`, so the
        browser sees a single same-origin endpoint.
      '';
    };

    host = lib.mkOption {
      type = lib.types.str;
      default = "127.0.0.1";
      description = ''
        Interface address the static file server binds to. Defaults to
        loopback so enabling `webFrontend` does not expose the bundled
        proxy (which forwards `/api/*`, `/artifacts/*`, and `/frames/*`
        to the local daemon) to other hosts on the network.

        For shared deployments set this to `"0.0.0.0"` (or a specific
        interface address) AND populate `webFrontend.allowedOrigins`
        with every external origin the SPA will be loaded from — the
        daemon's same-origin gate is fail-closed and would otherwise
        reject API writes proxied by caddy with a 403. On NixOS you
        must additionally set `services.open-design.openFirewall =
        true` for inbound traffic to reach the listener.

        Note: certain sensitive routes (connector credentials, live
        artifact preview/refresh) remain strictly loopback-only even
        when `allowedOrigins` is set; that is intentional.
      '';
    };

    allowedOrigins = lib.mkOption {
      type = lib.types.listOf lib.types.str;
      default = [];
      description = ''
        Full HTTP(S) origins (`scheme://host[:port]`, no path) the
        daemon should accept as same-site for `/api/*` requests in
        addition to its built-in loopback set. Honored regardless of
        `webFrontend.enable` — set this whenever the browser-facing
        origin differs from the daemon's bind address, including the
        following cases:

          * Bundled caddy on a non-loopback host: SPA loaded from
            `http://<lan-host>:''${toString cfg.webFrontend.port}` cannot
            issue PUT/POST through the bundled proxy without this set.
          * Custom nginx/Caddy out front (`webFrontend.enable = false`)
            on a non-loopback host or any port other than
            `''${toString cfg.port}` — including loopback split-port
            setups like `http://127.0.0.1:8080`.

        For the loopback split-port case specifically, an alternative is
        to set `extraEnv.OD_WEB_PORT = "<proxy-port>"`, which whitelists
        that port on every loopback host without enumerating origins.

        Each entry is forwarded to the daemon via the `OD_ALLOWED_ORIGINS`
        env var. The daemon both compares it verbatim against the
        browser's `Origin` header AND admits its host:port to the
        `Host`-header allowlist (Caddy v2 reverse_proxy preserves the
        original Host upstream by default, so widening only the Origin
        check would still 403 same-site GETs at the Host check). List
        every hostname/scheme combo a user might access (LAN IP, mDNS
        name, Tailscale name, http and https separately if both are
        reachable). Loopback origins on the daemon's own port are
        already accepted unconditionally — do not bother listing those.
      '';
      example = ["http://laptop.local:5174" "https://laptop.local:5174"];
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
