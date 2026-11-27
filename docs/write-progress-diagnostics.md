# Write progress diagnostics

The AMR ACP adapter accepts private version 1 `sessionUpdate: write_progress`
notifications from Vela only during the active prompt and for its ACP session.
Vela must also match the OpenCode session and current assistant message before
forwarding `session.write_progress` events. Older producers provide no coverage;
absence of these records is not evidence that a Write never started.

The daemon stores sanitized `agent` diagnostics in the existing run event log
and diagnostics export. The existing Langfuse reliability path receives the same
allowlisted fields after a second validation. There is no new endpoint, setting,
telemetry destination, or UI/CLI action.

## Reading the evidence

- `input_started`, `input_progress`, `input_ended`: observed argument stream,
  cumulative UTF-8 bytes and delta count, and first/last delta timestamps.
- `arguments_ready`: parsed argument availability; `hasContent` and `hasFilePath`
  report string-field presence without retaining either value.
- `validation_failed`: rejected arguments, including the invalid-tool fallback.
  A generic `tool_error` does not prove JSON parsing versus schema validation.
- `execution_started`, `permission_requested`, `file_write_started`,
  `file_write_finished`, `postprocess_started`, `execution_returned`: producer
  execution boundaries. File write completion does not prove subsequent
  formatting/LSP work or delivery of a tool result finished.
- `result_observed`: the processor observed a result/error for the tool call.
- `stream_finished`, `stream_failed`, `interrupted`: stream evidence, independent
  of tool execution and result delivery. Stream completion is not tool success.

`write_progress_snapshot` is host evidence. It records the last received facts,
separate execution phase/result observation, and host-clock `silentForMs` after
60 seconds without an accepted update or when the ACP session closes. It does
not classify the root cause, fail the task, or synthesize a successful result.
Producer `atMs` and delta timestamps must not be subtracted from host timestamps
when clocks differ. All counters mean observed transport data, not bytes committed
to disk. Execution and stream events can arrive interleaved.

## Bounds and privacy

Each prompt retains at most 64 message/call pairs. Each pair accepts each phase
once and up to 120 progress frames, at least five seconds apart. A progress cap
does not discard a later distinct error/result phase. Snapshots are emitted once
per observed silence interval plus one on close for calls without a result.
Missing later progress can therefore also mean capped or incomplete coverage.

IDs are hashed before persistence. Payloads contain fixed phases/error categories,
booleans, bounded safe integers, and hashes. Argument text, file paths, context,
error messages and stacks are excluded. Unknown versions or malformed metadata
are dropped before generic status projection. Vela also writes bounded-category
error records to its existing stderr with hashed IDs.

Diagnostic frames and snapshots never reset the ACP response or Vela inactivity
watchdogs, count as visible output, trigger retries/cancellation, or replay Write.
This change does not identify or repair the underlying stall. Producer, bridge,
and consumer must ship together for complete evidence; packaging updates and
Windows packaged acceptance remain separate work.
