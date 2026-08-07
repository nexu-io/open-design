# Shared MCP over Streamable HTTP

Open Design supports two MCP transport modes. The default `stdio` mode starts
one `od mcp` child process for each client configuration. The opt-in
Streamable HTTP mode keeps one foreground adapter process and lets multiple
local MCP clients connect to it at the same URL.

Use `stdio` for the simplest setup, a single client, or clients that only know
how to launch an MCP command. Use HTTP when several local agents or concurrent
sessions need Open Design and avoiding one Node.js adapter process per client
is useful.

HTTP mode is explicit. `od mcp`, `od mcp install <agent>`, and existing agent
configurations continue to use `stdio` unless you choose HTTP yourself.

## Start and stop

Start the shared adapter in a terminal:

```bash
od mcp --transport http
```

The default endpoint is:

```text
http://127.0.0.1:7457/mcp
```

Keep that command running while clients use the endpoint. Stop it with
`Ctrl+C`, `SIGINT`, or `SIGTERM`. Shutdown stops accepting connections and
closes every active MCP session. HTTP mode does not install a service or start
automatically at login.

Open Design itself must also be available. The adapter discovers the local
daemon in the same way as `stdio` mode. If an implicitly discovered daemon
restarts on a different port, the next refused request performs one discovery
and retry. A URL supplied with `--daemon-url` or `OD_DAEMON_URL` is considered
operator-owned and is never changed automatically.

## Options

```text
--transport http
--host <127.0.0.1|localhost|::1>  default: 127.0.0.1
--port <1-65535>                  default: 7457
--max-sessions <positive integer> default: 64
--session-idle-timeout <duration> default: 30m
--daemon-url <url>                optional fixed daemon URL
```

Durations accept `ms`, `s`, `m`, or `h`, for example `60s`, `30m`, or `1h`.
The adapter rejects non-loopback bind addresses.

Example with explicit limits:

```bash
od mcp --transport http \
  --host 127.0.0.1 \
  --port 7457 \
  --max-sessions 16 \
  --session-idle-timeout 20m
```

Each client receives a separate MCP session and separate session-local state,
while all clients share the one adapter process and the same Open Design
daemon. Clients should terminate sessions they no longer need; abandoned idle
sessions are closed after the configured timeout. Requests already being
processed are never expired mid-call.

## Configure a client by URL

Only use this path with clients that support MCP Streamable HTTP. The commands
below were verified against the corresponding installed CLI help and use no
authentication because the endpoint is loopback-only.

Codex CLI:

```bash
codex mcp add open-design --url http://127.0.0.1:7457/mcp
```

Claude Code:

```bash
claude mcp add --transport http --scope user open-design \
  http://127.0.0.1:7457/mcp
```

Run the HTTP adapter before opening a client that uses this URL. Other clients
can use the same endpoint when their own documentation explicitly supports
Streamable HTTP; their configuration syntax is intentionally not guessed here.

## Security boundary

The HTTP adapter is a local sharing mechanism, not a remote MCP deployment:

- it accepts only `127.0.0.1`, `localhost`, or `::1` binds;
- it validates the HTTP `Host` header to block DNS rebinding;
- it does not enable permissive CORS;
- it does not log request headers or bearer credentials;
- it does not provide TLS or authentication.

Do not expose port `7457` through a reverse proxy, public bind, container port,
SSH tunnel, or LAN forwarding. Remote access, TLS, authentication, automatic
agent migration, and service management are outside this transport's scope.

## Troubleshooting

- `EADDRINUSE`: choose another `--port`, then update every client URL.
- `maximum MCP session count reached`: close unused clients or raise
  `--max-sessions` and restart the adapter.
- `MCP session not found`: the session expired or the adapter restarted;
  reconnect the client so it initializes a new session.
- daemon unreachable with an explicit URL: start that daemon or correct
  `--daemon-url`; explicit URLs intentionally do not fail over.
- a client only supports command-based MCP: keep using the default `stdio`
  setup with `od mcp install <agent>`.
