# Text-to-Speech

Generate speech audio locally using Kokoro-82M (no API key, runs on CPU).

## Voice Selection

Match voice to content. Default is `af_heart`.

| Content type  | Voice                 | Why                        |
| ------------- | --------------------- | -------------------------- |
| Product demo  | `af_heart`/`af_nova`  | Warm, professional         |
| Tutorial      | `am_adam`/`bf_emma`   | Neutral, easy to follow    |
| Marketing     | `af_sky`/`am_michael` | Energetic or authoritative |
| Documentation | `bf_emma`/`bm_george` | Clear British English      |
| Casual        | `af_heart`/`af_sky`   | Approachable, natural      |

Run `npx hyperframes tts --list` for all 54 voices (8 languages).

## Multilingual Phonemization

Kokoro voice IDs encode language in the first letter: `a`=American English, `b`=British English, `e`=Spanish, `f`=French, `h`=Hindi, `i`=Italian, `j`=Japanese, `p`=Brazilian Portuguese, `z`=Mandarin. The CLI auto-detects the phonemizer locale from that prefix — you don't need to pass `--lang` when the voice matches the text.

```bash
npx hyperframes tts "La reunión empieza a las nueve" --voice ef_dora --output es.wav
npx hyperframes tts "今日はいい天気ですね" --voice jf_alpha --output ja.wav
```

Use `--lang` only to override auto-detection (e.g. stylized accents):

```bash
npx hyperframes tts "Hello there" --voice af_heart --lang fr-fr --output accented.wav
```

Valid `--lang` codes: `en-us`, `en-gb`, `es`, `fr-fr`, `hi`, `it`, `pt-br`, `ja`, `zh`.

Non-English phonemization requires `espeak-ng` installed system-wide (`brew install espeak-ng` on macOS, `apt-get install espeak-ng` on Debian/Ubuntu).

## Speed Tuning

- **0.7-0.8** — Tutorial, complex content
- **1.0** — Natural pace (default)
- **1.1-1.2** — Intros, upbeat content
- **1.5+** — Rarely appropriate

## Usage

```bash
npx hyperframes tts "Your script here" --voice af_nova --output narration.wav
npx hyperframes tts script.txt --voice bf_emma --output narration.wav
```

In compositions:

```html
<audio
  id="narration"
  data-start="0"
  data-duration="auto"
  data-track-index="2"
  src="narration.wav"
  data-volume="1"
></audio>
```

## TTS + Captions Workflow

```bash
npx hyperframes tts script.txt --voice af_heart --output narration.wav
npx hyperframes transcribe narration.wav  # → transcript.json with word-level timestamps
```

## Requirements

- Python 3.8+ with `kokoro-onnx` and `soundfile`
- Model downloads on first use (~311 MB + ~27 MB voices, cached in `~/.cache/hyperframes/tts/`)
