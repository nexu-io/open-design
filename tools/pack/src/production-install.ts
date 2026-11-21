// Environment isolation for the packaged app's production install.
//
// pnpm re-exports every setting it resolves from the `.npmrc` cascade —
// including a developer's `~/.npmrc` — into its lifecycle children as
// `npm_config_*` variables. npm reads that prefix as its highest-precedence
// `cli`/`env` config layer and refuses those settings for a project-scoped
// install, so a config that is perfectly valid for interactive use aborts this
// install with EALLOWSCRIPTS before a single dependency is unpacked
// (`resolveAllowScripts` rejects the env layer outright; npm/rfcs#868).
// `allow-scripts=…` is the common trigger and is unreachable from the file
// layer for exactly the same reason, so the isolation has to happen here.
//
// The assembled app is installed from repository inputs alone, which makes the
// install a function of the repository rather than of the machine running it.
// Every packaged production install — mac, win, and linux — routes its child
// environment through `productionInstallEnv`.

const AMBIENT_PACKAGE_MANAGER_ENV_PREFIXES = ["npm_config_", "pnpm_config_"] as const;

export function productionInstallEnv(env: NodeJS.ProcessEnv): NodeJS.ProcessEnv {
  const isolated: NodeJS.ProcessEnv = {};
  for (const [key, value] of Object.entries(env)) {
    const normalizedKey = key.toLowerCase();
    if (AMBIENT_PACKAGE_MANAGER_ENV_PREFIXES.some((prefix) => normalizedKey.startsWith(prefix))) {
      continue;
    }
    isolated[key] = value;
  }
  return isolated;
}
