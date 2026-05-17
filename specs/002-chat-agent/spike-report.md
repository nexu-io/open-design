# HEP-002-SPIKE: Streaming Chunks Spike Report

**Date:** 2026-05-18  
**Branch:** `feat/HEP-002-SPIKE`  
**Issue:** HEP-2

## Decision: Pure Custom (no library)

**Rationale:** Pure custom implementation came in at **50 LOC** — well under the 120-LOC kill signal.  
`eventsource-parser` would save ~20 LOC at the cost of an extra dependency with no functional benefit for this pattern.

## LOC Count

| File | LOC (non-blank) |
|------|-----------------|
| `apps/web/sandbox/streaming-spike.ts` | **50** |
| Kill signal threshold | 120 |
| Status | ✅ Under threshold — no library needed |

## Implementation Summary

`SseClient` class in `streaming-spike.ts`:
- **EventSource native** — Node 24 built-in, no polyfill
- **Ring buffer 50 chunks** — oldest chunk evicted on overflow
- **Last-Event-ID tracking** — passed as `?lastEventId=` query param on reconnect
- **Inline exponential backoff** — `[1s, 2s, 4s, 8s, 8s]` cap 5 retries, then stops

## Performance: p50/p95 First Chunk

Measured via fake-timer smoke test (3000 synthetic chunks over simulated 5 min):

| Metric | Value |
|--------|-------|
| p50 first-chunk latency (mock) | < 1ms (sync event dispatch) |
| p95 first-chunk latency (mock) | < 1ms |
| Ring overflow correctness | ✅ verified at 60, 3000 chunks |
| 5-min no-crash | ✅ |
| Last-Event-ID reconnect rewind | ✅ |

> Real-network latency benchmarks belong in the Foundation phase (HEP-002-FOUNDATION) with an actual SSE server fixture. The spike goal was pattern validation, not prod perf.

## Test Results

```
✓ buffers up to 50 chunks (ring overflow)
✓ tracks Last-Event-ID from latest chunk
✓ reconnects with Last-Event-ID as query param after error
✓ increments backoff on successive errors: [1s,2s,4s,8s,8s]
✓ stops retrying after 5 errors
✓ resets retry counter on successful message after reconnect
✓ 5-minute sustained stream without crash
✓ Last-Event-ID rewind: reconnect preserves chunks 5+ after gap
```

8/8 tests pass. All pre-existing 729 tests unaffected.

## Pattern Carry to HEP-002-FOUNDATION

- `SseClient` class API is stable — Foundation phase can promote from sandbox to `src/lib/sse-client.ts`
- Ring buffer size (50) may need tuning based on actual message sizes
- Backoff schedule `[1s, 2s, 4s, 8s, 8s]` matches D-P5.0-G spec exactly
- `lastEventId` query-param convention must align with server rewind implementation

## Dependencies

- No new packages installed
- `apps/web/vitest.config.ts`: added `sandbox/**/*.test.{ts,tsx}` to include pattern
