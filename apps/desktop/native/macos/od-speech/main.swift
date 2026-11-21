// od-speech — Apple-native streaming speech recognition for Open Design's
// voice dictation (macOS only).
//
// Uses Apple's Speech framework (SFSpeechRecognizer) with live microphone input
// from AVAudioEngine, preferring on-device recognition. It is a small helper
// process: the desktop main process spawns it, reads newline-delimited JSON from
// stdout, and asks it to finish by writing "stop" (or closing stdin).
//
// Usage:  od-speech --locale <BCP-47 or language code, e.g. de, de-DE, en-US>
//
// Output events (one JSON object per line on stdout):
//   {"type":"ready","locale":"de-DE","onDevice":true}
//   {"type":"partial","text":"…"}   cumulative text so far, may still change
//   {"type":"final","text":"…"}     cumulative text, emitted once after "stop"
//   {"type":"error","code":"…","message":"…"}
// Error codes: speech-denied, mic-denied, locale-unsupported, recognizer-unavailable,
//              audio-engine-failed, recognition-failed.
// Exit status: 0 on a clean stop, 2 on an error that ended the session.

import AVFoundation
import Foundation
import Speech

// MARK: - Output

let stdoutLock = NSLock()

func emit(_ object: [String: Any]) {
    guard let data = try? JSONSerialization.data(withJSONObject: object),
        var line = String(data: data, encoding: .utf8)
    else { return }
    line.append("\n")
    stdoutLock.lock()
    FileHandle.standardOutput.write(Data(line.utf8))
    stdoutLock.unlock()
}

func fail(_ code: String, _ message: String) -> Never {
    emit(["type": "error", "code": code, "message": message])
    exit(2)
}

// MARK: - Arguments

func argumentValue(_ name: String) -> String? {
    let args = CommandLine.arguments
    guard let index = args.firstIndex(of: name), index + 1 < args.count else { return nil }
    return args[index + 1]
}

/// Resolve a UI locale ("de", "pt-BR", "zh_TW") to a locale Apple can recognize.
func resolveLocale(_ requested: String) -> Locale? {
    let wanted = requested.replacingOccurrences(of: "_", with: "-")
    let supported = SFSpeechRecognizer.supportedLocales()
    if let exact = supported.first(where: {
        $0.identifier.replacingOccurrences(of: "_", with: "-").caseInsensitiveCompare(wanted)
            == .orderedSame
    }) {
        return exact
    }
    let language = wanted.split(separator: "-").first.map(String.init)?.lowercased() ?? wanted
    return supported.first(where: { $0.language.languageCode?.identifier == language })
}

// MARK: - Session

final class Session {
    private let recognizer: SFSpeechRecognizer
    private let engine = AVAudioEngine()
    private let queue = DispatchQueue(label: "od-speech.session")
    private var request: SFSpeechAudioBufferRecognitionRequest?
    private var task: SFSpeechRecognitionTask?
    // Text of tasks that already finished. Apple limits one task to about a
    // minute, so a long dictation is stitched together from several tasks.
    private var committed = ""
    private var current = ""
    private var stopping = false
    private var finished = false
    private var rapidFailures = 0
    private var taskStartedAt = Date()
    private let onDevice: Bool

    init(recognizer: SFSpeechRecognizer) {
        self.recognizer = recognizer
        self.onDevice = recognizer.supportsOnDeviceRecognition
    }

    var isOnDevice: Bool { onDevice }

    func start() throws {
        queue.sync { startTask() }
        let input = engine.inputNode
        let format = input.outputFormat(forBus: 0)
        input.installTap(onBus: 0, bufferSize: 1024, format: format) { [weak self] buffer, _ in
            self?.queue.async { self?.request?.append(buffer) }
        }
        engine.prepare()
        try engine.start()
    }

    private func combined() -> String {
        [committed, current].filter { !$0.isEmpty }.joined(separator: " ")
    }

