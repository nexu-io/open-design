# tools-connectors-cli

The `tools-connectors-cli` module backs the `od tools connectors …` CLI (subcommands: `list`, `execute`, `github-design-context`, `local-design-context`, `design-system-package-audit`) and the `auditDesignSystemPackage` audit engine consumed by the project route. It was split out of a former 2,830-line `tools-connectors-cli.ts` god-file and restructured as a capability barrel with a strict acyclic layer model.

## Why this shape

Splitting the god-file into `core/` + concern subdirs makes each layer independently testable and keeps the scoring and path logic (used by both intake and audit) reachable without pulling in HTTP or file-write concerns. The acyclic layering means `core/` can be read and reasoned about in isolation; higher-concern modules (`intake/`, `audit/`, `evidence/`) build on top of it without creating cycles.

## Directory structure

```
tools-connectors-cli/
├── index.ts                   # Public barrel — the only file external code may import
├── commands.ts                # CLI dispatch: parses args, calls intake/evidence/audit, writes JSON output
├── core/
│   ├── index.ts               # Core barrel
│   ├── types.ts               # Shared types, interfaces, and tuning constants
│   ├── cli-io.ts              # Option parsing, JSON I/O, daemon URL/token resolution
│   ├── github-paths.ts        # Repo parsing, output/snapshot path derivation, build-asset targets
│   ├── design-scoring.ts      # File/directory relevance scoring and path predicates
│   ├── git-process.ts         # git clone, gh-CLI auth, buffered child-process execution
│   └── api.ts                 # Daemon connector API calls and response compaction
├── intake/
│   ├── index.ts               # Intake barrel
│   ├── connector-read.ts      # Connector read-tool invocation and content decoding
│   └── evidence-collect.ts    # Gather evidence from GitHub (connector or clone) or local folder
├── audit/
│   ├── index.ts               # Audit barrel
│   └── audit.ts               # auditDesignSystemPackage: one ~430-line entry fn + validators
└── evidence/
    ├── index.ts               # Evidence barrel
    └── evidence-write.ts      # Write JSON+markdown artifacts and materialize package assets
```

## Import conventions

- **External code** imports only the module root barrel: `./tools-connectors-cli/index.js`
- **Cross-concern imports** go through a sibling's barrel: `../core/index.js`, `../intake/index.js`, etc. — never a private file inside another subdir.
- **Same-subdir files** import each other directly: `./connector-read.js`
- **Dependency direction** (strictly acyclic): `core` ← `intake`, `core` ← `audit`, `{audit, core}` ← `evidence`, all ← `commands`

## Public surface

The eight names re-exported from `index.ts`:

| Name | Kind | Owner |
|---|---|---|
| `DesignSystemAuditSeverity` | type | `core/types` |
| `DesignSystemAuditIssue` | interface | `core/types` |
| `DesignSystemPackageAudit` | interface | `core/types` |
| `scoreDesignFile` | function | `core/design-scoring` |
| `shouldSkipRepoPath` | function | `core/design-scoring` |
| `isTextSnapshotPath` | function | `core/design-scoring` |
| `auditDesignSystemPackage` | function | `audit/audit` |
| `runConnectorsToolCli` | function | `commands` |

## Known limitations

- **No barrel guard registered yet.** The `scripts/check-barrel-imports.ts` guard infrastructure is not on `main`; the acyclic layering is maintained by convention until a future PR registers `tools-connectors-cli` in `CAPABILITY_BARREL_DOMAINS` and wires it into `pnpm guard`.
- **`audit/audit.ts` is a candidate for a follow-up split.** The file contains one ~430-line entry function (`auditDesignSystemPackage`) alongside its inline validators. A future `audit-validators.ts` extraction would improve readability without changing the public surface.
