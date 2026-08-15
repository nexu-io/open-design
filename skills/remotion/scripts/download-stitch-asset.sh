#!/bin/bash

# Download Stitch screen asset with proper handling of Google Cloud Storage URLs
# Usage: ./download-stitch-asset.sh "https://storage.googleapis.com/..." "output-path.png"

set -e

if [ $# -ne 2 ]; then
  echo "Usage: $0 <download_url> <output_path>"
  echo "Example: $0 'https://storage.googleapis.com/stitch/screenshot.png' 'assets/screen.png'"
  exit 1
fi

DOWNLOAD_URL="$1"
OUTPUT_PATH="$2"

# Create directory if it doesn't exist
OUTPUT_DIR=$(dirname "$OUTPUT_PATH")
mkdir -p "$OUTPUT_DIR"

echo "Downloading from: $DOWNLOAD_URL"
echo "Saving to: $OUTPUT_PATH"

# Use curl with follow redirects; -f fails on HTTP errors so an error
# response (e.g. an expired signed URL) is not saved as the asset
if curl -L -f -o "$OUTPUT_PATH" "$DOWNLOAD_URL"; then
  echo "✓ Successfully downloaded to $OUTPUT_PATH"

  # Display file size for verification
  if command -v stat &> /dev/null; then
    FILE_SIZE=$(stat -f%z "$OUTPUT_PATH" 2>/dev/null || stat -c%s "$OUTPUT_PATH" 2>/dev/null)
    echo "  File size: $FILE_SIZE bytes"
  fi
else
  echo "✗ Download failed"
  rm -f "$OUTPUT_PATH"
  exit 1
fi
