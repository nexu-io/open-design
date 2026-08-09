export const standaloneClosureDeliveryMatrix = {
  "schemaVersion": 1,
  "role": "test-only-acceptance-map",
  "architecture": {
    "activation": "launcher-committed-generation",
    "artifact": "standalone-closure",
    "body": "standalone(web+daemon)",
    "coordinates": [
      "channel",
      "namespace",
      "generation"
    ],
    "launcher": "standalone-launcher",
    "persistentTruthOwner": "standalone-launcher",
    "shellBoundary": "bootloader.mjs+handoff-once",
    "sidecarControl": "normalized-caller-owned",
    "sidecars": [
      "daemon",
      "web"
    ]
  },
  "acceptanceLevels": [
    "contract",
    "component",
    "local-real",
    "platform-product"
  ],
  "lanes": [
    {
      "id": "shell-shim",
      "owners": [
        "packages/standalone-proto",
        "apps/standalone",
        "shells/electron"
      ],
      "coordinates": [
        "channel",
        "namespace",
        "generation"
      ],
      "requiredOutcomes": [
        "min-version-or-handoff-once",
        "generation-bound-capability-result",
        "generation-bound-terminal-status",
        "no-store-or-body-layout-read-by-shell"
      ],
      "gates": [
        {
          "level": "contract",
          "state": "proven",
          "witness": "apps/standalone/tests/bootloader.test.ts"
        },
        {
          "level": "platform-product",
          "state": "proven",
          "credential": "https://github.com/nexu-io/open-design/actions/runs/31299133459",
          "witness": "e2e/specs/mac.spec.ts"
        }
      ],
      "evidence": [
        {
          "role": "boundary-proof",
          "path": "packages/standalone-proto/tests/index.test.ts"
        },
        {
          "role": "boundary-proof",
          "path": "apps/standalone/src/bootloader.ts"
        }
      ]
    },
    {
      "id": "local-debug",
      "owners": [
        "tools/dev",
        "apps/standalone"
      ],
      "coordinates": [
        "namespace",
        "generation"
      ],
      "requiredOutcomes": [
        "one-tools-dev-control-plane",
        "source-body-start-status-logs-stop",
        "namespace-isolated-cleanup",
        "no-release-publication-required"
      ],
      "gates": [
        {
          "level": "component",
          "state": "proven",
          "witness": "tools/dev/tests/sidecar-client.test.ts"
        },
        {
          "level": "local-real",
          "state": "planned"
        }
      ],
      "evidence": [
        {
          "role": "reusable-substrate",
          "path": "tools/dev/src/index.ts"
        },
        {
          "role": "reusable-substrate",
          "path": "apps/standalone/src/index.ts"
        }
      ]
    },
    {
      "id": "process-lifecycle",
      "owners": [
        "packages/standalone-runtime",
        "packages/sidecar",
        "apps/standalone"
      ],
      "coordinates": [
        "namespace",
        "generation"
      ],
      "requiredOutcomes": [
        "daemon-before-web-readiness",
        "web-before-daemon-shutdown",
        "partial-start-convergence",
        "requested-stop-versus-unexpected-failure"
      ],
      "gates": [
        {
          "level": "component",
          "state": "proven",
          "witness": "packages/standalone-runtime/tests/lifecycle.test.ts"
        },
        {
          "level": "local-real",
          "state": "proven",
          "witness": "e2e/tests/standalone-closure/normalized-sidecars.test.ts"
        },
        {
          "level": "platform-product",
          "state": "proven",
          "credential": "https://github.com/nexu-io/open-design/actions/runs/31299133459",
          "witness": "e2e/specs/mac.spec.ts"
        }
      ],
      "evidence": [
        {
          "role": "boundary-proof",
          "path": "apps/standalone/tests/bootloader.test.ts"
        },
        {
          "role": "boundary-proof",
          "path": "e2e/tests/standalone-closure/normalized-boundary.test.ts"
        }
      ]
    },
    {
      "id": "update-lifecycle",
      "owners": [
        "packages/closure-store",
        "packages/closure-update",
        "shells/electron"
      ],
      "coordinates": [
        "channel",
        "namespace",
        "generation"
      ],
      "requiredOutcomes": [
        "discover-trust-materialize-activate",
        "single-commit-and-fail-closed",
        "no-live-swap",
        "shell-min-version-before-body-download"
      ],
      "gates": [
        {
          "level": "component",
          "state": "proven",
          "witness": "packages/closure-update/tests/index.test.ts"
        },
        {
          "level": "platform-product",
          "state": "proven",
          "credential": "https://github.com/nexu-io/open-design/actions/runs/31299133459",
          "witness": "e2e/specs/mac.spec.ts"
        }
      ],
      "evidence": [
        {
          "role": "reusable-substrate",
          "path": "packages/closure-store/tests/index.test.ts"
        },
        {
          "role": "reusable-substrate",
          "path": "e2e/tests/packaged-closure-fixture.test.ts"
        }
      ]
    },
    {
      "id": "distribution",
      "owners": [
        "tools/pack",
        "tools/release"
      ],
      "coordinates": [
        "channel"
      ],
      "requiredOutcomes": [
        "namespace-neutral-platform-archive",
        "shell-and-closure-build-independence",
        "manifest-inventory-digest-consistency",
        "detached-manifest-signature-assets",
        "publish-false-release-storage-retrieval"
      ],
      "gates": [
        {
          "level": "component",
          "state": "proven",
          "witness": "tools/release/tests/closure-publication.test.ts"
        },
        {
          "level": "platform-product",
          "state": "proven",
          "credential": "https://github.com/nexu-io/open-design/actions/runs/31299133459",
          "witness": ".github/workflows/release-beta.yml"
        }
      ],
      "evidence": [
        {
          "role": "reusable-substrate",
          "path": ".github/workflows/release-beta.yml"
        },
        {
          "role": "reusable-substrate",
          "path": "tools/release/tests/closure-publication.test.ts"
        }
      ]
    },
    {
      "id": "local-e2e",
      "owners": [
        "e2e"
      ],
      "coordinates": [
        "channel",
        "namespace",
        "generation"
      ],
      "requiredOutcomes": [
        "real-shim-real-body",
        "local-release-source",
        "fresh-reuse-reject-reinstall-rollback",
        "exact-readiness-no-fixed-sleep"
      ],
      "gates": [
        {
          "level": "local-real",
          "state": "planned"
        },
        {
          "level": "platform-product",
          "state": "proven",
          "credential": "https://github.com/nexu-io/open-design/actions/runs/31299133459",
          "witness": "e2e/specs/mac.spec.ts"
        }
      ],
      "evidence": [
        {
          "role": "reusable-substrate",
          "path": "e2e/lib/vitest/packaged-closure-fixture.ts"
        },
        {
          "role": "legacy-product-reference",
          "path": "e2e/specs/mac.spec.ts"
        },
        {
          "role": "legacy-product-reference",
          "path": "e2e/specs/win.spec.ts"
        }
      ]
    },
    {
      "id": "windows-installer",
      "owners": [
        "tools/pack",
        "shells/electron",
        "e2e"
      ],
      "coordinates": [
        "channel",
        "namespace"
      ],
      "requiredOutcomes": [
        "namespace-scoped-product-identity",
        "stop-before-overwrite",
        "min-version-installer-reinstall",
        "cold-start-and-clean-uninstall"
      ],
      "gates": [
        {
          "level": "component",
          "state": "proven",
          "witness": "e2e/tests/packaged-win-identity.test.ts"
        },
        {
          "level": "platform-product",
          "state": "planned"
        }
      ],
      "evidence": [
        {
          "role": "reusable-substrate",
          "path": "e2e/tests/packaged-win-identity.test.ts"
        },
        {
          "role": "reusable-substrate",
          "path": "e2e/tests/win-installer-log.test.ts"
        },
        {
          "role": "legacy-product-reference",
          "path": "e2e/specs/win.spec.ts"
        }
      ]
    }
  ],
  "tasks": [
    {
      "id": "SC-01",
      "delivery": "next-release",
      "track": "closure",
      "outcome": "The archive exposes bootloader.mjs, enters one committed generation once, and owns Web plus daemon startup, health, and shutdown through normalized sidecars.",
      "dependsOn": [],
      "lanes": [
        "process-lifecycle"
      ],
      "ownerPaths": [
        "apps/standalone",
        "tools/pack"
      ]
    },
    {
      "id": "SC-02",
      "delivery": "next-release",
      "track": "launcher",
      "outcome": "The launcher owns release source, trust, lazy materialization, committed-generation activation, and minVersion escalation without moving update policy into bootloader.mjs.",
      "dependsOn": [],
      "lanes": [
        "update-lifecycle"
      ],
      "ownerPaths": [
        "shells/electron",
        "packages/closure-update"
      ]
    },
    {
      "id": "SC-03",
      "delivery": "next-release",
      "track": "shell",
      "outcome": "The packaged shell resolves one committed bootloader.mjs, invokes handoff once, and maps generation-bound capability and terminal results to shell UX.",
      "dependsOn": [
        "SC-01",
        "SC-02"
      ],
      "lanes": [
        "shell-shim"
      ],
      "ownerPaths": [
        "shells/electron"
      ]
    },
    {
      "id": "SC-04",
      "delivery": "next-release",
      "track": "developer-experience",
      "outcome": "tools-dev controls a source Standalone as one namespace-scoped product with start, status, logs, stop, and cleanup.",
      "dependsOn": [
        "SC-01"
      ],
      "lanes": [
        "local-debug"
      ],
      "ownerPaths": [
        "tools/dev"
      ]
    },
    {
      "id": "SC-05",
      "delivery": "next-release",
      "track": "integration",
      "outcome": "A deterministic local source drives the real shim and real body through the complete lifecycle trace without publication.",
      "dependsOn": [
        "SC-01",
        "SC-02",
        "SC-03",
        "SC-04"
      ],
      "lanes": [
        "local-e2e"
      ],
      "ownerPaths": [
        "e2e"
      ]
    },
    {
      "id": "SC-06",
      "delivery": "next-release",
      "track": "distribution",
      "outcome": "Release beta signs the canonical manifest, stores and resolves Closure independently from shell artifacts, and supports publish=false QA retrieval.",
      "dependsOn": [
        "SC-01",
        "SC-02"
      ],
      "lanes": [
        "distribution"
      ],
      "ownerPaths": [
        "tools/pack",
        "tools/release"
      ]
    },
    {
      "id": "SC-07",
      "delivery": "next-release",
      "track": "mac-product",
      "outcome": "The installed macOS shell passes cold start, reuse, reinstall, failure presentation, and rollback through the new seam.",
      "dependsOn": [
        "SC-03",
        "SC-05",
        "SC-06"
      ],
      "lanes": [
        "shell-shim",
        "local-e2e"
      ],
      "ownerPaths": [
        "e2e"
      ]
    },
    {
      "id": "SC-08",
      "delivery": "next-release",
      "track": "windows-installer",
      "outcome": "The Windows installer preserves namespace identity, stops the owning shell, and fulfills shim-requested min-version reinstall.",
      "dependsOn": [
        "SC-03",
        "SC-06"
      ],
      "lanes": [
        "windows-installer"
      ],
      "ownerPaths": [
        "tools/pack",
        "shells/electron"
      ]
    },
    {
      "id": "SC-09",
      "delivery": "next-release",
      "track": "windows-product",
      "outcome": "The installed Windows shell passes cold start, reuse, reinstall, failure presentation, rollback, and clean uninstall through the new seam.",
      "dependsOn": [
        "SC-05",
        "SC-08"
      ],
      "lanes": [
        "local-e2e",
        "windows-installer"
      ],
      "ownerPaths": [
        "e2e"
      ]
    },
    {
      "id": "SC-10",
      "delivery": "next-release",
      "track": "cutover",
      "outcome": "The release raises shell minVersion only after macOS and Windows mixed-generation acceptance proves the new seam reachable.",
      "dependsOn": [
        "SC-07",
        "SC-09"
      ],
      "lanes": [
        "shell-shim",
        "update-lifecycle",
        "distribution"
      ],
      "ownerPaths": [
        "tools/release",
        "e2e"
      ]
    }
  ]
} as const;
