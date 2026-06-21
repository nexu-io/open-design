# Solve-brief: AMR: normalize Vela's kimi_k2_7_code id to kimi-k2.7-code

> Autopilot-taak voor bounty github:nexu-io/open-design#4410.

## De opdracht
- **Repo:** nexu-io/open-design
- **Issue:** #4410 -> https://github.com/nexu-io/open-design/issues/4410
- **Bedrag:** onbekend
- **Triage:** Triviale, afgebakende bugfix: één regex-regel toevoegen en één test-case spiegelen in TypeScript. Duidelijke precedent (K2.6-regel), minimale landing-risk, perfekte 'good first issue'.

## Issue-omschrijving
### What

\`apps/daemon/src/runtimes/defs/amr.ts\` carries a small table of Vela AMR proxy model-id normalizers, including the existing K2.6 rule:

\`\`\`ts
if (/^kimi_k2_6$/i.test(withoutPrefix)) return 'kimi-k2.6';
\`\`\`

When Moonshot releases a new Kimi model variant, the Vela AMR proxy typically exposes it via the same \`<model>_<variant>\` shape, and Open Design needs a matching normalization rule so the Vela-prefixed id (\`vela/public_model_kimi_k2_7_code\` → \`kimi_k2_7_code\`) gets mapped to the canonical model id Open Design uses everywhere else (\`kimi-k2.7-code\`).

Moonshot released **Kimi K2.7-Code** on 2026-06-12. PR #4375 lists it in the Kimi runtime's \`fallbackModels\`, but the AMR normalization rule still only knows about K2.6 — so a Vela user selecting K2.7 today still gets routed through the unnormalized raw id.

### Repro

1. Run an Open Design daemon configured to route Kimi through the Vela AMR proxy.
2. Trigger a chat/run with a Vela K2.7 model id (e.g. \`vela/public_model_kimi_k2_7_code\`).
3. Observe that the normalized model id used downstream is \`kimi_k2_7_code\` (or \`kimi-k2-7-code\` after the generic underscore replacement) instead of the canonical \`kimi-k2.7-code\`.

### Proposed fix

Add a single sibling rule right after the K2.6 line:

\`\`\`ts
if (/^kimi_k2_6$/i.test(withoutPrefix)) return 'kimi-k2.6';
if (/^kimi_k2_7_code$/i.test(withoutPrefix)) return 'kimi-k2.7-code'; // NEW
\`\`\`

Plus a test case mirroring the existing K2.6 normalization assertion in \`apps/daemon/tests/amr-acp-integration.test.ts\`.

### Why this is a separate issue from #4376

#4376 / PR #4375 is the picker-side fallback list (web UI surfaces the new model id when discovery fails). This is the inbound-routing side (Vela ids get mapped to the canonical id Open Design uses). Different code paths, independent landing risk. Splitting keeps the picker change reviewable on its own and lets the AMR rule ship behind whichever timeline Vela confirms K2.7 support

## Aanpak
1. Lees het issue volledig + bestaande code.
2. Implementeer de kleinst mogelijke nette fix in de stijl van de repo.
3. Schrijf of update tests. Draai de testsuite tot groen.
4. Houd de diff klein. Geen ongerelateerde wijzigingen.
5. Dien NIETS in: geen git push, geen PR. De Autopilot doet dat.
