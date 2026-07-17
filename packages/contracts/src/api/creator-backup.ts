/**
 * Creator backup / restore contracts.
 *
 * Backups are manual, local, versioned snapshots of Creator-managed metadata
 * (workbench, media index, content, release, performance) plus the minimal
 * project-identity data needed to re-establish the Creator project association
 * after a restore. They deliberately exclude raw user assets (photos / video /
 * audio / source material), caches, logs, credentials and any install/update
 * payload.
 *
 * Restore is NEVER exposed as a daemon HTTP route. It is orchestrated only by
 * the packaged desktop main process through a fixed-parameter capability; the
 * web/renderer side may only invoke it through the controlled host bridge.
 */

/** Current manifest schema version. Bump on any breaking change to the format. */
export const CREATOR_BACKUP_SCHEMA_VERSION = 1 as const;
export type CreatorBackupSchemaVersion = number;

/** What a snapshot covers. `full` captures all Creator-managed metadata. */
export type CreatorBackupProfile = 'full';

/** Lifecycle state of a backup snapshot. */
export type CreatorBackupStatus =
  | 'pending' // created in a temp dir, not yet committed/validated
  | 'ready' // committed and hash-verified
  | 'invalid' // manifest missing/corrupt or a file hash mismatch
  | 'restoring' // (packaged) currently being restored
  | 'rollback'; // (packaged) pre-restore safety snapshot

/** A single backed-up file entry. */
export interface CreatorBackupFile {
  /** Path relative to the backup payload root. Forward slashes, never absolute, never `..`. */
  relativePath: string;
  /** Byte size of the file at backup time. */
  size: number;
  /** Lowercase hex SHA-256 of the file contents at backup time. */
  sha256: string;
}

/** Manifest stored at the root of every backup snapshot. */
export interface CreatorBackupManifest {
  schemaVersion: CreatorBackupSchemaVersion;
  /** Server-generated backup id (`creator-backup:<uuid>`). */
  id: string;
  /** ISO-8601 creation timestamp. */
  createdAt: string;
  /** App version at backup time, when available. */
  appVersion?: string;
  /** Controlled namespace the backup lives under (never an absolute user path). */
  namespace: string;
  profile: CreatorBackupProfile;
  /** Project ids whose Creator metadata this snapshot covers (minimal identity reference). */
  projectIds: string[];
  files: CreatorBackupFile[];
  /** Total number of files in the snapshot. */
  fileCount: number;
  /** Total byte size of all files in the snapshot. */
  totalSize: number;
  status: CreatorBackupStatus;
  /** Optional human note supplied at creation time. */
  note?: string;
}

/** Compact summary used in listing UIs (no per-file detail). */
export interface CreatorBackupSummary {
  schemaVersion: CreatorBackupSchemaVersion;
  id: string;
  createdAt: string;
  profile: CreatorBackupProfile;
  projectIds: string[];
  fileCount: number;
  totalSize: number;
  status: CreatorBackupStatus;
  /** Whether the manifest and all file hashes verified on the last validation. */
  validated?: boolean;
}

/** Result of validating a backup snapshot against its manifest. */
export interface CreatorBackupValidationResult {
  id: string;
  valid: boolean;
  /** Human-readable reasons the snapshot is invalid (empty when valid). */
  issues: string[];
  fileCount: number;
  totalSize: number;
}

/** Envelope for create/restore operations. */
export interface CreatorBackupOperationResult {
  ok: boolean;
  backup?: CreatorBackupManifest;
  /** Present and set when `ok` is false. */
  error?: string;
}

// ---- Daemon local HTTP API: list / create / validate (no restore route) ----

export interface ListCreatorBackupsResponse {
  backups: CreatorBackupSummary[];
}

export interface CreateCreatorBackupRequest {
  note?: string;
  profile?: CreatorBackupProfile;
}

export interface CreateCreatorBackupResponse {
  backup: CreatorBackupManifest;
}

export interface ValidateCreatorBackupRequest {
  backupId: string;
}

export interface ValidateCreatorBackupResponse extends CreatorBackupValidationResult {}

// ---- Desktop capability types (packaged main-process restore only) ----

/** Input to the packaged `restoreCreatorBackup` capability. Only the id is accepted;
 *  source/target paths are always derived server-side and never supplied by the caller. */
export interface RestoreCreatorBackupRequest {
  backupId: string;
}

export interface RestoreCreatorBackupResponse {
  ok: boolean;
  backup?: CreatorBackupSummary;
  error?: string;
}
