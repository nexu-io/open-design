import { createRequire, registerHooks } from "node:module";
import { isAbsolute, join } from "node:path";
import { pathToFileURL } from "node:url";

export const STANDALONE_NATIVE_ROOT_ENV = "OD_STANDALONE_NATIVE_ROOT" as const;

const nativeRoot = process.env[STANDALONE_NATIVE_ROOT_ENV];
if (nativeRoot == null || !isAbsolute(nativeRoot)) {
  throw new Error(`${STANDALONE_NATIVE_ROOT_ENV} must point to the verified native component`);
}
const resolveNative = createRequire(join(nativeRoot, "resolver.cjs"));

registerHooks({
  resolve(specifier, context, nextResolve) {
    try {
      return nextResolve(specifier, context);
    } catch (error) {
      if (
        specifier.startsWith(".")
        || specifier.startsWith("/")
        || specifier.startsWith("node:")
      ) throw error;
      try {
        return {
          shortCircuit: true,
          url: pathToFileURL(resolveNative.resolve(specifier)).href,
        };
      } catch {
        throw error;
      }
    }
  },
});
