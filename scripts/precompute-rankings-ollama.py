#!/usr/bin/env -S uv run --no-project --script
# /// script
# requires-python = ">=3.10"
# dependencies = ["numpy", "requests"]
# ///
"""
Pre-compute word similarity rankings using Ollama embeddings.

Replaces the GloVe pipeline (scripts/precompute-rankings.py) with modern
transformer embeddings served by a local Ollama daemon at http://localhost:11434.

Two-phase pipeline:
  1. Vocab pass (cached): embed every word in vocabulary.txt once, save matrix
     as server/data/embeddings/{model}.npy alongside vocab-order.txt.
  2. Per-secret-word pass: load cached matrix, compute cosine similarity,
     write ranked {word: rank} JSON to server/data/rankings-ollama/{word}.json.

Default embedding model is mxbai-embed-large (1024d). Pass --model nomic-embed-text
for the smaller/faster option (auto-applies the search_document: prefix).

Usage:
    python precompute-rankings-ollama.py
    python precompute-rankings-ollama.py --model nomic-embed-text
    python precompute-rankings-ollama.py --rebuild-vocab     # force re-embed vocab
    python precompute-rankings-ollama.py --secret-word dog   # one word only
"""

import argparse
import json
import os
import sys
import time
from pathlib import Path

import numpy as np
import requests

OLLAMA_URL = os.environ.get("OLLAMA_URL", "http://localhost:11434")
DEFAULT_MODEL = "mxbai-embed-large"
BATCH_SIZE = 128  # Ollama handles big batches well; 128 is a safe default

# Some embedding models (notably nomic) are trained with task-prefix tokens.
# Without these, vocab and target embed into different spaces and ranks degrade.
MODEL_PREFIXES = {
    "nomic-embed-text": "search_document: ",
}


def prefix_for(model: str) -> str:
    for key, prefix in MODEL_PREFIXES.items():
        if model.startswith(key):
            return prefix
    return ""


def embed_batch(model: str, inputs: list[str]) -> np.ndarray:
    """POST /api/embed and return an (N, D) matrix."""
    resp = requests.post(
        f"{OLLAMA_URL}/api/embed",
        json={"model": model, "input": inputs},
        timeout=300,
    )
    resp.raise_for_status()
    data = resp.json()
    return np.array(data["embeddings"], dtype=np.float32)


def embed_vocabulary(model: str, vocab: list[str]) -> np.ndarray:
    """Embed all vocab words, in batches, with progress."""
    prefix = prefix_for(model)
    out = np.zeros((len(vocab), 0), dtype=np.float32)
    started = time.time()
    for i in range(0, len(vocab), BATCH_SIZE):
        batch = vocab[i : i + BATCH_SIZE]
        prefixed = [prefix + w for w in batch] if prefix else batch
        vecs = embed_batch(model, prefixed)
        if out.shape[1] == 0:
            out = np.zeros((len(vocab), vecs.shape[1]), dtype=np.float32)
        out[i : i + len(batch)] = vecs
        done = i + len(batch)
        elapsed = time.time() - started
        rate = done / elapsed if elapsed > 0 else 0
        eta = (len(vocab) - done) / rate if rate > 0 else 0
        print(
            f"  [{done:>6}/{len(vocab)}] {rate:5.1f} embeds/s   ETA {eta/60:5.1f} min",
            end="\r",
            flush=True,
        )
    print()
    return out


