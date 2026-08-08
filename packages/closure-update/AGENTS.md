# packages/closure-update

Follow the root `AGENTS.md` and `packages/AGENTS.md` first.

This package owns shell-neutral Closure release selection and binding orchestration. It composes protocol, Store, and managed-download primitives while callers provide channel, namespace, platform, release target, roots, shell version, and scheduling.

It must not update a shell, render update UI, infer packaged paths, launch Web/daemon, or depend on Desktop/Codex private state. Candidate identity remains in `closure-proto`; the single committed release binding remains in `closure-store`.
