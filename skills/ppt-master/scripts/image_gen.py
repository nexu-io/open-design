#!/usr/bin/env python3
"""
Unified Image Generation Tool

Dispatches to the appropriate backend based on explicit provider configuration.

Backend selection (`IMAGE_BACKEND` in `.env` or the current process environment):
  IMAGE_BACKEND=gemini      -> Gemini backend (google-genai SDK)
  IMAGE_BACKEND=openai      -> OpenAI-compatible backend (openai SDK)
  IMAGE_BACKEND=minimax     -> MiniMax image backend
  IMAGE_BACKEND=stability   -> Stability AI backend
  IMAGE_BACKEND=bfl         -> Black Forest Labs FLUX backend
  IMAGE_BACKEND=ideogram    -> Ideogram backend
  IMAGE_BACKEND=qwen        -> Alibaba Qwen image backend
  IMAGE_BACKEND=zhipu       -> Zhipu GLM-Image backend
  IMAGE_BACKEND=volcengine  -> Volcengine Seedream backend
  IMAGE_BACKEND=modelscope  -> ModelScope backend
  IMAGE_BACKEND=siliconflow -> SiliconFlow backend
  IMAGE_BACKEND=fal         -> fal.ai backend
  IMAGE_BACKEND=replicate   -> Replicate backend
  IMAGE_BACKEND=openrouter  -> OpenRouter backend

Configuration source (process env wins, `.env` is the fallback layer):
  1. Current process environment variables
  2. The first `.env` found among:
     - Current working directory
     - Repo root (when running from a clone)
     - `~/.ppt-master/.env` (user-level config)

Supported keys:
  IMAGE_BACKEND    (required) backend name

  Provider-specific keys are used for credentials and overrides, for example:
    GEMINI_API_KEY / GEMINI_MODEL / GEMINI_BASE_URL
    OPENAI_API_KEY / OPENAI_MODEL / OPENAI_BASE_URL
    QWEN_API_KEY / QWEN_MODEL / QWEN_BASE_URL
    ZHIPU_API_KEY / ZHIPU_MODEL / ZHIPU_BASE_URL

Usage:
  python3 image_gen.py "prompt" --aspect_ratio 16:9 --image_size 1K -o images/
  python3 image_gen.py --list-backends
"""

import os
import sys
import argparse

from config import load_prefixed_env_file, resolve_env_path

ENV_PATH = resolve_env_path()
IMAGE_ENV_PREFIXES = (
    "IMAGE_",
    "GEMINI_",
    "OPENAI_",
    "MINIMAX_",
    "STABILITY_",
    "BFL_",
    "IDEOGRAM_",
    "QWEN_",
    "DASHSCOPE_",
    "ZHIPU_",
    "BIGMODEL_",
    "VOLCENGINE_",
    "ARK_",
    "MODELSCOPE_",
    "SILICONFLOW_",
    "FAL_",
    "REPLICATE_",
    "OPENROUTER_",
)
DEPRECATED_IMAGE_KEYS = {
    "IMAGE_API_KEY",
    "IMAGE_MODEL",
    "IMAGE_BASE_URL",
}

# All aspect ratios accepted by the unified CLI
# (each backend validates its own subset internally)
ALL_ASPECT_RATIOS = [
    "1:1", "1:4", "1:8",
    "2:3", "3:2", "3:4", "4:1", "4:3",
    "4:5", "5:4", "8:1", "9:16", "16:9", "21:9"
]

ALL_IMAGE_SIZES = ["512px", "1K", "2K", "4K"]

