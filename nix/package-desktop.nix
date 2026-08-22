{
  lib,
  stdenv,
  nodejs,
  pnpm_10,
  fetchPnpmDeps,
  fetchurl,
  pnpmConfigHook,
  electron,
  copyDesktopItems,
  makeDesktopItem,
  writeShellScript,
  src,
  pnpmDepsSrc ? src,
  python3,
  gnumake,
  pkg-config,
  workspacePaths,
}:
let
  pname = "open-design-desktop";
  version = (lib.importJSON ../package.json).version;
  dshRuntimeVersion = (lib.importJSON ../packages/dsh-runtime/package.json).version;
  webOutputMode = "server";
  copyBundledVelaCli = import ./copy-bundled-vela-cli.nix;
  pruneWorkspaceRuntimeCopy = import ./prune-workspace-runtime-copy.nix { inherit lib; };
  rebuildNativeAddons = import ./rebuild-native-addons.nix { inherit lib nodejs; };

  pnpmDepsHash = (import ./pnpm-deps.nix).desktopHash;
  pnpmWorkspaceFilters = map (workspacePath: "./${workspacePath}") workspacePaths;

  # Bundled Vela CLI (AMR). tools/pack is the only workspace manifest that
  # declares @powerformer/vela-cli, and it is intentionally excluded from the
  # filtered Nix install, so the pinned platform package is fetched as an
  # explicit derivation input instead of being discovered through
  # node_modules. Keep version + hashes in sync with:
  # - version: tools/pack/package.json optionalDependencies["@powerformer/vela-cli"]
  # - hashes:  pnpm-lock.yaml snapshots for @powerformer/vela-cli-linux-{x64,arm64}
  velaCliVersion =
    (lib.importJSON ../tools/pack/package.json).optionalDependencies."@powerformer/vela-cli";
  velaCliArch =
    if stdenv.hostPlatform.isAarch64
    then "arm64"
    else "x64";
  velaCliTarball = fetchurl {
    url = "https://registry.npmjs.org/@powerformer/vela-cli-linux-${velaCliArch}/-/vela-cli-linux-${velaCliArch}-${velaCliVersion}.tgz";
    hash =
      if stdenv.hostPlatform.isAarch64
      then "sha512-+DHifD5ylfjfsaWCo0NuPwl+D0lxkOs+apDCaxrj4EkSABkzjryrh2yIBncopZbz3GmDw+43AKNfTyDx6yr4fg=="
      else "sha512-uBAeeTUEUaLMe5DtO1RjfiH7egvljfUJoUEkGOqle2O83wX2zulXkQzDhh+br5EvKsZo9RtSHzCcsiRPaNeo/g==";
  };

  desktopIcon = ../tools/pack/resources/linux/icon.png;
  desktopIconName = "open-design-desktop";
  dshRuntimeManifestBase = builtins.toJSON {
    packageName = "@open-design/dsh-runtime";
    schemaVersion = 1;
    version = dshRuntimeVersion;
  };
  dshRuntimeManifestWriter = builtins.toFile "open-design-write-dsh-runtime-manifest.mjs" ''
    import { writeFileSync } from "node:fs";

    const outputPath = process.argv[2];
    const base = JSON.parse(process.argv[3]);
    const payload = {
      file: process.argv[4],
      ...base,
      sha256: process.argv[5],
    };

    writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n");
  '';
  packagedConfigWriter = builtins.toFile "open-design-write-packaged-config.mjs" ''
    import { writeFileSync } from "node:fs";

    const outputPath = process.argv[2];
    const payload = {
      appVersion: process.argv[3],
      namespaceBaseRoot: process.argv[4],
      nodeCommand: process.argv[5],
      resourceRoot: process.argv[6],
      webOutputMode: process.argv[7],
    };

    writeFileSync(outputPath, JSON.stringify(payload, null, 2) + "\n");
  '';
  launcherScript = writeShellScript "open-design-desktop-launcher" ''
    #!${stdenv.shell}
    set -euo pipefail

    # Resolve the launcher through any symlink chain first. After
    # `nix profile install .#desktop`, bin/open-design-desktop is a symlink
    # into /nix/store, so dirname "$0" alone would point at the profile's bin
    # instead of this derivation. `pwd -P` canonicalizes only the directory
    # and never the executable itself, hence readlink -f on the script path.
    script_path="$(readlink -f -- "$0")"
    script_dir="$(dirname "$script_path")"
    package_root="$(dirname "$script_dir")"
    app_root="$package_root/lib/open-design/apps/packaged"
    resource_root="$package_root/share/open-design"

    # Packaging self-check hook: prints the resolved derivation prefix and exits.
    # Used by installCheckPhase to prove path resolution survives invocation
    # through a profile symlink chain (see below); no side effects before this.
    if [ "''${1:-}" = "--print-package-root" ]; then
      printf '%s\n' "$package_root"
      exit 0
    fi

    xdg_data_home="''${XDG_DATA_HOME:-$HOME/.local/share}"
    namespace_base_root="''${OD_PACKAGED_NAMESPACE_BASE_ROOT:-$xdg_data_home/open-design/namespaces}"
    installation_root="$(dirname "$namespace_base_root")"
    runtime_config_root="$installation_root/runtime"
    config_path="$runtime_config_root/open-design-config.json"

    mkdir -p "$namespace_base_root" "$runtime_config_root"

    ${lib.getExe nodejs} ${packagedConfigWriter} \
      "$config_path" \
      ${lib.escapeShellArg version} \
      "$namespace_base_root" \
      ${lib.escapeShellArg (lib.getExe nodejs)} \
      "$resource_root" \
      ${lib.escapeShellArg webOutputMode}

    if [ -z "''${VELA_BIN:-}" ]; then
      if [ -x "$resource_root/bin/vela" ]; then
        export VELA_BIN="$resource_root/bin/vela"
      else
        vela_path="$(command -v vela 2>/dev/null || true)"
        if [ -n "$vela_path" ]; then
          export VELA_BIN="$vela_path"
        fi
      fi
    fi
    export OD_PACKAGED_CONFIG_PATH="$config_path"
    exec ${lib.getExe electron} "$app_root" "$@"
  '';
