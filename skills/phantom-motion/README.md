<div align="center">
  <img src="./logo.svg" width="100%" alt="Phantom Motion Logo">
  
  <h3>Phantom Motion (Minimal Core)</h3>
  <p>A 3D physical-grade motion graphics engine. This minimal version demonstrates the programmatic HTML-to-MP4 video rendering pipeline.</p>
</div>

---

## 🌟 Introduction

This is the minimal, refactored core of **Phantom Motion**, prepared specifically for integration into OpenDesign as a `design-template`. It demonstrates how to take a simple HTML template, inject timing data, capture frames using a headless browser (Puppeteer), and mux everything with Audio via FFmpeg to produce a production-ready MP4.

## 📂 Structure

- `scripts/`: Python orchestration scripts (`render-mp4.py`, `tts-generate.py`, `bgm-generate.py`).
- `templates/phantom-space-cosmos/`: A minimal HTML/CSS template to demonstrate the animation pipeline.
- `validate.sh`: A one-line verification script.

## 🚀 Quick Verification

To verify the pipeline locally without any API keys, simply run:

```bash
# This will generate mock audio and render the template into an MP4 video
./validate.sh
```

Check the generated video at `phantom-output/test_cosmos.mp4`.