BACKEND_REGISTRY = {
    "gemini": {
        "module": "backend_gemini",
        "tier": "core",
        "label": "Google Gemini",
        "default_model": "gemini-3.1-flash-image-preview",
        "key_hint": "GEMINI_API_KEY",
        "aliases": ["google"],
    },
    "openai": {
        "module": "backend_openai",
        "tier": "core",
        "label": "OpenAI / OpenAI-compatible",
        "default_model": "gpt-image-2",
        "key_hint": "OPENAI_API_KEY",
        "aliases": ["openai-compatible", "openai_compatible"],
    },
    "minimax": {
        "module": "backend_minimax",
        "tier": "experimental",
        "label": "MiniMax Image",
        "default_model": "image-01",
        "key_hint": "MINIMAX_API_KEY",
        "aliases": ["minimaxi"],
    },
    "qwen": {
        "module": "backend_qwen",
        "tier": "core",
        "label": "Alibaba Qwen Image",
        "default_model": "qwen-image-2.0-pro",
        "key_hint": "QWEN_API_KEY / DASHSCOPE_API_KEY",
        "aliases": ["alibaba", "dashscope"],
    },
    "zhipu": {
        "module": "backend_zhipu",
        "tier": "core",
        "label": "Zhipu GLM-Image",
        "default_model": "glm-image",
        "key_hint": "ZHIPU_API_KEY / BIGMODEL_API_KEY",
        "aliases": ["bigmodel", "glm", "glm-image"],
    },
    "volcengine": {
        "module": "backend_volcengine",
        "tier": "core",
        "label": "Volcengine Seedream",
        "default_model": "doubao-seedream-4-5-251128",
        "key_hint": "VOLCENGINE_API_KEY / ARK_API_KEY",
        "aliases": ["ark", "doubao", "seedream"],
    },
    "modelscope": {
        "module": "backend_modelscope",
        "tier": "experimental",
        "label": "ModelScope",
        "default_model": "Tongyi-MAI/Z-Image-Turbo",
        "key_hint": "MODELSCOPE_API_KEY",
        "aliases": ["modelscope", "model-scope"]
    },
    "stability": {
        "module": "backend_stability",
        "tier": "extended",
        "label": "Stability AI",
        "default_model": "stable-image-core",
        "key_hint": "STABILITY_API_KEY",
        "aliases": ["stabilityai", "stability-ai"],
    },
    "bfl": {
        "module": "backend_bfl",
        "tier": "extended",
        "label": "Black Forest Labs FLUX",
        "default_model": "flux-pro-1.1-ultra",
        "key_hint": "BFL_API_KEY",
        "aliases": ["flux", "black-forest-labs", "black_forest_labs"],
    },
    "ideogram": {
        "module": "backend_ideogram",
        "tier": "extended",
        "label": "Ideogram",
        "default_model": "ideogram-v3",
        "key_hint": "IDEOGRAM_API_KEY",
    },
    "siliconflow": {
        "module": "backend_siliconflow",
        "tier": "experimental",
        "label": "SiliconFlow",
        "default_model": "Qwen/Qwen-Image",
        "key_hint": "SILICONFLOW_API_KEY",
        "aliases": ["silicon"],
    },
    "fal": {
        "module": "backend_fal",
        "tier": "experimental",
        "label": "fal.ai",
        "default_model": "fal-ai/imagen3/fast",
        "key_hint": "FAL_KEY / FAL_API_KEY",
        "aliases": ["fal-ai"],
    },
    "replicate": {
        "module": "backend_replicate",
        "tier": "experimental",
        "label": "Replicate",
        "default_model": "black-forest-labs/flux-1.1-pro",
        "key_hint": "REPLICATE_API_TOKEN / REPLICATE_API_KEY",
    },
    "openrouter": {
        "module": "backend_openrouter",
        "tier": "experimental",
        "label": "OpenRouter",
        "default_model": "google/gemini-3.1-flash-image-preview",
        "key_hint": "OPENROUTER_API_KEY",
    },
}

TIER_ORDER = {"core": 0, "extended": 1, "experimental": 2}
SUPPORTED_BACKENDS = tuple(sorted(BACKEND_REGISTRY))


def _load_image_env_file() -> None:
    """
    Load image generation config from the resolved `.env` as a fallback layer.

    Existing process environment variables win over `.env`.
    """
    replacements = {
        "IMAGE_API_KEY": "GEMINI_API_KEY / OPENAI_API_KEY / QWEN_API_KEY / ZHIPU_API_KEY / ...",
        "IMAGE_MODEL": "GEMINI_MODEL / OPENAI_MODEL / QWEN_MODEL / ZHIPU_MODEL / ...",
        "IMAGE_BASE_URL": "GEMINI_BASE_URL / OPENAI_BASE_URL / QWEN_BASE_URL / ZHIPU_BASE_URL / ...",
    }
    deprecated_messages = {
        key: (
            "Global image config keys have been removed.\n"
            f"Use IMAGE_BACKEND plus provider-specific keys instead, such as {replacement}."
        )
        for key, replacement in replacements.items()
    }
    load_prefixed_env_file(IMAGE_ENV_PREFIXES, deprecated_keys=deprecated_messages)


def _validate_runtime_config() -> None:
    """Reject deprecated global image variables from any configuration source."""
    for key in DEPRECATED_IMAGE_KEYS:
        if key not in os.environ:
            continue
        replacement = {
            "IMAGE_API_KEY": "GEMINI_API_KEY / OPENAI_API_KEY / QWEN_API_KEY / ZHIPU_API_KEY / ...",
            "IMAGE_MODEL": "GEMINI_MODEL / OPENAI_MODEL / QWEN_MODEL / ZHIPU_MODEL / ...",
            "IMAGE_BASE_URL": "GEMINI_BASE_URL / OPENAI_BASE_URL / QWEN_BASE_URL / ZHIPU_BASE_URL / ...",
        }[key]
        raise ValueError(
            f"Unsupported image config key: {key}\n"
            "Global image config keys have been removed.\n"
            f"Use IMAGE_BACKEND plus provider-specific keys instead, such as {replacement}."
        )


def _build_backend_aliases() -> dict[str, str]:
    """Build a lookup from aliases to canonical backend names."""
    aliases = {}
    for canonical_name, config in BACKEND_REGISTRY.items():
        aliases[canonical_name] = canonical_name
        for alias in config.get("aliases", []):
            aliases[alias] = canonical_name
    return aliases


