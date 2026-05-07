#!/usr/bin/env -S uv run --no-project --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "requests"]
# ///
"""
Pre-compute word similarity rankings via a hybrid LLM-tier + embedding tail.

For each secret word, asks a local generative LLM (gemma3:27b by default) to
produce four graded tiers of related words:
  Tier A (~20 words, ranks 2..21):    direct synonyms / near-identical
  Tier B (~50 words, ranks 22..71):   strongly related (parts, kinds, immediate associations)
  Tier C (~100 words, ranks 72..171): moderately related (broader category, common contexts)
  Tier D (~80 words, ranks 172..251): loosely related (shared situations / metaphors)

Post-processing per secret word:
  - Lowercase + dedupe across tiers (earlier tier wins).
  - Drop words not present in vocabulary.txt.
  - Sort each tier by cosine similarity to the secret word using the cached
    Ollama embedding matrix from precompute-rankings-ollama.py.
  - Ranks 252+ fall through to pure embedding cosine ordering, with already-tiered
    words excluded.
  - Final shape matches the existing ranking format: {word: rank}.

Outputs:
  server/data/rankings-hybrid/{word}.json       final rankings
  server/data/rankings-hybrid/_raw/{word}.json  raw LLM tier output (for inspection)

Usage:
    python precompute-rankings-hybrid.py
    python precompute-rankings-hybrid.py --secret-word dog
    python precompute-rankings-hybrid.py --gen-model gemma3:27b
"""

import argparse
import json
import sys
import time
from pathlib import Path

import numpy as np
import requests

OLLAMA_URL = "http://localhost:11434"
DEFAULT_GEN_MODEL = "gemma3:27b"
DEFAULT_EMBED_MODEL = "mxbai-embed-large"

TIER_PLAN = [
    ("A", 20, "direct synonyms or near-identical concepts"),
    ("B", 50, "strongly related: parts, kinds, immediate associations"),
    ("C", 100, "moderately related: broader category, things commonly found together"),
    ("D", 80, "loosely related: shared situations, contexts, or metaphors"),
]


def build_prompt(secret: str) -> str:
    tier_lines = []
    for label, count, descr in TIER_PLAN:
        tier_lines.append(f'  "tier_{label}": {count} words that are {descr}')
    return (
        f'You are building a word-similarity ranking for the target word "{secret}".\n'
        f"Produce four tiers of single English words ordered from closest to farthest.\n"
        f"Each word must be a single lowercase word (no spaces, hyphens, proper nouns,\n"
        f"or numbers), at least 3 letters, and must NOT be the target word itself.\n"
        f"Within each tier, list words from MOST related to LEAST related to the target.\n\n"
        f"Return STRICT JSON in this exact shape:\n"
        f"{{\n"
        + ",\n".join(tier_lines)
        + "\n}\n"
        f'\nTarget word: "{secret}"\n'
        f"Return ONLY the JSON object. No prose, no markdown."
    )


def chat_json(model: str, prompt: str, retries: int = 3) -> dict:
    """POST /api/chat with format=json and parse the response."""
    last_err: Exception | None = None
    for attempt in range(retries):
        try:
            resp = requests.post(
                f"{OLLAMA_URL}/api/chat",
                json={
                    "model": model,
                    "messages": [{"role": "user", "content": prompt}],
                    "format": "json",
                    "stream": False,
                    "options": {"temperature": 0.3},
                },
                timeout=600,
            )
            resp.raise_for_status()
            content = resp.json()["message"]["content"]
            return json.loads(content)
        except (requests.RequestException, json.JSONDecodeError, KeyError) as exc:
            last_err = exc
            if attempt < retries - 1:
                time.sleep(2 * (attempt + 1))
    raise RuntimeError(f"chat_json failed after {retries} attempts: {last_err}")


def embed_one(model: str, word: str) -> np.ndarray:
    resp = requests.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": model, "input": word},
        timeout=60,
    )
    resp.raise_for_status()
    return np.array(resp.json()["embeddings"][0], dtype=np.float32)


