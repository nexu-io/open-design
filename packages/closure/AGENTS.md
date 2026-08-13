# packages/closure

Follow the root `AGENTS.md` and `packages/AGENTS.md` first.

This package is the shell-neutral Standalone Closure boundary. Its public API is
split into `./protocol`, `./store`, and `./update`.

- `protocol` owns Closure identities, manifests, validation, and canonical digests.
- `store` owns immutable content materialization and the active channel/namespace binding.
- `update` owns release discovery, download, repair, and commit orchestration.

The protocol subpath must not import Store or update implementation modules. Store
must not discover releases or launch processes. Update must not update a Shell,
render UI, infer Shell-private paths, or own runtime process identity.

Launcher is a required Closure component. Node remains Shell bootstrap/carrier
material and is not a Closure component.
