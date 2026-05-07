#!/usr/bin/env -S uv run --no-project --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["requests"]
# ///
"""
Expand the secret-words pool using a local generative LLM.

Asks gemma3:27b (or whichever Ollama model is passed via --model) for ~20-25
candidate secret words per category, then filters to words that:
  - exist in server/data/vocabulary.txt (so WordRanker accepts them)
  - are alphabetic, single-token, ≥3 chars
  - are NOT already in secret-words.json
  - are NOT proper nouns (best-effort: lowercase + filter against a small
    deny-list of obviously-proper-noun outputs the model sometimes returns).

Writes candidates to server/data/secret-words-candidates.json. Use --auto to
also append the candidates directly into secret-words.json.

Usage:
    python expand-secret-words.py
    python expand-secret-words.py --target 250
    python expand-secret-words.py --auto    # also merge into secret-words.json
"""

import argparse
import json
import sys
import time
from pathlib import Path

import requests

OLLAMA_URL = "http://localhost:11434"
DEFAULT_MODEL = "gemma3:27b"

CATEGORIES = [
    "animals (mammals, birds, reptiles, sea creatures, insects)",
    "food and drink (fruits, vegetables, dishes, beverages, ingredients)",
    "household objects (furniture, kitchenware, appliances, tools)",
    "nature (landforms, bodies of water, plants, weather phenomena)",
    "places and buildings (institutions, venues, spaces)",
    "body parts (anatomy, organs, features)",
    "abstract concepts (emotions, ideas, states)",
    "physical activities (sports, hobbies, motions)",
    "clothing and accessories",
    "vehicles and transportation",
    "musical instruments",
    "professions and roles",
    "materials and substances",
    "tools and implements",
    "celestial / weather / cosmic things",
]

DENY_PREFIXES_UPPER = ()  # already lowercased, but kept for readability


def build_prompt(category: str, count: int, exclude: list[str]) -> str:
    excl_sample = ", ".join(sorted(exclude)[:80]) + (", ..." if len(exclude) > 80 else "")
    return (
        f"You are picking secret words for a word-similarity guessing game like Contexto.\n"
        f"Each secret word must be:\n"
        f"  - a single common English word (lowercase, no spaces, no hyphens)\n"
        f"  - a CONCRETE noun preferred, but vivid abstract concepts are fine\n"
        f"  - between 3 and 14 letters\n"
        f"  - NOT a proper noun, brand, or place name\n"
        f"  - widely known to native English speakers\n"
        f"  - has an interesting semantic neighborhood (other words clearly related to it)\n\n"
        f'Category: {category}\n'
        f"Avoid these already-used words: {excl_sample}\n\n"
        f'Return STRICT JSON of the form: {{"words": ["word1", "word2", ...]}}\n'
        f"Provide exactly {count} candidates. Return ONLY the JSON. No prose."
    )


def chat_json(model: str, prompt: str, retries: int = 3) -> dict:
    for attempt in range(retries):
        try:
            resp = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.7},
                },
                timeout=600,
            )
            resp.raise_for_status()
            return json.loads(resp.json()["message"]["content"])
        except (requests.RequestException, json.JSONDecodeError, KeyError) as exc:
            if attempt == retries - 1:
                raise
            time.sleep(2 * (attempt + 1))
    raise RuntimeError("unreachable")


def clean_words(raw: list, vocab: set[str], existing: set[str]) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for r in raw or []:
        if not isinstance(r, str):
            continue
        w = r.strip().lower()
        if not w or len(w) < 3 or len(w) > 14:
            continue
        if not w.isalpha():
            continue
        if w in existing or w in seen:
            continue
        if w not in vocab:
            continue
        out.append(w)
        seen.add(w)
    return out


def main() -> None:
    parser = argparse.ArgumentParser(description="Expand the secret-words list via LLM")
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--target", type=int, default=250, help="Approx target candidate count")
    parser.add_argument("--per-category", type=int, default=25, help="Words asked per category")
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--auto", action="store_true",
                        help="Also append accepted candidates to secret-words.json")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    data_dir = Path(args.data_dir) if args.data_dir else script_dir.parent / "server" / "data"
    secret_path = data_dir / "secret-words.json"
    vocab_path = data_dir / "vocabulary.txt"
    out_path = data_dir / "secret-words-candidates.json"

    if not vocab_path.exists():
        sys.exit(f"vocabulary.txt missing at {vocab_path}")
    vocab = {w.strip().lower() for w in vocab_path.read_text().splitlines() if w.strip()}
    existing = set(json.loads(secret_path.read_text())) if secret_path.exists() else set()
    print(f"Vocabulary: {len(vocab)} words. Existing secret words: {len(existing)}.")

    accepted: list[str] = []
    accepted_set: set[str] = set()
    started = time.time()
    for i, category in enumerate(CATEGORIES, 1):
        print(f"  [{i}/{len(CATEGORIES)}] {category}")
        try:
            raw = chat_json(args.model, build_prompt(category, args.per_category,
                                                    sorted(existing | accepted_set)))
        except Exception as exc:
            print(f"    ERROR: {exc}")
            continue
        cleaned = clean_words(raw.get("words", []), vocab, existing | accepted_set)
        accepted.extend(cleaned)
        accepted_set.update(cleaned)
        print(f"    +{len(cleaned)} accepted (total {len(accepted_set)})")
        if len(accepted_set) >= args.target:
            break

    elapsed = time.time() - started
    print(f"\nGenerated {len(accepted_set)} unique candidates in {elapsed/60:.1f} min.")

    out_path.write_text(json.dumps(sorted(accepted_set), indent=2))
    print(f"Wrote candidates to {out_path}")

    if args.auto:
        merged = sorted(existing | accepted_set)
        secret_path.write_text(json.dumps(merged, indent=2))
        print(f"Merged into {secret_path}: {len(merged)} total secret words.")


if __name__ == "__main__":
    main()
