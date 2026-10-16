# CMS touchpoint load observability: late results

What happens when a touchpoint load attempt receives a result (a terminal, or a `report` record from an exposure / acceptance / test-events receipt) after it has already moved on. The authoritative description is the OBS-008 doc block above `TouchpointLoadAttempt` in `apps/web/src/components/touchpoint-load-observability.ts`. The behaviour is pinned by the "OBS-008 late results" suite in `apps/web/tests/components/touchpoint-load-observability.test.ts`.

| Situation | Behaviour |
|---|---|
| Result after the terminal, attempt still owned (including a same-binding renewal) | `report` is recorded on that attempt's `load_attempt_id` |
| A second terminal (`visible` / `fail` / `cancel`) after the attempt settled | Ignored: exactly one terminal per attempt |
| Result after the attempt is retired (`page_left`, `identity_changed`, `locale_changed`, `revoked`, `capability_unsupported`) | Dropped: no record. Owner dispose also closes the sink, and an identity switch disposes the old queue |
| Result after a version switch (activity, deployment or content version changed) | Old attempt is retired with `decision_changed`, so the late result is dropped. It is never rebound to the new attempt |

Consequence for analysis: if a retired attempt is `visible` but has no `report`, the receipt outcome is **unknown**. It does not mean the receipt failed. The receipt request itself is not recalled. A Production exposure that has already been sent still reaches the events API.
