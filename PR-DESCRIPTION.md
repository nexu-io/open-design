## What

Adds a Vela AMR proxy model-id normalization rule so that `vela/public_model_kimi_k2_7_code` (→ `kimi_k2_7_code`) is mapped to the canonical model id Open Design uses everywhere else: `kimi-k2.7-code`.

## Why

Moonshot released **Kimi K2.7-Code**. The Vela AMR proxy exposes it via the same `<model>_<variant>` shape as previous Kimi variants, but the normalizer in `apps/daemon/src/runtimes/defs/amr.ts` only knew about K2.6. As a result, a Vela user selecting K2.7 was routed through the unnormalized raw id (`kimi_k2_7_code`, or `kimi-k2-7-code` after the generic underscore replacement) instead of the canonical `kimi-k2.7-code`.

This is the inbound-routing side and is independent from the picker-side fallback list (#4376 / PR #4375), which surfaces the new id in the web UI on discovery failure. Different code paths, independent landing risk.

## How

Added a single sibling rule right after the existing K2.6 line in `normalizeVelaModelId`:

```ts
if (/^kimi_k2_6$/i.test(withoutPrefix)) return 'kimi-k2.6';
if (/^kimi_k2_7_code$/i.test(withoutPrefix)) return 'kimi-k2.7-code'; // NEW
```

The new rule is matched before the generic `_` → `-` fallback, so the canonical dotted id is returned.

## Testing

Mirrored the existing K2.6 normalization assertion in `apps/daemon/tests/amr-acp-integration.test.ts`:

```ts
expect(normalizeVelaModelId('public_model_kimi_k2_7_code')).toBe('kimi-k2.7-code');
```

No other code paths are affected; the change is additive and scoped to a single normalization branch.

Fixes #4410
