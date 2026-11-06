# Antigravity (`agy`) stream-json fixtures

- `quota-exhausted.stdout.ndjson` / `quota-exhausted.stderr.txt`: recorded from
  agy 1.3.1 on 2026-10-08 with
  `agy --log-file <log> --input-format stream-json --output-format stream-json < input.ndjson`
  on an account whose quota was exhausted (exit code 3). Only the `init.cwd`
  path and the long `init.tools` list were trimmed.
- `signed-out.stdout.ndjson` / `signed-out.stderr.txt`: recorded from agy
  1.3.1 on 2026-10-08 with the same command and an empty `HOME` (no stored
  credentials). agy fails fast with exit code 1 instead of waiting for OAuth.
- `docs-success.stdout.ndjson`: the event samples published verbatim on
  https://antigravity.google/docs/cli/headless (init, user_input step, tool
  step, agent_response step with `text_delta`, SUCCESS result), concatenated in
  stream order. No locally recorded success stream exists yet because the
  recording account's quota was exhausted.
