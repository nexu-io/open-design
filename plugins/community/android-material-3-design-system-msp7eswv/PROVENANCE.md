# Provenance and Evidence Boundary

## Origin

This package was formalized by Open Design from candidate `166087e0-842d-423c-b5da-63bf3233dbdc`. The originating run metadata and copied source references are preserved in `references/provenance.json` and `references/source-*.md`.

## Primary Guidance

- Material Design 3 overview: <https://m3.material.io/>
- Material color roles: <https://m3.material.io/styles/color/roles>
- Material typography: <https://m3.material.io/styles/typography/overview>
- Android adaptive layouts: <https://developer.android.com/develop/ui/compose/layouts/adaptive>
- Android Material 3 components: <https://developer.android.com/develop/ui/compose/components>

The light and dark schemes in `colors_and_type.css` use the widely published Material 3 baseline purple palette as a deterministic fallback. A product implementation should generate a complete scheme from verified product source colors or platform dynamic color APIs.

## Evidence Limits

Intake did not provide a source repository, local product code, Figma file, logo, font file, build asset, or original product component. This package therefore does not claim source-backed product assets or implementation code. The inbox UI kit is an applied example authored from Material 3 rules; it is not copied from a Google or third-party product.

Files under `references/` are historical snapshots. Some describe the larger package that the original run intended to emit. The current root README and actual file tree supersede those proposed inventories.

## Attribution

Material Design, Android, and related marks belong to their respective owners. This community package provides implementation guidance and does not include or license Google brand assets. Consumers are responsible for verifying applicable licenses, brand rules, and accessibility requirements for production use.
