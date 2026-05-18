## Why
Adding Phantom Motion, a 3D physical-grade motion graphics engine. This is a minimal core version designed for OpenDesign to enable automated, high-aesthetic HTML-to-MP4 video rendering, avoiding the large payload of the full 32-template repository. It introduces a lightweight, robust rendering pipeline using Puppeteer and FFmpeg that serves as the foundation for future design templates.

## What users will see
Users will see a single new minimal design template (`phantom-space-cosmos`) and a set of core Python scripts (`render-mp4.py`, `tts-generate.py`, `bgm-generate.py`) that demonstrate how to programmatically inject timing data into the HTML template, capture it frame-by-frame, and mux it with generated audio into a professional `.mp4` video.

## Surface area
- `scripts/`: Contains the core Python scripts for orchestration (TTS, BGM, and MP4 Rendering) and the Node.js puppeteer recorder script.
- `templates/phantom-space-cosmos/`: A single minimal HTML/CSS template demonstrating the animation timing injection and visually stunning design elements, including a mock subtitles JSON.
- `validate.sh`: A one-line verification script that runs the entire pipeline locally without requiring API keys.

## Validation
To verify this PR locally, simply run the included validation script which will automatically generate a mock output video using the included template:
```bash
./validate.sh
```
This will produce a test video at `phantom-output/test_cosmos.mp4`.
