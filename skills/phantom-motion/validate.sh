#!/bin/bash
set -e

echo "=============================================="
echo " Phantom Motion Minimal Validation Script"
echo "=============================================="

# Ensure directories exist
mkdir -p phantom-output/audio

echo "[1/3] Generating Mock TTS Audio..."
# Using the single minimal template
npm install puppeteer --no-save > /dev/null 2>&1
python3 scripts/tts-generate.py --subtitles templates/phantom-space-cosmos/subtitles.json --output-dir templates/phantom-space-cosmos/audio/

echo "[2/3] Generating Mock BGM Audio..."
python3 scripts/bgm-generate.py --topic "Cosmos" --duration 10 --output-dir templates/phantom-space-cosmos/audio/

echo "[3/3] Rendering MP4 Video..."
python3 scripts/render-mp4.py --html templates/phantom-space-cosmos/template.html --output phantom-output/test_cosmos.mp4

echo "=============================================="
echo " Validation Complete! Check phantom-output/test_cosmos.mp4"
echo "=============================================="
