# tools-pack

`tools-pack` is the thin local macOS package acceptance CLI.

It serializes explicit requests to the typed adapters under
`shells/electron/scripts`, validates their receipts, and presents build,
install, start, stop, logs, uninstall, cleanup, and CDP-backed inspect commands.
It does not import `electron-kit`, assemble Electron applications, define
product handlers, own a second process model, or publish releases.

```sh
pnpm tools-pack mac build --to all \
  --namespace release-betahyx \
  --app-version 0.1.0-betahyx.1 \
  --standalone-bootstrap-url http://127.0.0.1:61127/bootstrap.json
pnpm tools-pack mac install --namespace release-betahyx
pnpm tools-pack mac start --namespace release-betahyx
pnpm tools-pack mac inspect --namespace release-betahyx
pnpm tools-pack mac logs --namespace release-betahyx
pnpm tools-pack mac stop --namespace release-betahyx
pnpm tools-pack mac cleanup --namespace release-betahyx
```

Channel version and Shell compatibility version are independent values. The
release version may include its channel as a defensive naming convention;
Shell compatibility remains declared by `shells/electron/config/shell.json`.

Windows distribution remains implemented and tested at the
`electron-kit`/Electron Shell boundary, but tools-pack does not expose a
Windows local lifecycle in this slice. Linux has only the symmetric
`electron-kit` platform declaration and no delivery capability in this PR.
