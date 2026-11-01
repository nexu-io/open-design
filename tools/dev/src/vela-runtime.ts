import { accessSync, constants } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";

/** Pin development's default Vela to the installed workspace release, just as
 * packaging does. A global CLI can report a valid login while lacking the
 * workspace billing commands required to send a task. Explicit CLI selections
 * still win; daemon Settings retain their existing higher precedence. */
export function resolveDevVelaEnv(
  workspaceRoot: string,
  env: NodeJS.ProcessEnv = process.env,
  log?: (message: string) => void,
): Record<string, string> {
  if (env.VELA_BIN?.trim()) return {};
  const require = createRequire(path.join(workspaceRoot, "tools/dev/package.json"));
  let packagePath: string;
  try {
    packagePath = require.resolve("@powerformer/vela-cli");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "MODULE_NOT_FOUND") throw error;
    log?.("[tools-dev] workspace Vela is unavailable; run pnpm install to use the pinned CLI. Falling back to PATH; cloud tasks may require a newer CLI.");
    return {};
  }
  try {
    const resolver = require(packagePath) as {
      resolveVelaCliBin: (options: { strict: boolean }) => string;
    };
    const binary = resolver.resolveVelaCliBin({ strict: true });
    if (typeof binary !== "string" || !path.isAbsolute(binary)) {
      throw new Error("Vela package returned no absolute binary path");
    }
    accessSync(binary, process.platform === "win32" ? constants.F_OK : constants.X_OK);
    log?.(`[tools-dev] using workspace Vela: ${binary}`);
    return { VELA_BIN: binary };
  } catch (error) {
    throw new Error("Unable to resolve workspace Vela; run pnpm install or explicitly configure VELA_BIN.", { cause: error });
  }
}
