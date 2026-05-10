{
  description = "Open Design — local-first design product. Daemon (`od` CLI) + Next.js static web frontend.";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
    dream2nix = {
      url = "github:nix-community/dream2nix";
      inputs.nixpkgs.follows = "nixpkgs";
    };
    home-manager = {
      url = "github:nix-community/home-manager";
      inputs.nixpkgs.follows = "nixpkgs";
    };
  };

  outputs = {
    self,
    nixpkgs,
    flake-utils,
    dream2nix,
    home-manager,
  }: let
    perSystem = flake-utils.lib.eachDefaultSystem (system: let
      pkgs = import nixpkgs {inherit system;};
      nodejs = pkgs.nodejs_24;

      # nixpkgs ships pnpm 10.33.0; the repo's package.json declares
      # `engines.pnpm: ">=10.33.2 <11"` and pnpm refuses to install
      # against an older binary. Override the upstream tarball to
      # the exact version pinned by `packageManager`. Bump the url
      # + hash in lockstep with package.json#packageManager.
      #
      # When bumping versions, run the following to get a new hash:
      #
      # ```bash
      # nix store prefetch-file --hash-type sha256 \
      #   https://registry.npmjs.org/pnpm/-/pnpm-${NEW_VERSION}.tgz
      # ```
      pnpm_10 = pkgs.pnpm_10.overrideAttrs (_old: rec {
        version = "10.33.2";
        src = pkgs.fetchurl {
          url = "https://registry.npmjs.org/pnpm/-/pnpm-${version}.tgz";
          hash = "sha256-envPE9f2zrOUbAOXg3PZm+n94cr8MAC9/tTE95EWdhA=";
        };
      });

      daemon = pkgs.callPackage ./nix/package-daemon.nix {
        inherit dream2nix nixpkgs system nodejs pnpm_10;
        src = self;
      };
      web = pkgs.callPackage ./nix/package-web.nix {
        inherit dream2nix nixpkgs system nodejs pnpm_10;
        src = self;
      };
    in {
      packages = {
        inherit daemon web;
        default = daemon;
      };

      # Wrap `od` with `--no-open` for `nix run`: the daemon package
      # builds the daemon workspace only, not `apps/web/out/`, so the
      # browser would otherwise auto-open onto an empty static dir.
      apps.default = {
        type = "app";
        program = "${pkgs.writeShellScript "od-nix-run" ''
          exec ${daemon}/bin/od --no-open "$@"
        ''}";
        meta.description = "Open Design local daemon (`od`)";
      };

      devShells.default = pkgs.mkShell {
        packages = [
          nodejs
          pnpm_10
        ];
        shellHook = ''
          echo "🎨 Open Design dev shell loaded!"
          echo ""
          echo "Language runtimes:"
          echo "  - 🐢 Node.js: $(node --version 2>/dev/null || echo 'not found')"
          echo "  - 📦 pnpm:    $(pnpm --version 2>/dev/null || echo 'not found')"
          echo ""
          echo "Quick start:"
          echo "  - 🚀 pnpm install"
          echo "  - 🚀 pnpm tools-dev    # local lifecycle entry point"
          echo ""
        '';
      };

      checks = {
        daemon = daemon;
        web = web;
      };

      formatter = pkgs.nixpkgs-fmt;
    });

    moduleCommon = import ./nix/module-common.nix;
  in
    perSystem
    // {
      homeManagerModules = rec {
        open-design = import ./nix/home-manager.nix {
          inherit moduleCommon;
          flake = self;
        };
        default = open-design;
      };

      nixosModules = rec {
        open-design = import ./nix/nixos.nix {
          inherit moduleCommon;
          flake = self;
        };
        default = open-design;
      };
    };
}