def cosine_similarities(target: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    target_norm = target / (np.linalg.norm(target) + 1e-12)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    return (matrix / norms) @ target_norm


def clean_tier(words: list, vocab_set: set[str], already: set[str], target: str) -> list[str]:
    out: list[str] = []
    seen: set[str] = set()
    for raw in words or []:
        if not isinstance(raw, str):
            continue
        w = raw.strip().lower()
        if not w or len(w) < 3 or not w.isalpha():
            continue
        if w == target or w in already or w in seen:
            continue
        if w not in vocab_set:
            continue
        out.append(w)
        seen.add(w)
    return out


def sort_by_similarity(words: list[str], target_vec: np.ndarray, vocab_idx: dict[str, int],
                       matrix: np.ndarray) -> list[str]:
    if not words:
        return []
    indices = [vocab_idx[w] for w in words]
    submat = matrix[indices]
    sims = cosine_similarities(target_vec, submat)
    order = np.argsort(-sims)
    return [words[i] for i in order]


def compute_hybrid_rankings(
    secret: str,
    gen_model: str,
    embed_model: str,
    vocab: list[str],
    vocab_idx: dict[str, int],
    matrix: np.ndarray,
    raw_dir: Path,
) -> dict[str, int]:
    vocab_set = set(vocab)

    # Step 1: ask the LLM for tiers.
    raw = chat_json(gen_model, build_prompt(secret))
    raw_dir.mkdir(parents=True, exist_ok=True)
    (raw_dir / f"{secret}.json").write_text(json.dumps(raw, indent=2))

    # Step 2: clean tiers (lowercase, dedupe, vocab-filter, drop target).
    target_vec = matrix[vocab_idx[secret]] if secret in vocab_idx else embed_one(embed_model, secret)
    tiered: dict[str, list[str]] = {}
    already: set[str] = set()
    for label, _count, _descr in TIER_PLAN:
        cleaned = clean_tier(raw.get(f"tier_{label}", []), vocab_set, already, secret)
        sorted_tier = sort_by_similarity(cleaned, target_vec, vocab_idx, matrix)
        tiered[label] = sorted_tier
        already.update(sorted_tier)

    # Step 3: assign ranks within tiers (rank 1 reserved for the secret word).
    rankings: dict[str, int] = {}
    rank = 2
    for label, _count, _descr in TIER_PLAN:
        for w in tiered[label]:
            rankings[w] = rank
            rank += 1

    # Step 4: fall through to embedding cosine for the tail.
    sims = cosine_similarities(target_vec, matrix)
    order = np.argsort(-sims)
    for idx in order:
        w = vocab[idx]
        if w == secret or w in rankings:
            continue
        rankings[w] = rank
        rank += 1
    return rankings


def main() -> None:
    parser = argparse.ArgumentParser(description="Hybrid LLM-tier + embedding ranking")
    parser.add_argument("--gen-model", default=DEFAULT_GEN_MODEL)
    parser.add_argument("--embed-model", default=DEFAULT_EMBED_MODEL)
    parser.add_argument("--data-dir", default=None)
    parser.add_argument("--output", default=None)
    parser.add_argument("--secret-word", default=None, help="Run only this secret word")
    parser.add_argument("--skip-existing", action="store_true",
                        help="Skip secret words whose output JSON already exists")
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    data_dir = Path(args.data_dir) if args.data_dir else script_dir.parent / "server" / "data"
    output_dir = Path(args.output) if args.output else data_dir / "rankings-hybrid"
    raw_dir = output_dir / "_raw"
    cache_dir = data_dir / "embeddings"
    safe_embed_model = args.embed_model.replace(":", "-").replace("/", "-")
    npy_path = cache_dir / f"{safe_embed_model}.npy"
    order_path = cache_dir / f"{safe_embed_model}.vocab-order.txt"

    if not npy_path.exists():
        sys.exit(
            f"Cached embeddings not found at {npy_path}.\n"
            f"Run scripts/precompute-rankings-ollama.py --model {args.embed_model} first."
        )

    vocab = order_path.read_text().splitlines()
    vocab_idx = {w: i for i, w in enumerate(vocab)}
    matrix = np.load(npy_path)
    print(f"Loaded vocab embeddings: shape={matrix.shape}")

    if args.secret_word:
        secret_words = [args.secret_word]
    else:
        secret_words = json.loads((data_dir / "secret-words.json").read_text())
    print(f"Generating hybrid rankings for {len(secret_words)} secret words...")

    output_dir.mkdir(parents=True, exist_ok=True)
    started = time.time()
    for i, word in enumerate(secret_words, 1):
        out_path = output_dir / f"{word}.json"
        if args.skip_existing and out_path.exists():
            print(f"  [{i}/{len(secret_words)}] {word}: SKIP (exists)")
            continue
        if word not in vocab_idx:
            print(f"  [{i}/{len(secret_words)}] {word}: NOT IN VOCAB, skipping")
            continue
        try:
            rankings = compute_hybrid_rankings(
                word, args.gen_model, args.embed_model,
                vocab, vocab_idx, matrix, raw_dir,
            )
            out_path.write_text(json.dumps(rankings))
            tier_total = sum(1 for r in rankings.values() if r <= 251)
            elapsed = time.time() - started
            rate = i / elapsed if elapsed else 0
            eta = (len(secret_words) - i) / rate if rate else 0
            print(
                f"  [{i}/{len(secret_words)}] {word}: {len(rankings)} ranked "
                f"({tier_total} from tiers)   ETA {eta/60:.1f} min"
            )
        except Exception as exc:
            print(f"  [{i}/{len(secret_words)}] {word}: ERROR {exc}")

    print("\nDone.")


if __name__ == "__main__":
    main()
