#!/usr/bin/env python3
"""
Pre-compute word similarity rankings using GloVe embeddings.

For each secret word, ranks all vocabulary words by cosine similarity
and saves as a JSON file (word -> rank).

Usage:
    python precompute-rankings.py [--glove PATH] [--words PATH] [--output DIR] [--vocab-size N]
"""

import json
import os
import sys
import argparse
import numpy as np
from pathlib import Path

def load_glove(path: str, vocab_size: int = 50000) -> tuple[dict[str, np.ndarray], list[str]]:
    """Load GloVe vectors, keeping only the most common words."""
    print(f"Loading GloVe vectors from {path}...")
    vectors = {}
    words = []

    with open(path, 'r', encoding='utf-8') as f:
        for i, line in enumerate(f):
            if i >= vocab_size:
                break
            parts = line.strip().split()
            word = parts[0]
            # Skip words with non-alpha characters
            if not word.isalpha() or len(word) < 2:
                continue
            vec = np.array([float(x) for x in parts[1:]], dtype=np.float32)
            vectors[word] = vec
            words.append(word)

    print(f"Loaded {len(vectors)} word vectors")
    return vectors, words


def cosine_similarity_batch(target: np.ndarray, matrix: np.ndarray) -> np.ndarray:
    """Compute cosine similarity between target vector and all rows in matrix."""
    target_norm = target / np.linalg.norm(target)
    norms = np.linalg.norm(matrix, axis=1, keepdims=True)
    norms[norms == 0] = 1  # avoid division by zero
    normalized = matrix / norms
    return normalized @ target_norm


def compute_rankings(secret_word: str, vectors: dict[str, np.ndarray], words: list[str]) -> dict[str, int]:
    """Compute similarity rankings for a secret word."""
    if secret_word not in vectors:
        print(f"  WARNING: '{secret_word}' not in vocabulary, skipping")
        return {}

    target = vectors[secret_word]

    # Build matrix of all word vectors
    word_list = [w for w in words if w != secret_word]
    matrix = np.array([vectors[w] for w in word_list])

    # Compute similarities
    similarities = cosine_similarity_batch(target, matrix)

    # Sort by similarity (highest first) and assign ranks
    sorted_indices = np.argsort(-similarities)
    rankings = {}
    for rank, idx in enumerate(sorted_indices, start=2):  # rank 1 is the secret word itself
        rankings[word_list[idx]] = rank

    return rankings


def main():
    parser = argparse.ArgumentParser(description='Pre-compute word similarity rankings')
    parser.add_argument('--glove', default=None, help='Path to GloVe vectors file')
    parser.add_argument('--words', default=None, help='Path to secret words JSON')
    parser.add_argument('--output', default=None, help='Output directory for rankings')
    parser.add_argument('--vocab-size', type=int, default=50000, help='Max vocabulary size')
    args = parser.parse_args()

    script_dir = Path(__file__).parent
    data_dir = script_dir.parent / 'server' / 'data'

    glove_path = args.glove or str(data_dir / 'glove' / 'glove.6B.100d.txt')
    words_path = args.words or str(data_dir / 'secret-words.json')
    output_dir = args.output or str(data_dir / 'rankings')

    # Load GloVe
    if not os.path.exists(glove_path):
        print(f"GloVe file not found at {glove_path}")
        print("Run ./scripts/download-glove.sh first")
        sys.exit(1)

    vectors, vocab_words = load_glove(glove_path, args.vocab_size)

    # Save vocabulary
    vocab_path = data_dir / 'vocabulary.txt'
    with open(vocab_path, 'w') as f:
        f.write('\n'.join(vocab_words))
    print(f"Saved vocabulary ({len(vocab_words)} words) to {vocab_path}")

    # Load secret words
    with open(words_path, 'r') as f:
        secret_words = json.load(f)

    print(f"\nComputing rankings for {len(secret_words)} secret words...")

    os.makedirs(output_dir, exist_ok=True)

    for i, word in enumerate(secret_words):
        print(f"  [{i+1}/{len(secret_words)}] {word}...")
        rankings = compute_rankings(word, vectors, vocab_words)

        if rankings:
            output_path = os.path.join(output_dir, f'{word}.json')
            with open(output_path, 'w') as f:
                json.dump(rankings, f)
            print(f"    Saved {len(rankings)} rankings")

    print("\nDone!")


if __name__ == '__main__':
    main()
