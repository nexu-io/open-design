{ lib }:
{
  workspaceRoot,
  workspacePaths,
  extraKeepsByTarget ? { },
  rootNodeModulesRemovals ? [ ],
}:
let
  defaultKeeps = [ "dist" "node_modules" "package.json" ];
  renderFindKeepArgs = keeps:
    lib.concatMapStringsSep " \\\n" (keep: "              ! -name ${lib.escapeShellArg keep}") keeps;
  renderCaseArm = target: let
    keeps = defaultKeeps ++ (extraKeepsByTarget.${target} or [ ]);
  in ''
          ${target})
            find "${workspaceRoot}/$target" -mindepth 1 -maxdepth 1 \
${renderFindKeepArgs keeps} \
              -exec rm -rf {} +
            ;;
'';
  caseArms = lib.concatStringsSep "" (map renderCaseArm (builtins.attrNames extraKeepsByTarget));
  rootNodeModulesRemovalLines = lib.concatMapStringsSep " \\\n" (entry: "        ${workspaceRoot}/node_modules/${entry}") rootNodeModulesRemovals;
in
  ''
      for target in ${lib.escapeShellArgs workspacePaths}; do
        case "$target" in
${caseArms}          *)
            find "${workspaceRoot}/$target" -mindepth 1 -maxdepth 1 \
${renderFindKeepArgs defaultKeeps} \
              -exec rm -rf {} +
            ;;
        esac
      done

''
  + lib.optionalString (rootNodeModulesRemovals != [ ]) ''
      rm -f \
${rootNodeModulesRemovalLines}

''
