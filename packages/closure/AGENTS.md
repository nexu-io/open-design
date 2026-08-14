# packages/closure

Follow the root `AGENTS.md` and `packages/AGENTS.md` first.

This package is the shell-neutral Standalone Closure boundary. Its public API is
split into `./protocol`, `./store`, and `./update`.

- `protocol` owns Closure identities, manifests, validation, and canonical digests.
- `store` owns immutable content materialization and the
  prepared/attempt/active/lastSuccessful channel binding transaction; runtime
  bindings include the exact Shell identity that passed health confirmation.
- `update` owns release discovery, resumable download, repair, and preparation.

The protocol subpath must not import Store or update implementation modules. Store
must not discover releases or launch processes. Update must not update a Shell,
render UI, infer Shell-private paths, or own runtime process identity.

Launcher is a required Closure component. Node remains Shell bootstrap/carrier
material and is not a Closure component.
