import type { Plugin } from "esbuild";

/** ESM has no NODE_PATH lookup. Native packages use the Shell's Node require resolver. */
export function closureNodeExternals(): Plugin {
  const namespace = "closure-node-runtime";
  return {
    name: namespace,
    setup(builder) {
      builder.onResolve({ filter: /^(better-sqlite3|node-pty)$/ }, input => input.namespace === namespace
        ? { path: input.path, external: true }
        : { path: input.path, namespace });
      builder.onLoad({ filter: /.*/, namespace }, input => ({
        contents: `module.exports = require(${JSON.stringify(input.path)});`,
        loader: "js",
      }));
    },
  };
}