    private func startTask() {
        let request = SFSpeechAudioBufferRecognitionRequest()
        request.shouldReportPartialResults = true
        request.requiresOnDeviceRecognition = onDevice
        request.addsPunctuation = true
        self.request = request
        current = ""
        taskStartedAt = Date()
        task = recognizer.recognitionTask(with: request) { [weak self] result, error in
            self?.queue.async { self?.handle(result: result, error: error) }
        }
    }

    private func handle(result: SFSpeechRecognitionResult?, error: Error?) {
        if finished { return }
        if let result = result {
            current = result.bestTranscription.formattedString
            if !result.isFinal {
                emit(["type": "partial", "text": combined()])
            } else if stopping {
                finish()
                return
            } else {
                // The task ended by itself (time limit / pause): keep what was
                // said and continue with a fresh task.
                committed = combined()
                current = ""
                restartTask()
                return
            }
        }
        if error != nil, result == nil || !(result?.isFinal ?? false) {
            if stopping {
                finish()
                return
            }
            // "No speech detected" and similar end a task quietly; retry, but
            // give up if tasks keep failing right away.
            if Date().timeIntervalSince(taskStartedAt) < 1.0 { rapidFailures += 1 } else { rapidFailures = 0 }
            if rapidFailures >= 3 {
                emit(["type": "error", "code": "recognition-failed",
                      "message": error?.localizedDescription ?? "recognition failed"])
                shutdown(status: 2)
                return
            }
            committed = combined()
            current = ""
            restartTask()
        }
    }

    private func restartTask() {
        request?.endAudio()
        task?.cancel()
        startTask()
    }

    /// Ask the recognizer to finish; the final text arrives via `handle`.
    func stop() {
        queue.async {
            if self.stopping || self.finished { return }
            self.stopping = true
            self.engine.stop()
            self.engine.inputNode.removeTap(onBus: 0)
            self.request?.endAudio()
            // Do not wait forever for the final result.
            self.queue.asyncAfter(deadline: .now() + 3.0) { self.finish() }
        }
    }

    private func finish() {
        if finished { return }
        finished = true
        emit(["type": "final", "text": combined()])
        shutdown(status: 0)
    }

    private func shutdown(status: Int32) {
        finished = true
        engine.stop()
        task?.cancel()
        exit(status)
    }
}

// MARK: - Main

guard let requestedLocale = argumentValue("--locale") else {
    fail("recognition-failed", "usage: od-speech --locale <locale>")
}

let authSemaphore = DispatchSemaphore(value: 0)
var speechStatus = SFSpeechRecognizerAuthorizationStatus.notDetermined
SFSpeechRecognizer.requestAuthorization { status in
    speechStatus = status
    authSemaphore.signal()
}
authSemaphore.wait()
guard speechStatus == .authorized else {
    fail("speech-denied", "Speech recognition permission was not granted.")
}

var micGranted = false
AVCaptureDevice.requestAccess(for: .audio) { granted in
    micGranted = granted
    authSemaphore.signal()
}
authSemaphore.wait()
guard micGranted else {
    fail("mic-denied", "Microphone permission was not granted.")
}

guard let locale = resolveLocale(requestedLocale) else {
    fail("locale-unsupported", "No Apple speech recognizer for locale \(requestedLocale).")
}
guard let recognizer = SFSpeechRecognizer(locale: locale), recognizer.isAvailable else {
    fail("recognizer-unavailable", "The speech recognizer for \(locale.identifier) is unavailable.")
}

let session = Session(recognizer: recognizer)
do {
    try session.start()
} catch {
    fail("audio-engine-failed", error.localizedDescription)
}
emit(["type": "ready", "locale": locale.identifier, "onDevice": session.isOnDevice])

// "stop" on stdin (or EOF, e.g. the app quit) finishes the session.
DispatchQueue.global().async {
    while let line = readLine() {
        if line.trimmingCharacters(in: .whitespacesAndNewlines) == "stop" { break }
    }
    session.stop()
}

signal(SIGTERM, SIG_IGN)
let termSource = DispatchSource.makeSignalSource(signal: SIGTERM, queue: .main)
termSource.setEventHandler { session.stop() }
termSource.resume()

RunLoop.main.run()
