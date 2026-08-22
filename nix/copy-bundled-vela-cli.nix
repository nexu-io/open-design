{ resourceRoot, velaTarball }:
''
  # Mirror the packaged runtime contract from tools/pack: the daemon resolves
  # bundled AMR through OD_RESOURCE_ROOT/bin/vela and the OpenCode companion at
  # OD_RESOURCE_ROOT/bin/libexec/opencode/...
  #
  # The pinned platform tarball is an explicit derivation input because the
  # filtered Nix workspace install intentionally excludes tools/pack, the only
  # manifest declaring @powerformer/vela-cli; discovering the binary through
  # node_modules would silently skip the copy on a clean install. Fail fast
  # here rather than shipping a desktop without the bundled AMR contract.
  vela_extracted=$TMPDIR/vela-cli-platform
  mkdir -p "$vela_extracted"
  tar -xzf ${velaTarball} -C "$vela_extracted" --strip-components=1

  if [ ! -f "$vela_extracted/bin/vela" ]; then
    echo "open-design-desktop: bundled vela binary missing from ${velaTarball}" >&2
    exit 1
  fi

  mkdir -p ${resourceRoot}/bin/libexec
  install -m0755 "$vela_extracted/bin/vela" ${resourceRoot}/bin/vela
  # The OpenCode companion ships inside the platform package at bin/libexec/.
  if [ -d "$vela_extracted/bin/libexec" ]; then
    cp -r "$vela_extracted/bin/libexec"/. ${resourceRoot}/bin/libexec/
  fi
''
