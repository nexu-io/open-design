import { execFile } from "node:child_process";
import { chmod, mkdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

/** Oldest macOS the helper runs on (SFSpeechRecognizer punctuation needs 13). */
const MIN_MACOS = "13.0";

export const MAC_SPEECH_HELPER_RELATIVE_PATH = join("bin", "od-speech");

/**
 * Compile the Apple-native speech recognition helper (`od-speech`) into the
 * packaged resource tree. The desktop main process spawns it for voice
 * dictation (apps/desktop/src/main/speech-recognition.ts).
 *
 * The helper is optional: when no Swift toolchain is present the app still
 * builds, and dictation falls back to the browser / Whisper engines. A warning
 * is printed so a release build that loses the helper does not go unnoticed.
 */
export async function buildMacSpeechHelper(options: {
  resourceRoot: string;
  workspaceRoot: string;
}): Promise<boolean> {
  const sourceDir = join(options.workspaceRoot, "apps", "desktop", "native", "macos", "od-speech");
  const target = join(options.resourceRoot, MAC_SPEECH_HELPER_RELATIVE_PATH);
  const arch = process.arch === "arm64" ? "arm64" : "x86_64";
  await stat(join(sourceDir, "main.swift"));
  await mkdir(join(options.resourceRoot, "bin"), { recursive: true });
  try {
    await execFileAsync(
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
    await chmod(target, 0o755);
    return true;
  } catch (error) {
    console.warn(
      `[tools-pack mac] od-speech helper not built (Apple-native dictation disabled in this package): ${
        error instanceof Error ? error.message.split("\n")[0] : String(error)
      }`,
    );
    return false;
  }
}
