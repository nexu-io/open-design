/**
 * Web Worker that runs Whisper locally (ONNX runtime, WebAssembly) so dictation
 * works where the browser's built-in speech recognition does not — notably the
 * Electron desktop app, whose Web Speech API has no recognition backend.
 *
 * Protocol (main thread ⇄ worker):
 *   → { id, audio: Float32Array (mono, 16 kHz), language: string }
 *   ← { type: 'status', id, status: 'loading-model' | 'transcribing' }
 *   ← { type: 'result', id, text }
 *   ← { type: 'error', id, message }
 *
 * The model is downloaded once on first use and then served from the browser
 * cache; the audio itself never leaves the machine.
 */
import { env, pipeline } from '@huggingface/transformers';

// Multilingual Whisper, 8-bit quantized: a good accuracy/size trade-off
// (~80 MB) for short dictation clips.
const MODEL_ID = 'onnx-community/whisper-base';

type Transcriber = (
  audio: Float32Array,
  options: Record<string, unknown>,
) => Promise<{ text: string } | Array<{ text: string }>>;

interface WorkerScope {
  postMessage: (message: unknown) => void;
  onmessage: ((event: MessageEvent) => void) | null;
}
const ctx = self as unknown as WorkerScope;

env.allowLocalModels = false;

let transcriberPromise: Promise<Transcriber> | null = null;
let activeDevice: 'webgpu' | 'wasm' = 'wasm';

function loadTranscriber(): Promise<Transcriber> {
  if (!transcriberPromise) {
    transcriberPromise = createTranscriber();
    // A failed download must not poison every later attempt.
    transcriberPromise.catch(() => {
      transcriberPromise = null;
    });
  }
  return transcriberPromise;
}

/** WebGPU when the runtime offers it (several times faster), else WebAssembly. */
async function createTranscriber(): Promise<Transcriber> {
  const hasWebGpu = typeof (self as unknown as { navigator?: { gpu?: unknown } }).navigator?.gpu !== 'undefined';
  if (hasWebGpu) {
    try {
      const t = (await pipeline('automatic-speech-recognition', MODEL_ID, {
        device: 'webgpu',
        dtype: { encoder_model: 'fp32', decoder_model_merged: 'q4' },
      })) as unknown as Transcriber;
      activeDevice = 'webgpu';
      return t;
    } catch {
      // fall through to the WebAssembly build
    }
  }
  activeDevice = 'wasm';
  return (await pipeline('automatic-speech-recognition', MODEL_ID, {
    dtype: 'q8',
    device: 'wasm',
  })) as unknown as Transcriber;
}

// Jobs run one at a time: a single ONNX session must not be entered twice at
// once, and live (interim) jobs may overlap the final one.
let queue: Promise<void> = Promise.resolve();
ctx.onmessage = (event: MessageEvent) => {
  queue = queue.then(() => handle(event.data));
};

async function handle(data: unknown): Promise<void> {
  const { id, audio, language } = data as {
    id: number;
    audio: Float32Array;
    language: string;
  };
  try {
    ctx.postMessage({ type: 'status', id, status: 'loading-model' });
    const transcriber = await loadTranscriber();
    ctx.postMessage({ type: 'status', id, status: 'transcribing' });
    const output = await transcriber(audio, {
      language,
      task: 'transcribe',
      chunk_length_s: 30,
    });
    const text = Array.isArray(output) ? output.map((o) => o.text).join(' ') : output.text;
    ctx.postMessage({ type: 'result', id, text: text.trim(), device: activeDevice });
  } catch (error) {
    ctx.postMessage({
      type: 'error',
      id,
      message: error instanceof Error ? error.message : String(error),
    });
  }
}