in
  stdenv.mkDerivation (finalAttrs: {
    inherit pname version src;

    pnpmWorkspaces = pnpmWorkspaceFilters;

    nativeBuildInputs = [
      nodejs
      pnpm_10
      pnpmConfigHook
      copyDesktopItems
      python3
      gnumake
      pkg-config
    ];

    desktopItems = [
      (makeDesktopItem {
        name = desktopIconName;
        desktopName = "Open Design";
        genericName = "Open Design";
        comment = "Open Design desktop runtime";
        exec = "${placeholder "out"}/bin/open-design-desktop %U";
        icon = desktopIconName;
        categories = [
          "Development"
          "Utility"
        ];
        mimeTypes = [ "x-scheme-handler/od" ];
        startupNotify = true;
        startupWMClass = "Open Design";
        terminal = false;
        type = "Application";
      })
    ];

    pnpmDeps = fetchPnpmDeps {
      inherit (finalAttrs) pname version;
      src = pnpmDepsSrc;
      hash = pnpmDepsHash;
      pnpm = pnpm_10;
      pnpmWorkspaces = pnpmWorkspaceFilters;
      fetcherVersion = 3;
    };

    env = {
      NODE_ENV = "production";
      OD_WEB_OUTPUT_MODE = webOutputMode;
    };

    doInstallCheck = true;

    # Smoke test: after `nix profile install .#desktop`, bin/open-design-desktop
    # is reached through a profile symlink, so the launcher must resolve its own
    # real path (readlink -f) rather than trusting $0. This check reproduces the
    # profile layout and fails if the derivation prefix resolves outside $out.
    # The launcher's package_root IS the derivation prefix ($out); app_root and
    # resource_root append their lib/ and share/ suffixes from it.
    installCheckPhase = ''
      runHook preInstallCheck

      profile_bin="$TMPDIR/nix-profile/bin"
      mkdir -p "$profile_bin"
      ln -s "$out/bin/open-design-desktop" "$profile_bin/open-design-desktop"

      resolved_package_root="$("$profile_bin/open-design-desktop" --print-package-root)"
      if [ "$resolved_package_root" != "$out" ]; then
        echo "open-design-desktop: launcher resolved package root to '$resolved_package_root' instead of '$out' when invoked through a symlink" >&2
        exit 1
      fi

      # Bundled AMR contract: the daemon resolves vela through
      # OD_RESOURCE_ROOT/bin/vela and its OpenCode companion at
      # OD_RESOURCE_ROOT/bin/libexec/opencode/... (see
      # copy-bundled-vela-cli.nix). Fail the build rather than shipping a
      # desktop where collab/AMR is silently unavailable on a clean install.
      if [ ! -x "$out/share/open-design/bin/vela" ]; then
        echo "open-design-desktop: installed tree is missing share/open-design/bin/vela; the bundled Vela CLI contract would be broken" >&2
        exit 1
      fi
      if [ ! -x "$out/share/open-design/bin/libexec/opencode/opencode" ]; then
        echo "open-design-desktop: installed tree is missing share/open-design/bin/libexec/opencode/opencode; the bundled Vela OpenCode companion would be broken" >&2
        exit 1
      fi

      runHook postInstallCheck
    '';

    buildPhase = ''
      runHook preBuild

      ${rebuildNativeAddons { messageSuffix = "pnpm install may have failed"; }}

      pnpm --filter @open-design/release run build
      pnpm --filter @open-design/components run build
      pnpm --filter @open-design/contracts run build
      pnpm --filter @open-design/registry-protocol run build
      pnpm --filter @open-design/sidecar-proto run build
      pnpm --filter @open-design/launcher-proto run build
      pnpm --filter @open-design/sidecar run build
      pnpm --filter @open-design/platform run build
      pnpm --filter @open-design/download run build
      pnpm --filter @open-design/host run build
      pnpm --filter @open-design/agui-adapter run build
      pnpm --filter @open-design/plugin-runtime run build
      pnpm --filter @open-design/diagnostics run build
      pnpm --filter @open-design/dsh-runtime run build
      pnpm --filter @open-design/daemon run build
      OD_WEB_OUTPUT_MODE=${lib.escapeShellArg webOutputMode} pnpm --filter @open-design/web run build
      pnpm --filter @open-design/web run build:sidecar
      pnpm --filter @open-design/desktop run build
      pnpm --filter @open-design/packaged run build

      runHook postBuild
    '';

    installPhase = ''
      runHook preInstall

      workspaceRoot=$out/lib/open-design
      resourceRoot=$out/share/open-design
      desktopIconRoot=$out/share/icons/hicolor/512x512/apps

      mkdir -p \
        $workspaceRoot \
        $desktopIconRoot \
        $resourceRoot/agent-runtimes/deepseek-harness \
        $resourceRoot/skills \
        $resourceRoot/design-templates \
        $resourceRoot/design-systems \
        $resourceRoot/craft \
        $resourceRoot/plugins/_official \
        $resourceRoot/plugins/registry \
        $resourceRoot/frames \
        $resourceRoot/community-pets \
        $resourceRoot/prompt-templates \
        $resourceRoot/data/plugin-previews \
        $out/bin

      cp -r . $workspaceRoot/

      ${pruneWorkspaceRuntimeCopy {
        workspaceRoot = "$workspaceRoot";
        inherit workspacePaths;
        extraKeepsByTarget = {
          "apps/daemon" = [ "bin" ];
          "apps/desktop" = [ "vendor" ];
          # next.config.ts must survive pruning: the packaged web sidecar
          # hands the writable runtime copy to Next.js through OD_WEB_DIST_DIR
          # and that mapping (env -> distDir) lives only in this config. The
          # sidecar starts Next via dir: webRoot, so without the file Next
          # falls back to <webRoot>/.next and runs against the read-only
          # Nix-store build, reintroducing EACCES on relaunch.
          "apps/web" = [ ".next" "next.config.ts" "public" ];
        };
        rootNodeModulesRemovals = [
          "@open-design/tools-dev"
          "@open-design/tools-pack"
          "@open-design/tools-release"
          "@open-design/tools-serve"
          ".bin/tools-dev"
          ".bin/tools-pack"
          ".bin/tools-release"
          ".bin/tools-serve"
        ];
      }}

      # Linux terminal contract: the daemon spawns terminals through
      # node-pty, which has no Linux prebuilds, so the compiled addon must
      # exist in the installed tree AND load under the same Node the
      # packaged sidecars run with.
      pty_dir=$(find "$out/lib/open-design/node_modules/.pnpm" -mindepth 2 -maxdepth 4 \
        -type d -path '*/node-pty@*/node_modules/node-pty' -print -quit)
      if [ -z "$pty_dir" ] || [ ! -f "$pty_dir/build/Release/pty.node" ]; then
        echo "open-design-desktop: installed tree has no compiled Linux node-pty addon; /api/projects/:id/terminals would fail with TERMINAL_SPAWN_FAILED" >&2
        exit 1
      fi
      # Load the addon through its own package entry point so this exercises
      # exactly what the daemon's dynamic import does at runtime.
      ${lib.getExe nodejs} -e "require(process.argv[1])" "$pty_dir"

      # Packaging guard: the writable OD_WEB_DIST_DIR handoff only takes
      # effect when next.config.ts is present in the installed apps/web tree
      # (see the keep-list comment above). Fail the build here rather than
      # shipping a desktop that runs against the read-only store copy.
      if [ ! -f "$workspaceRoot/apps/web/next.config.ts" ]; then
        echo "open-design-desktop: installed apps/web is missing next.config.ts; OD_WEB_DIST_DIR would be ignored" >&2
        exit 1
      fi

      # Packaged desktop resolves preload relative to app.getAppPath().
      install -m0644 apps/desktop/dist/main/preload.cjs $workspaceRoot/apps/packaged/preload.cjs
      install -m0644 ${desktopIcon} $desktopIconRoot/${desktopIconName}.png

      cp -r skills/. $resourceRoot/skills/
      cp -r design-templates/. $resourceRoot/design-templates/
      cp -r design-systems/. $resourceRoot/design-systems/
      cp -r craft/. $resourceRoot/craft/
      cp -r plugins/_official/. $resourceRoot/plugins/_official/
      cp -r plugins/registry/. $resourceRoot/plugins/registry/
      cp -r assets/frames/. $resourceRoot/frames/
      cp -r assets/community-pets/. $resourceRoot/community-pets/
      cp -r prompt-templates/. $resourceRoot/prompt-templates/
      cp -r data/plugin-previews/. $resourceRoot/data/plugin-previews/

      ${copyBundledVelaCli {
        resourceRoot = "$resourceRoot";
        velaTarball = velaCliTarball;
      }}

      pnpm -C packages/dsh-runtime pack --pack-destination $resourceRoot/agent-runtimes/deepseek-harness >/dev/null
      dsh_tarball=$(basename "$resourceRoot"/agent-runtimes/deepseek-harness/*.tgz)
      dsh_sha256=$(sha256sum "$resourceRoot/agent-runtimes/deepseek-harness/$dsh_tarball" | cut -d' ' -f1)
      ${lib.getExe nodejs} ${dshRuntimeManifestWriter} \
        "$resourceRoot/agent-runtimes/deepseek-harness/manifest.json" \
        ${lib.escapeShellArg dshRuntimeManifestBase} \
        "$dsh_tarball" \
        "$dsh_sha256"

      install -m0755 ${launcherScript} $out/bin/open-design-desktop

      runHook postInstall
    '';

    meta = {
      description = "OpenDesign desktop runtime for Linux via Nix";
      homepage = "https://github.com/nexu-io/open-design";
      license = lib.licenses.asl20;
      mainProgram = "open-design-desktop";
      platforms = lib.platforms.linux;
    };
  })
