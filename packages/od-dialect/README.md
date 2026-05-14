# @open-design/od-dialect

ODML (Open Design Markup Language) AST types, parser, and validator.

## Why this package exists

ODML is a restricted `<od-*>` HTML/XML dialect emitted by Open Design skills
and consumed by per-platform translators (SwiftUI, React, React Native). The
Layer 1 skill validator and the Layer 3 SwiftUI translator both depend on the
same AST shape — without a shared package they would invent two different
trees and integration would break.

This package is the single source of truth. `src/ast.ts` defines:

- The 20 element kinds in the ODML vocabulary v1.
- The token enums (color, spacing, radius, text style, icon size, etc).
- The bind-path / action-ref / value-or-bind value types.
- The discriminated union of violations the validator can emit.

## Boundary

- Pure TypeScript, no runtime dependencies. Imported by both the skill
  validator (browser/Node) and the Open Design daemon (Node).
- No SwiftUI, no React, no platform-specific code. The translator packages
  consume these AST types and emit platform-specific code from them.

## Plan

See `calm-floating-fern` plan §11 (precursor) for the design rationale.
