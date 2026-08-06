export const headlessClosureDeliveryMatrix = {
  "schemaVersion": 1,
  "role": "test-only-acceptance-map",
  "architecture": {
    "activation": "next-launch",
    "body": "web+daemon",
    "coordinates": [
      "channel",
      "namespace",
      "generation"
    ],
    "persistentTruthOwner": "closure",
    "shellBoundary": "ensure+handoff"
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
        "packages/closure-proto",
        "packages/closure-shim"
      ],
      "coordinates": [
        "channel",
        "namespace",
        "generation"
      ],
      "requiredOutcomes": [
        "ready-or-installer-reinstall",
        "generation-bound-capability-result",
        "generation-bound-terminal-status",
        "no-store-or-body-layout-read-by-shell"
      ],
      "gates": [
        {
          "level": "contract",
          "state": "proven",
          "witness": "packages/closure-shim/tests/shell-conformance.test.ts"
        },
        {
          "level": "platform-product",
          "state": "planned"
        }
      ],
      "evidence": [
        {
          "role": "boundary-proof",
          "path": "packages/closure-shim/tests/conformance.test.ts"
        },
        {
          "role": "boundary-proof",
          "path": "packages/closure-proto/fixtures/shell-capability-request-v1.json"
        }
      ]
    },
    {
      "id": "local-debug",
      "owners": [
        "tools/dev",
        "apps/headless"
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
          "path": "apps/headless/src/index.ts"
        }
      ]
    },
    {
      "id": "process-lifecycle",
      "owners": [
        "packages/headless-runtime",
        "packages/closure-shim"
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
          "witness": "packages/headless-runtime/tests/lifecycle.test.ts"
        },
        {
          "level": "local-real",
          "state": "proven",
          "witness": "packages/closure-shim/tests/conformance.test.ts"
        },
        {
          "level": "platform-product",
          "state": "planned"
        }
      ],
      "evidence": [
        {
          "role": "boundary-proof",
          "path": "packages/closure-proto/fixtures/runtime-running-v1.json"
        },
        {
          "role": "boundary-proof",
          "path": "packages/closure-proto/fixtures/runtime-failed-v1.json"
        }
      ]
    },
    {
      "id": "update-lifecycle",
      "owners": [
        "packages/closure-store",
        "packages/closure-update",
        "packages/closure-shim"
      ],
      "coordinates": [
        "channel",
        "namespace",
        "generation"
      ],
      "requiredOutcomes": [
        "discover-trust-materialize-activate",
        "confirm-or-bounded-rollback",
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
          "level": "local-real",
          "state": "proven",
          "witness": "packages/closure-shim/tests/conformance.test.ts"
        },
        {
          "level": "platform-product",
          "state": "planned"
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
        "signed-manifest-and-inventory",
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
          "state": "planned"
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
          "state": "planned"
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
        "apps/packaged",
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
      "id": "HC-01",
      "delivery": "next-release",
      "track": "closure",
      "outcome": "The archived body exports the handoff entry and owns Web plus daemon startup, health, and shutdown.",
      "dependsOn": [],
      "lanes": [
        "process-lifecycle"
      ],
      "ownerPaths": [
        "apps/headless",
        "tools/pack"
      ]
    },
    {
      "id": "HC-02",
      "delivery": "next-release",
      "track": "closure",
      "outcome": "The shim discovers one signed candidate and owns trust, Store selection, activation, confirmation, and rollback.",
      "dependsOn": [],
      "lanes": [
        "update-lifecycle"
      ],
      "ownerPaths": [
        "packages/closure-shim",
        "packages/closure-update"
      ]
    },
    {
      "id": "HC-03",
      "delivery": "next-release",
      "track": "shell",
      "outcome": "The packaged shell invokes only ensure plus handoff and maps capability, terminal, and installer-reinstall results to shell UX.",
      "dependsOn": [],
      "lanes": [
        "shell-shim"
      ],
      "ownerPaths": [
        "apps/packaged"
      ]
    },
    {
      "id": "HC-04",
      "delivery": "next-release",
      "track": "developer-experience",
      "outcome": "tools-dev controls a source Closure as one namespace-scoped product with start, status, logs, stop, and cleanup.",
      "dependsOn": [
        "HC-01"
      ],
      "lanes": [
        "local-debug"
      ],
      "ownerPaths": [
        "tools/dev"
      ]
    },
    {
      "id": "HC-05",
      "delivery": "next-release",
      "track": "integration",
      "outcome": "A deterministic local source drives the real shim and real body through the complete lifecycle trace without publication.",
      "dependsOn": [
        "HC-01",
        "HC-02",
        "HC-03",
        "HC-04"
      ],
      "lanes": [
        "local-e2e"
      ],
      "ownerPaths": [
        "e2e"
      ]
    },
    {
      "id": "HC-06",
      "delivery": "next-release",
      "track": "distribution",
      "outcome": "Release beta builds, signs, stores, and resolves Closure independently from shell artifacts, including publish=false QA retrieval.",
      "dependsOn": [
        "HC-01",
        "HC-02"
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
      "id": "HC-07",
      "delivery": "next-release",
      "track": "mac-product",
      "outcome": "The installed macOS shell passes cold start, reuse, reinstall, failure presentation, and rollback through the new seam.",
      "dependsOn": [
        "HC-03",
        "HC-05",
        "HC-06"
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
      "id": "HC-08",
      "delivery": "next-release",
      "track": "windows-installer",
      "outcome": "The Windows installer preserves namespace identity, stops the owning shell, and fulfills shim-requested min-version reinstall.",
      "dependsOn": [
        "HC-03",
        "HC-06"
      ],
      "lanes": [
        "windows-installer"
      ],
      "ownerPaths": [
        "tools/pack",
        "apps/packaged"
      ]
    },
    {
      "id": "HC-09",
      "delivery": "next-release",
      "track": "windows-product",
      "outcome": "The installed Windows shell passes cold start, reuse, reinstall, failure presentation, rollback, and clean uninstall through the new seam.",
      "dependsOn": [
        "HC-05",
        "HC-08"
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
      "id": "HC-10",
      "delivery": "next-release",
      "track": "cutover",
      "outcome": "The release raises shell minVersion only after macOS and Windows mixed-generation acceptance proves the new seam reachable.",
      "dependsOn": [
        "HC-07",
        "HC-09"
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
    },
    {
      "id": "HC-11",
      "delivery": "later-retirement",
      "track": "cleanup",
      "outcome": "The historical combined-payload selector is removed after the compatibility observation window closes.",
      "dependsOn": [
        "HC-10"
      ],
      "lanes": [
        "shell-shim",
        "update-lifecycle"
      ],
      "ownerPaths": [
        "apps/packaged"
      ]
    }
  ]
} as const;
