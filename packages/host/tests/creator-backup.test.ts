/**
 * Creator backup host-bridge tests.
 *
 * Covers the optional `creator` namespace on the Open Design host bridge:
 *  - `isOpenDesignHostBridge` accepts a bridge that exposes `creator.restoreBackup`
 *    and rejects one whose `creator` member is malformed.
 *  - `restoreCreatorBackup` delegates to `host.creator.restoreBackup` and maps the
 *    response, including the "host unavailable" and "creator unsupported" cases.
 */

import { describe, expect, it } from "vitest";

import {
  isCreatorBackupRestoreAvailable,
  isOpenDesignHostBridge,
  restoreCreatorBackup,
} from "../src/index.js";
import { createMockOpenDesignHost, installMockOpenDesignHost } from "../src/testing.js";
import type {
  CreatorBackupSummary,
  OpenDesignHostBridge,
  RestoreCreatorBackupResponse,
} from "../src/index.js";

const summaryFor = (backupId: string): CreatorBackupSummary => ({
  schemaVersion: 1,
  id: `creator-backup:${backupId}`,
  createdAt: "2026-07-17T00:00:00.000Z",
  profile: "full",
  projectIds: ["project-1"],
  fileCount: 2,
  totalSize: 100,
  status: "ready",
  validated: true,
});

describe("isOpenDesignHostBridge creator namespace", () => {
  it("accepts a bridge without a creator namespace", () => {
    expect(isOpenDesignHostBridge(createMockOpenDesignHost())).toBe(true);
  });

  it("accepts a bridge whose creator exposes restoreBackup", () => {
    const host = createMockOpenDesignHost({
      creator: { restoreBackup: async () => ({ ok: true, backup: summaryFor("bk-1") }) },
    });
    expect(isOpenDesignHostBridge(host)).toBe(true);
  });

  it("rejects a bridge whose creator member is not a function", () => {
    const host = createMockOpenDesignHost();
    // Intentionally malformed creator member.
    (host as { creator: unknown }).creator = { restoreBackup: 123 };
    expect(isOpenDesignHostBridge(host)).toBe(false);
  });

  it("rejects a bridge whose creator member is missing restoreBackup", () => {
    const candidate = createMockOpenDesignHost() as OpenDesignHostBridge;
    // Intentionally present-but-incomplete creator member (no restoreBackup).
    (candidate as { creator: unknown }).creator = {};
    expect(isOpenDesignHostBridge(candidate)).toBe(false);
  });
});

describe("restoreCreatorBackup host helper", () => {
  it("delegates to host.creator.restoreBackup and maps the success response", async () => {
    const restoreBackup = async (backupId: string): Promise<RestoreCreatorBackupResponse> => ({
      ok: true,
      backup: summaryFor(backupId),
    });
    const uninstall = installMockOpenDesignHost({ host: { creator: { restoreBackup } } });
    try {
      const response = await restoreCreatorBackup("bk-1");
      expect(response.ok).toBe(true);
      expect(response.backup?.id).toBe("creator-backup:bk-1");
    } finally {
      uninstall();
    }
  });

  it("passes through a failure response from the host", async () => {
    const restoreBackup = async (): Promise<RestoreCreatorBackupResponse> => ({ ok: false, error: "boom" });
    const uninstall = installMockOpenDesignHost({ host: { creator: { restoreBackup } } });
    try {
      const response = await restoreCreatorBackup("bk-1");
      expect(response.ok).toBe(false);
      expect(response.error).toBe("boom");
    } finally {
      uninstall();
    }
  });

  it("reports unsupported when the host has no creator bridge", async () => {
    const uninstall = installMockOpenDesignHost({ host: {} });
    try {
      const response = await restoreCreatorBackup("bk-1");
      expect(response.ok).toBe(false);
      expect(response.error).toContain("does not support");
    } finally {
      uninstall();
    }
  });

  it("reports unavailable when no host is installed", async () => {
    // No host installed: getOpenDesignHost() returns null.
    const response = await restoreCreatorBackup("bk-1");
    expect(response.ok).toBe(false);
    expect(response.error).toContain("not available");
  });
});

describe("isCreatorBackupRestoreAvailable (P2-1 capability gate)", () => {
  it("is true when the host bridge exposes creator.restoreBackup", () => {
    const uninstall = installMockOpenDesignHost({
      host: { creator: { restoreBackup: async () => ({ ok: true, backup: summaryFor("bk-1") }) } },
    });
    try {
      expect(isCreatorBackupRestoreAvailable()).toBe(true);
    } finally {
      uninstall();
    }
  });

  it("is false when the host is installed but has no creator namespace", () => {
    const uninstall = installMockOpenDesignHost({ host: {} });
    try {
      expect(isCreatorBackupRestoreAvailable()).toBe(false);
    } finally {
      uninstall();
    }
  });

  it("is false when no host is installed (plain web / dev build)", () => {
    expect(isCreatorBackupRestoreAvailable()).toBe(false);
  });
});
