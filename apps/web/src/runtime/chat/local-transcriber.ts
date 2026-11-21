/**
 * Main-thread side of local (Whisper) dictation: record the microphone, decode it
 * to the mono 16 kHz samples Whisper expects, and hand it to the worker.
 */

export type LocalTranscribeStatus = 'loading-model' | 'transcribing';

/** Whisper language code for a UI locale, e.g. `zh-TW` → `zh`, `pt-BR` → `pt`. */
export function whisperLanguageForLocale(locale: string): string {
  return locale.split('-')[0]!.toLowerCase();
}

export function isLocalTranscriptionSupported(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof Worker !== 'undefined' &&
    typeof AudioWorkletNode !== 'undefined' &&
    typeof navigator !== 'undefined' &&
    !!navigator.mediaDevices?.getUserMedia
  );
}

/** Electron's Web Speech API has no recognition backend, so prefer local there. */
export function isElectronRuntime(): boolean {
  return typeof navigator !== 'undefined' && /\bElectron\//.test(navigator.userAgent);
}

export interface MicRecording {
  /** Mono 16 kHz samples recorded so far; recording continues. */
  snapshot: () => Float32Array;
  /** Stop recording and resolve with everything recorded. */
  stop: () => Promise<Float32Array>;
  /** Stop recording and discard everything. */
  cancel: () => void;
}

// Runs on the audio thread; forwards each 128-sample block to the main thread.
const CAPTURE_PROCESSOR = `
class OdPcmCapture extends AudioWorkletProcessor {
  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel) this.port.postMessage(channel.slice());
    return true;
  }
}
registerProcessor('od-pcm-capture', OdPcmCapture);
`;

function concat(chunks: Float32Array[], total: number): Float32Array {
  const out = new Float32Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

export async function startMicRecording(): Promise<MicRecording> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
  });
  const context = new AudioContext({ sampleRate: 16000 });
  const releaseAll = () => {
    stream.getTracks().forEach((track) => track.stop());
    void context.close();
  };
  try {
    const moduleUrl = URL.createObjectURL(
      new Blob([CAPTURE_PROCESSOR], { type: 'application/javascript' }),
    );
    try {
      await context.audioWorklet.addModule(moduleUrl);
    } finally {
      URL.revokeObjectURL(moduleUrl);
    }
    await context.resume();
    const source = context.createMediaStreamSource(stream);
    const node = new AudioWorkletNode(context, 'od-pcm-capture');
    const chunks: Float32Array[] = [];
    let total = 0;
    node.port.onmessage = (event: MessageEvent<Float32Array>) => {
      chunks.push(event.data);
      total += event.data.length;
    };
    // A graph is only pulled when it reaches the destination; keep it silent.
    const mute = context.createGain();
    mute.gain.value = 0;
    source.connect(node);
    node.connect(mute);
    mute.connect(context.destination);

    return {
      snapshot: () => concat(chunks, total),
      stop: async () => {
        const audio = concat(chunks, total);
        releaseAll();
        return audio;
      },
      cancel: releaseAll,
    };
  } catch (error) {
    releaseAll();
    throw error;
  }
}

let worker: Worker | null = null;
let nextId = 1;

function getWorker(): Worker {
  if (!worker) {
    worker = new Worker(new URL('./local-transcriber.worker.ts', import.meta.url), {
      type: 'module',
    });
  }
  return worker;
}

export function transcribeLocally(
  audio: Float32Array,
  language: string,
  onStatus?: (status: LocalTranscribeStatus) => void,
): Promise<string> {
  const id = nextId++;
  const w = getWorker();
  return new Promise<string>((resolve, reject) => {
    const onMessage = (event: MessageEvent) => {
      const message = event.data as
        | { type: 'status'; id: number; status: LocalTranscribeStatus }
        | { type: 'result'; id: number; text: string; device?: string }
        | { type: 'error'; id: number; message: string };
      if (message.id !== id) return;
      if (message.type === 'status') {
        onStatus?.(message.status);
        return;
      }
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      if (message.type === 'result') resolve(message.text);
      else reject(new Error(message.message));
    };
    const onError = (event: ErrorEvent) => {
      w.removeEventListener('message', onMessage);
      w.removeEventListener('error', onError);
      // A crashed worker (e.g. failed wasm load) must be recreated next time.
      worker = null;
      reject(new Error(event.message || 'worker-error'));
    };
    w.addEventListener('message', onMessage);
    w.addEventListener('error', onError);
    w.postMessage({ id, audio, language }, [audio.buffer]);
  });
}