BACKEND_ALIASES = _build_backend_aliases()


_BACKEND_PIP_HINTS = {
    "gemini": "google-genai",
    "openai": "openai",
}


def _load_backend(canonical_name: str) -> tuple[object, str]:
    """Import and return the configured backend module."""
    module_name = f"image_backends.{BACKEND_REGISTRY[canonical_name]['module']}"
    try:
        module = __import__(module_name, fromlist=["*"])
    except ImportError as exc:
        pip_name = _BACKEND_PIP_HINTS.get(canonical_name, exc.name or "<dependency>")
        print(
            f"Error: backend '{canonical_name}' needs a package that is not installed.\n"
            f"Missing: {exc.name}\n"
            f"Run: pip install {pip_name}",
            file=sys.stderr,
        )
        sys.exit(1)
    return module, canonical_name


def _print_backend_list() -> None:
    """Print supported backends grouped by support tier."""
    print("Supported image backends:\n")
    tiers = ("core", "extended", "experimental")
    for tier in tiers:
        print(f"{tier.upper()}:")
        for name, info in sorted(
            BACKEND_REGISTRY.items(),
            key=lambda item: (TIER_ORDER[item[1]["tier"]], item[0]),
        ):
            if info["tier"] != tier:
                continue
            print(
                f"  {name:<12} {info['label']} | default={info['default_model']} | keys={info['key_hint']}"
            )
        print()
    print("Recommendation: prefer CORE backends for everyday PPT generation.")
    print(f"Config fallback file: {ENV_PATH}")


def _resolve_backend() -> tuple[object, str]:
    """
    Determine which backend to use from explicit configuration.

    Returns:
        A backend module with a generate() function.
    """
    backend_name = os.environ.get("IMAGE_BACKEND", "").strip().lower()
    if backend_name:
        canonical = BACKEND_ALIASES.get(backend_name)
        if not canonical:
            supported = ", ".join(SUPPORTED_BACKENDS)
            print(f"Error: Unknown IMAGE_BACKEND='{backend_name}'. Supported: {supported}")
            sys.exit(1)
        return _load_backend(canonical)

    supported = ", ".join(SUPPORTED_BACKENDS)
    print(
        "Error: No image backend configured.\n"
        "\n"
        "Set IMAGE_BACKEND explicitly in one of these places:\n"
        f"  1. Current process environment\n"
        f"  2. {ENV_PATH}\n"
        "\n"
        f"Supported backends: {supported}\n"
        "\n"
        "Example:\n"
        "  IMAGE_BACKEND=openai\n"
        "  OPENAI_API_KEY=sk-xxx\n"
    )
    sys.exit(1)


def main() -> None:
    """Run the CLI entry point."""
    parser = argparse.ArgumentParser(
        description="Generate images using AI image model providers."
    )
    parser.add_argument(
        "prompt", nargs="?", default="a beautiful landscape",
        help="The text prompt for image generation."
    )
    parser.add_argument(
        "--aspect_ratio", default="1:1", choices=ALL_ASPECT_RATIOS,
        help=f"Aspect ratio. Default: 1:1."
    )
    parser.add_argument(
        "--image_size", default="1K",
        help=f"Image size. Choices: {ALL_IMAGE_SIZES}. Default: 1K. (case-insensitive)"
    )
    parser.add_argument(
        "--output", "-o", default=None,
        help="Output directory. Default: current directory."
    )
    parser.add_argument(
        "--filename", "-f", default=None,
        help="Output filename (without extension). Overrides auto-naming."
    )
    parser.add_argument(
        "--model", "-m", default=None,
        help="Model name. Default depends on backend."
    )
    parser.add_argument(
        "--backend", "-b", default=None, choices=SUPPORTED_BACKENDS,
        help="Override IMAGE_BACKEND env var."
    )
    parser.add_argument(
        "--list-backends", action="store_true",
        help="List available backends grouped by support tier and exit."
    )

    args = parser.parse_args()

    if args.list_backends:
        _print_backend_list()
        return

    try:
        _load_image_env_file()
        _validate_runtime_config()
    except ValueError as e:
        print(f"Error: {e}")
        sys.exit(1)

    # CLI --backend overrides the value loaded from .env
    if args.backend:
        os.environ["IMAGE_BACKEND"] = args.backend

    backend, backend_name = _resolve_backend()
    print(f"Using backend: {backend_name}\n")

    try:
        backend.generate(
            prompt=args.prompt,
            aspect_ratio=args.aspect_ratio,
            image_size=args.image_size,
            output_dir=args.output,
            filename=args.filename,
            model=args.model,
        )
    except (ValueError, FileNotFoundError) as e:
        print(f"Error: {e}")
        sys.exit(1)
    except RuntimeError as e:
        print(f"Error: {e}")
        sys.exit(1)
    except KeyboardInterrupt:
        print("\n\nInterrupted by user.")
        sys.exit(130)


if __name__ == "__main__":
    main()
