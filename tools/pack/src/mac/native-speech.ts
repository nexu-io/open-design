import { execFile } from "node:child_process";
import { chmod, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Oldest macOS the helper runs on (SFSpeechRecognizer punctuation needs 13). */
const MIN_MACOS = "13.0";

export const MAC_SPEECH_HELPER_RELATIVE_PATH = join("bin", "od-speech");

export type NativeSpeechExec = (
  file: string,
  args: readonly string[],
  options?: { maxBuffer?: number },
) => Promise<unknown>;

/**
 * Compile the Apple-native speech recognition helper (`od-speech`) into the
 * packaged resource tree. The desktop main process spawns it for voice
 * dictation (apps/desktop/src/main/speech-recognition.ts).
 *
 * Only an **unavailable Swift toolchain** skips the helper: the app still
 * builds, dictation falls back to the browser / Whisper engines, and a warning
 * is printed. Once a toolchain is present, any other failure (compiler, SDK or
 * source error) is a real build failure and is rethrown, so a release cannot
 * silently lose Apple-native dictation.
 */
export async function buildMacSpeechHelper(options: {
  resourceRoot: string;
  workspaceRoot: string;
  /** Test seam; defaults to `child_process.execFile`. */
  exec?: NativeSpeechExec;
}): Promise<boolean> {
  const exec: NativeSpeechExec =
    options.exec ?? ((file, args, execOptions) => execFileAsync(file, [...args], execOptions));
  const sourceDir = join(options.workspaceRoot, "apps", "desktop", "native", "macos", "od-speech");
  const target = join(options.resourceRoot, MAC_SPEECH_HELPER_RELATIVE_PATH);
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  await stat(join(sourceDir, "main.swift"));
  await mkdir(join(options.resourceRoot, "bin"), { recursive: true });

  try {
    await exec("xcrun", ["--find", "swiftc"]);
  } catch (error) {
    console.warn(
      `[tools-pack mac] Swift toolchain not found; od-speech helper not built (Apple-native dictation disabled in this package): ${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }`,
    );
    return false;
  }

  try {
    await exec(
      "xcrun",
      [
        "swiftc",
        "-O",
        "-swift-version",
        "5",
        "-target",
        `${arch}-apple-macos${MIN_MACOS}`,
        "-o",
        target,
        join(sourceDir, "main.swift"),
        // Embed the usage descriptions so the helper has its own privacy identity.
        "-Xlinker",
        "-sectcreate",
        "-Xlinker",
        "__TEXT",
        "-Xlinker",
        "__info_plist",
        "-Xlinker",
        join(sourceDir, "Info.plist"),
      ],
      { maxBuffer: 16 * 1024 * 1024 },
    );
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(`[tools-pack mac] failed to compile the od-speech helper: ${detail}`, {
      cause: error,
    });
  }
  await chmod(target, 0o755);
  return true;
}
