export type ExportExpectation = {
  width: number;
  height: number;
  fps: number;
  duration: number;
  audio: 'required' | 'silent' | 'optional';
};

export function validateExportExpectation(value: ExportExpectation): ExportExpectation {
  if (!value || !Number.isSafeInteger(value.width) || value.width < 1 ||
      !Number.isSafeInteger(value.height) || value.height < 1 ||
      !Number.isFinite(value.fps) || value.fps < 1 || value.fps > 240 ||
      !Number.isFinite(value.duration) || value.duration <= 0 ||
      !['required', 'silent', 'optional'].includes(value.audio)) {
    throw new Error('Expected export specification needs positive dimensions/duration, fps from 1 to 240, and audio required, silent or optional.');
  }
  return { width: value.width, height: value.height, fps: value.fps, duration: value.duration, audio: value.audio };
}
