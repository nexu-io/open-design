import argparse
import base64
import os
import json

def read_base64(filepath):
    if not os.path.exists(filepath):
        return ""
    with open(filepath, 'r') as f:
        return f.read().strip()

def main():
    parser = argparse.ArgumentParser(description="Phantom Deck HTML Assembler")
    parser.add_argument("--html", required=True, help="Input HTML file with slides")
    parser.add_argument("--tts-b64", help="TTS Base64 text file")
    parser.add_argument("--bgm-b64", help="BGM Base64 text file")
    parser.add_argument("--timings", help="Timings JSON file")
    parser.add_argument("--output", required=True, help="Final HTML output path")
    args = parser.parse_args()

    with open(args.html, 'r', encoding='utf-8') as f:
        html_content = f.read()

    # Read runtime JS
    runtime_path = os.path.join(os.path.dirname(__file__), '../references/deck-runtime.js')
    with open(runtime_path, 'r', encoding='utf-8') as f:
        runtime_js = f.read()

    tts_b64 = read_base64(args.tts_b64) if args.tts_b64 else ""
    bgm_b64 = read_base64(args.bgm_b64) if args.bgm_b64 else ""

    timings_data = "{}"
    if args.timings and os.path.exists(args.timings):
        with open(args.timings, 'r', encoding='utf-8') as f:
            timings_data = f.read()

    injected_assets = f"""
    <!-- Phantom Deck Runtime Injections -->
    <script type="application/json" id="timing-data">
    {timings_data}
    </script>
    <audio id="tts-audio" src="data:audio/wav;base64,{tts_b64}" preload="auto"></audio>
    <audio id="bgm-audio" src="data:audio/mp3;base64,{bgm_b64}" preload="auto" loop></audio>
    <script>
    {runtime_js}
    </script>
    """

    if "</body>" in html_content:
        html_content = html_content.replace("</body>", injected_assets + "\n</body>")
    else:
        html_content += injected_assets

    os.makedirs(os.path.dirname(os.path.abspath(args.output)), exist_ok=True)
    with open(args.output, 'w', encoding='utf-8') as f:
        f.write(html_content)

    print(f"✅ Phantom Deck Assembled: {args.output}")

if __name__ == "__main__":
    main()
