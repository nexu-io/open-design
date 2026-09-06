# tools-release

`tools-release` owns release lifecycle objects and immutable publication. It is
not an Electron builder.

The active exact flow is:

1. resolve content identities and accepted baselines;
2. prepare signed content and Shell requirements;
3. finalize release-neutral Shell distribution contributions;
4. publish immutable objects with readback verification;
5. collect target-bound acceptance credentials;
6. compare-and-swap the channel head.

`release-exact` is the only Electron release workflow in this slice, and
`betahyx` is its isolated Electron delivery channel. The explicit channel and
release version travel together through storage, acceptance, and activation.
A version such as `0.1.0-betahyx.1` repeats the channel as a defensive naming
convention; it does not replace the explicit channel field.

Legacy channel metadata helpers remain only as file/data protocol readers and
use `resources/channel-versions.json` as the channel-owned base-version
registry. They do not build or validate Electron artifacts and cannot serve as
an acceptance path.

```sh
pnpm --filter @open-design/tools-release typecheck
pnpm --filter @open-design/tools-release build
pnpm --filter @open-design/tools-release test
pnpm exec tools-release exact-plan --help
pnpm exec tools-release exact-release-plan --help
pnpm exec tools-release exact-control --help
```
