// Shared `file_upload_result` cohort derivation.
//
// Three surfaces fire `file_upload_result`:
//   1. Design Files Upload button on the project page (`file_manager`)
//   2. Chat composer paperclip on the project page (`chat_panel`)
//   3. Home composer paperclip (`home`)
//
// All three share the same cohort math: total bytes for the size bucket,
// per-file mime → TrackingFileType, mixed batches collapsed to `'other'`
// so the dashboard breakdown stays interpretable. Earlier, only the
// `file_manager` surface emitted; the other two were silent. Extracting
// the math keeps the three call sites one-liners and prevents drift.

import type {
  TrackingFileSizeBucket,
  TrackingFileType,
} from '@open-design/contracts/analytics';
import {
  fileSizeBucketToTracking,
  fileTypeToTracking,
} from '@open-design/contracts/analytics';

export interface UploadCohort {
  file_count: number;
  file_type: TrackingFileType;
  file_size_bucket: TrackingFileSizeBucket;
}

export function deriveUploadCohort(files: File[]): UploadCohort {
  const totalBytes = files.reduce((sum, file) => sum + (file.size || 0), 0);
  const perFileTrackingTypes = files.map((file) => {
    const mime = file.type ?? '';
    const name = file.name ?? '';
    const isZip =
      mime === 'application/zip' || name.toLowerCase().endsWith('.zip');
    return fileTypeToTracking({ mime, isFolder: false, isZip });
  });
  const uniqueTrackingTypes = new Set(perFileTrackingTypes);
  const file_type: TrackingFileType =
    uniqueTrackingTypes.size <= 1
      ? perFileTrackingTypes[0] ?? 'other'
      : 'other';
  return {
    file_count: files.length,
    file_type,
    file_size_bucket: fileSizeBucketToTracking(totalBytes),
  };
}
