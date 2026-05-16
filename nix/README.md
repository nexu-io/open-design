# Open Design — Nix flake

This flake exposes Open Design as a reproducible package, a `nix run` entry
point, a dev shell, and Home Manager / NixOS modules. The architecture
mirrors the runtime: the **daemon** (`od` CLI, Express API on `/api/*`)
and the **web frontend** (Next.js static SPA at `apps/web/out/`) are
**separate packages** and **separate services** — you can run either or
both.

## Outputs

| Output                                     | What it is                                                                             |
| ------------------------------------------ | -------------------------------------------------------------------------------------- |
| `packages.<system>.daemon`                 | The `@open-design/daemon` package — produces `bin/od`. Default output.                 |
| `packages.<system>.web`                    | The Next.js static export (`apps/web/out/`) ready to drop into any static file server. |
| `apps.<system>.default`                    | `nix run github:nexu-io/open-design` — boots the daemon.                               |
| `devShells.<system>.default`               | Node 24 + Corepack-pinned pnpm 10.33 — reproduces `pnpm install` locally.              |
| `homeManagerModules.{default,open-design}` | Home Manager module — primary individual-developer interface.                          |
| `nixosModules.{default,open-design}`       | NixOS module — secondary, for shared/server installs.                                  |

## Try it without installing

```bash
nix run github:nexu-io/open-design        # boots the daemon on :7457
nix develop github:nexu-io/open-design    # drop into the dev shell
```

## (1) Home Manager — the recommended path

For an individual workstation, add the flake as an input and import the
default module:

```nix
{
  inputs.open-design.url = "github:nexu-io/open-design";

  outputs = { self, home-manager, open-design, ... }: {
    homeConfigurations.you = home-manager.lib.homeManagerConfiguration {
      modules = [
        open-design.homeManagerModules.default
        {
          services.open-design = {
            enable = true;
            autoStart = true;            # systemd --user / launchd agent
            webFrontend.enable = true;   # also run the static SPA on :5174
          };
        }
      ];
    };
  };
}
```

What this wires up:

- Linux: `systemd --user` units `open-design.service` and (optionally)
  `open-design-web.service`. `systemctl --user status open-design`.
- macOS: `launchd` agents `io.nexu.open-design` and (optionally)
  `io.nexu.open-design-web`. `launchctl print gui/$UID/io.nexu.open-design`.
- Data lives in `$HOME/.od/` by default — override `dataDir` to relocate.

## (2) NixOS — for shared/server installs

```nix
{
  imports = [ inputs.open-design.nixosModules.default ];

  services.open-design = {
    enable = true;
    autoStart = true;
    openFirewall = true;
    webFrontend.enable = true;
    user = "open-design";
    group = "open-design";
  };
}
```

This creates a system user, drops a tmpfiles rule for `/var/lib/open-design`,
and runs the daemon under hardened systemd (`ProtectSystem=strict`,
`PrivateTmp`, `ReadWritePaths` scoped to the data directory). Use this
when you want a single shared instance — for individual user
configuration prefer the Home Manager module.

## (3) `webFrontend` — when to use it, when to bring your own server

Open Design's frontend is a static SPA that issues relative `/api/*`,
`/artifacts/*`, and `/frames/*` requests. Three serving options:

| Option                                 | When                                                                                                                                                                                                              |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `webFrontend.enable = true`            | You want one-line setup. The module spawns a tiny Caddy file server on `webFrontend.port` (default `5174`) that serves the SPA and reverse-proxies the three path prefixes to the daemon.                         |
| `webFrontend.enable = false` (default) | You're running nginx / Caddy / Apache / Traefik yourself. Point your server's document root at `${pkgs.open-design.web}` (or the `packages.<system>.web` output) and replicate the proxy contract in section (4). |
| Skip the frontend entirely             | You only need the daemon's API for headless agent dispatch.                                                                                                                                                       |

The two services are independent. `autoStart` controls the daemon;
`webFrontend.enable` controls the static server. Mix freely.

> **Bring-your-own-server gotcha:** if your proxy listens on any
> origin that differs from the daemon's bind (different host _or_
> different port — even loopback split-port like
> `http://127.0.0.1:8080` while the daemon stays on `:7457`), the
> daemon's same-origin gate will 403 the SPA's writes until you tell
> it about that origin. Either set
> `services.open-design.webFrontend.allowedOrigins = [ "<your-proxy-origin>" ]`
> (which feeds `OD_ALLOWED_ORIGINS`) or, for the loopback-only
> split-port case, set `extraEnv.OD_WEB_PORT = "<proxy-port>"`. See
> section (4) for the full decision tree.

### Exposing the bundled frontend on a non-loopback host

By default `webFrontend.host = "127.0.0.1"` so enabling the bundled
caddy does not publish anything beyond loopback. To intentionally
share with a LAN, two settings must be widened together — the
modules assert at eval time that the second is set whenever the
first is widened:

```nix
services.open-design.webFrontend = {
  enable = true;
  host = "0.0.0.0";  # caddy listener
  # Every external origin browsers will load the SPA from. The daemon
  # matches each entry against the browser's `Origin` header AND adds
  # its host:port to the `Host`-header allowlist (Caddy v2 reverse_proxy
  # preserves the original Host upstream by default), so list each
  # scheme + hostname combo you actually use.
  allowedOrigins = [
    "http://laptop.local:5174"
    "https://laptop.local:5174"
  ];
};
# On NixOS you also need:
services.open-design.openFirewall = true;
```

