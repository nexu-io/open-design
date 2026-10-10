/** Derive Task object state from every physical Run, including late upload receipts. */
export function taskObjectMetadata(runs: Record<string, unknown>[]) {
  const record = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
  const list = (run: Record<string, unknown>, key: string) => Array.isArray(run[key]) ? (run[key] as unknown[]).map(record) : [];
  const artifacts = runs.flatMap(run => list(run, 'artifact_manifest'));
  const entries = runs.flatMap(run => ['artifact_manifest', 'attachment_manifest', 'input_text_snapshot_manifest'].flatMap(key => list(run, key)));
  const summaries = runs.map(run => record(run.trace_object_summary));
  const count = (key: string) => summaries.reduce((total, summary) => total + (typeof summary[key] === 'number' && Number.isFinite(summary[key]) ? summary[key] as number : 0), 0);
  const candidateCount = Math.max(artifacts.length, count('candidate_file_count'));
  const reasons: Record<string, number> = {};
  let uploaded = 0;
  for (const entry of artifacts) {
    if (entry.status === 'ok' && entry.stored_in_open_design === true) uploaded++;
    else {
      const reason = typeof entry.reason === 'string' ? entry.reason : typeof entry.status === 'string' ? entry.status : 'unavailable';
      reasons[reason] = (reasons[reason] ?? 0) + 1;
    }
  }
  const missing = Math.max(0, candidateCount - artifacts.length);
  if (missing) reasons.object_upload_unavailable = (reasons.object_upload_unavailable ?? 0) + missing;
  const unavailable = missing > 0 || entries.some(entry => !['ok', 'partial'].includes(String(entry.status))) || runs.some(run => run.manifest_completeness === 'unavailable');
  const partial = entries.some(entry => entry.status !== 'ok') || runs.some(run => run.manifest_completeness === 'partial');
  return {
    manifest_completeness: unavailable ? 'unavailable' : partial ? 'partial' : entries.length || (runs.length > 0 && runs.every(run => run.manifest_completeness === 'complete')) ? 'complete' : 'unavailable',
    trace_object_summary: {
      new_file_count: count('new_file_count'), modified_file_count: count('modified_file_count'), recovered_file_count: count('recovered_file_count'),
      candidate_file_count: candidateCount, uploaded_file_count: uploaded,
      skipped_file_count: artifacts.length - uploaded + missing, skip_reasons: reasons,
    },
  };
}