def cosine_similarity_matrix(target: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """target: (D,)  matrix: (N, D)  -> (N,) cosine similarities."""
    target_norm = target / (np.linalg.norm(target) + 1e-12)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1
    normalized = matrix / norms
    return normalized @ target_norm


def load_or_build_vocab_embeddings(
    model: str,
    vocab: list[str],
    cache_dir: Path,
    rebuild: bool = False,
) -> np.ndarray:
    """Load vocab embeddings from .npy if fresh, else recompute."""
    cache_dir.mkdir(parents=True, exist_ok=True)
    safe_model = model.replace(":", "-").replace("/", "-")
    npy_path = cache_dir / f"{safe_model}.npy"
    order_path = cache_dir / f"{safe_model}.vocab-order.txt"

    if not rebuild and npy_path.exists() and order_path.exists():
        cached_order = order_path.read_text().splitlines()
        if cached_order == vocab:
            print(f"Loaded cached vocab embeddings: {npy_path}")
            return np.load(npy_path)
        print("Cached vocab order differs from current vocabulary.txt — rebuilding.")

    print(f"Embedding {len(vocab)} vocab words with {model}...")
    matrix = embed_vocabulary(model, vocab)
    np.save(npy_path, matrix)
    order_path.write_text("\n".join(vocab))
    print(f"Saved vocab embeddings: {npy_path}  shape={matrix.shape}")
    return matrix


def compute_rankings_for_secret(
    secret_word: str,
    model: str,
    vocab: list[str],
    vocab_idx: dict[str, int],
    matrix: np.ndarray,
) -> dict[str, int]:
    """Embed the secret word, compute cosine vs vocab, return {word: rank}."""
    prefix = prefix_for(model)
    target_input = (prefix + secret_word) if prefix else secret_word

    if secret_word in vocab_idx:
        # Reuse the cached vocab embedding for the secret word so target and
        # candidate vectors come from identical inputs (avoids drift).
        target = matrix[vocab_idx[secret_word]]
    else:
        target = embed_batch(model, [target_input])[0]

    sims = cosine_similarity_matrix(target, matrix)

    # Sort descending; rank 1 reserved for the secret word itself.
    order = np.argsort(-sims)
    rankings: dict[str, int] = {}
    rank = 2
    for idx in order:
        word = vocab[idx]
        if word == secret_word:
            continue
        rankings[word] = rank
        rank += 1
    return rankings


def main() -> None:
    parser = argparse.ArgumentParser(description="Pre-compute rankings via Ollama embeddings")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Ollama embedding model")
    parser.add_argument("--data-dir", default=None, help="Override server/data path")
    parser.add_argument("--output", default=None, help="Override output rankings dir")
    parser.add_argument("--rebuild-vocab", action="store_true", help="Force re-embed vocabulary")
    parser.add_argument(
        "--secret-word",
        default=None,
        help="Process only this secret word (default: all from secret-words.json)",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    data_dir = Path(args.data_dir) if args.data_dir else script_dir.parent / "server" / "data"
    output_dir = Path(args.output) if args.output else data_dir / "rankings-ollama"
    cache_dir = data_dir / "embeddings"

    # Sanity check on Ollama
    try:
        requests.get(f"{OLLAMA_URL}/api/tags", timeout=5).raise_for_status()
    except Exception as exc:
        sys.exit(f"Ollama daemon not reachable at {OLLAMA_URL}: {exc}")

    # Load vocab + secret words
    vocab = (data_dir / "vocabulary.txt").read_text().splitlines()
    vocab = [w.strip() for w in vocab if w.strip()]
    vocab_idx = {w: i for i, w in enumerate(vocab)}
    print(f"Vocabulary: {len(vocab)} words")

    if args.secret_word:
        secret_words = [args.secret_word]
    else:
        secret_words = json.loads((data_dir / "secret-words.json").read_text())
    print(f"Secret words to rank: {len(secret_words)}")

    # Phase 1: vocab embeddings
    matrix = load_or_build_vocab_embeddings(args.model, vocab, cache_dir, args.rebuild_vocab)

    # Phase 2: per-secret-word ranking
    output_dir.mkdir(parents=True, exist_ok=True)
    print(f"\nWriting rankings to {output_dir}/")
    for i, word in enumerate(secret_words, 1):
        if word not in vocab_idx:
            print(f"  [{i}/{len(secret_words)}] {word}: NOT IN VOCAB, skipping")
            continue
        rankings = compute_rankings_for_secret(word, args.model, vocab, vocab_idx, matrix)
        out_path = output_dir / f"{word}.json"
        out_path.write_text(json.dumps(rankings))
        print(f"  [{i}/{len(secret_words)}] {word}: {len(rankings)} rankings")

    print("\nDone.")


if __name__ == "__main__":
    main()