Under the hood `allowedOrigins` is forwarded to the daemon as the
`OD_ALLOWED_ORIGINS` environment variable (comma-separated). If you
run the daemon outside the modules — for example, behind your own
nginx/caddy — set `OD_ALLOWED_ORIGINS` directly in the daemon's
environment with the same shape:

```
OD_ALLOWED_ORIGINS=http://host1:port,https://host1:port,http://host2:port
```

Each entry must be a bare origin (`scheme://host[:port]`); only
`http://` and `https://` schemes are accepted, and the daemon refuses
to start if any entry fails to parse. The variable widens only the
general `/api/*` same-origin gate — connector-credential and
live-artifact preview/refresh routes stay strictly loopback-only by
design.

## (4) Same-origin proxying contract

The web package is built with `OD_DAEMON_URL = ""` so the bundled JS
issues **relative** requests — `/api/*`, `/artifacts/*`, `/frames/*` —
instead of baking a daemon URL into the export. There is no runtime
config endpoint; the SPA does not read `OD_DAEMON_URL` from the
serving environment.

The serving contract is therefore: **the static export must be served
same-origin with a reverse proxy to the daemon**. The bundled caddy
service does exactly this — `webFrontend` listens on
`webFrontend.port` and reverse-proxies the three path prefixes above
to `127.0.0.1:<cfg.port>`, with `flush_interval -1` and no `encode` on
`/api/*` so SSE streams flush immediately (gzip would buffer chunked
responses for ~80s and surface as `ERR_INCOMPLETE_CHUNKED_ENCODING`).

If you serve the static bundle yourself, replicate that shape:

- Document root → `${pkgs.open-design.web}` (or
  `packages.<system>.web`).
- Reverse-proxy `/api/*`, `/artifacts/*`, `/frames/*` to the daemon's
  bind address; `/api/*` must stream chunks immediately and skip
  response compression.
- SPA fallback for unmatched paths → `index.html`.

The static-server's environment does not need any Open Design env
vars — but **the daemon's environment usually does**, because its
same-origin gate is built from `OD_BIND_HOST:port` (loopback hosts
included). The browser's `Origin` and `Host` are whatever your proxy
exposes, so unless that matches `127.0.0.1:<daemon-port>` exactly,
the daemon will 403 every PUT/POST until told otherwise:

| Your custom-server setup                                                                                                                    | What to set on the daemon                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Proxy at `http://127.0.0.1:<daemon-port>` (same host, same port — unusual)                                                                  | Nothing.                                                                                                                                          |
| Proxy at a loopback host but different port (e.g. `http://127.0.0.1:8080` while daemon is on `:7457`)                                       | Either `extraEnv.OD_WEB_PORT = "8080"` (whitelists `8080` on every loopback host) or `services.open-design.webFrontend.allowedOrigins`.           |
| Proxy on any non-loopback host (LAN IP, mDNS name, Tailscale name, public domain — `https://od.example.com`, `http://laptop.local:5174`, …) | `services.open-design.webFrontend.allowedOrigins = [ "<full origin>" ]`. List every scheme + host[:port] combo a browser might load the SPA from. |

`webFrontend.allowedOrigins` is forwarded to the daemon as
`OD_ALLOWED_ORIGINS`; if you run the daemon outside the modules,
export `OD_ALLOWED_ORIGINS` directly with the same shape (see
section (3)). The variable widens only the general `/api/*` gate —
connector-credential and live-artifact preview/refresh routes stay
strictly loopback-only by design.

## (5) Secrets — DO NOT put them in your Nix config

The `environmentFile` option takes a path to a `KEY=VALUE` file that the
service unit reads. Use it for BYOK API keys (Anthropic, OpenAI, Gemini),
provider tokens, and anything else you do not want world-readable in
`/nix/store`.

Recommended secret managers:

- [sops-nix](https://github.com/Mic92/sops-nix) — age- or PGP-encrypted
  YAML, decrypted into runtime files at activation.
- [agenix](https://github.com/ryantm/agenix) — age-encrypted single
  files, dropped into `/run/agenix/` at boot.

Either renders to a file like `/run/secrets/open-design.env`; pass that
path:

```nix
services.open-design.environmentFile = "/run/secrets/open-design.env";
```

Never inline a secret with `pkgs.writeText` or `home.file`.

## First-build hash pinning

Both `nix/package-daemon.nix` and `nix/package-web.nix` vendor the pnpm
store via a fixed-output derivation (`pnpmDeps`). The `outputHash`
defaults to `lib.fakeSha256` so `nix build` will fail with the expected
hash printed. Copy that value into the matching `pnpmDepsHash` constant
at the top of each file and re-run. Bump the hash whenever
`pnpm-lock.yaml` changes.

## CI

`.github/workflows/nix-check.yml` runs `nix flake check` followed by
separate `nix build .#daemon` and `nix build .#web` steps on each push
that touches the flake or the lockfile. Build artifacts are cached on
the `nexu-open-design` Cachix instance — PRs from forks read from the
cache without needing the auth token.
