# SiftQ video provider

Open Design integrates SiftQ as an independent media provider for the
MiniMax-H3 V2 video API. It supports text-to-video and one first-frame
image-to-video input through the same `/api/media/*` and `od media generate`
path used by the Media UI.

## Configure

In **Settings → Media Providers → SiftQ**, save a SiftQ API key. For CLI and
server deployments, set `OD_SIFTQ_API_KEY`; `SIFTQ_API_KEY` is also accepted as
a fallback. SiftQ credentials are separate from MiniMax credentials.

The default API base is `https://siftq.com/api/minimax/`. A custom base URL can
be saved in the provider settings when routing through a compatible gateway.

## Generate

```sh
od media generate \
  --surface video \
  --model siftq-minimax-h3 \
  --prompt "A paper bird takes flight over a hand-drawn city" \
  --aspect 16:9 \
  --length 5 \
  --resolution 768P \
  --output paper-bird.mp4
```

Add `--image path/to/first-frame.png` for image-to-video. The path must be
inside the project. The adapter sends that image with the H3 V2
`first_frame` role and uses the required `adaptive` ratio.

## Supported inputs

- Wire model: `MiniMax-H3` (fixed)
- Duration: any integer from 4 through 15 seconds
- Resolution: `768P` (default) or `2K`
- Text-to-video ratios: `21:9`, `16:9`, `4:3`, `1:1`, `3:4`, `9:16`
- Image-to-video: one first-frame PNG, JPEG, or WEBP supported by the
  project upload path

Open Design does not currently expose last-frame/reference video/reference
audio inputs, H3 Context-IR, task listing, provider-side deletion, callbacks,
or cancellation. Failed and cancelled provider tasks are surfaced as errors.
Downloaded result URLs are SSRF-checked, fetched without the SiftQ bearer key,
and validated as MP4/MOV before being written to the project.
