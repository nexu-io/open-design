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

  outputs = { self, nixpkgs, flake-utils, dream2nix, home-manager }:
    let
      perSystem = flake-utils.lib.eachDefaultSystem (system:
        let
          pkgs = import nixpkgs { inherit system; };
          nodejs = pkgs.nodejs_24;

          daemon = pkgs.callPackage ./nix/package-daemon.nix {
            inherit dream2nix nixpkgs system nodejs;
            src = self;
          };
          web = pkgs.callPackage ./nix/package-web.nix {
            inherit dream2nix nixpkgs system nodejs;
            src = self;
          };
        in
        {
          packages = {
            inherit daemon web;
            default = daemon;
          };

          apps.default = {
            type = "app";
            program = "${daemon}/bin/od";
            meta.description = "Open Design local daemon (`od`)";
          };

          devShells.default = pkgs.mkShell {
            packages = [
              nodejs
              pkgs.pnpm_10
              pkgs.git
            ];
            shellHook = ''
              echo "open-design dev shell — node $(node --version), pnpm $(pnpm --version)"
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
    perSystem // {
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
