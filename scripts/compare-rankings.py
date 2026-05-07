#!/usr/bin/env -S uv run --no-project --script
# /// script
# requires-python = ">=3.10"
# dependencies = []
# ///
"""
Compare word rankings across multiple sources side-by-side.

Reads from:
  server/data/rankings/{word}.json           (GloVe baseline)
  server/data/rankings-ollama/{word}.json    (Pipeline 1 — embedding swap)
  server/data/rankings-hybrid/{word}.json    (Pipeline 2 — LLM tiers + embedding tail)

Two modes:

  Window mode (default):
    Show the top words in each rank window for one secret word, side by side.

      python compare-rankings.py dog
      python compare-rankings.py apple --windows 1-10 50-60 200-210

  Probe mode:
    Look up specific words and show what rank each lands at across sources.
    Best for "does 'leash' actually feel close to 'dog' in this ranking?"

      python compare-rankings.py dog --probe leash bone cat puppy car table
"""

import argparse
import json
import sys
from pathlib import Path

SOURCES = [
    ("glove", "rankings"),
    ("ollama", "rankings-ollama"),
    ("hybrid", "rankings-hybrid"),
]


def load_source(data_dir: Path, dirname: str, secret: str) -> dict[str, int] | None:
    path = data_dir / dirname / f"{secret}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text())


def invert(rankings: dict[str, int]) -> dict[int, str]:
    return {rank: word for word, rank in rankings.items()}


def parse_windows(specs: list[str]) -> list[tuple[int, int]]:
    out = []
    for spec in specs:
        if "-" in spec:
            lo, hi = spec.split("-", 1)
            out.append((int(lo), int(hi)))
        else:
            n = int(spec)
            out.append((n, n))
    return out


def show_windows(secret: str, sources: dict[str, dict[str, int]], windows: list[tuple[int, int]]) -> None:
    inverted = {name: invert(r) for name, r in sources.items()}
    names = list(sources.keys())
    col_w = 16
    for lo, hi in windows:
        print(f"\n=== ranks {lo}..{hi} ===")
        header = "rank  " + "  ".join(f"{n:<{col_w}}" for n in names)
        print(header)
        print("-" * len(header))
        for r in range(lo, hi + 1):
            row = [f"{r:>4}  "]
            for n in names:
                w = inverted[n].get(r, "—")
                row.append(f"{w:<{col_w}}")
            print("  ".join(row))


def show_probe(secret: str, sources: dict[str, dict[str, int]], probes: list[str]) -> None:
    names = list(sources.keys())
    col_w = 10
    print(f"\nprobe ranks for secret='{secret}'")
    header = "word          " + "  ".join(f"{n:>{col_w}}" for n in names)
    print(header)
    print("-" * len(header))
    for p in probes:
        word = p.lower().strip()
        row = [f"{word:<14}"]
        for n in names:
            r = sources[n].get(word)
            cell = f"{r:>{col_w}}" if r is not None else f"{'—':>{col_w}}"
            row.append(cell)
        print("  ".join(row))


def main() -> None:
    parser = argparse.ArgumentParser(description="Compare rankings across pipelines")
    parser.add_argument("secret", help="Secret word")
    parser.add_argument("--data-dir", default=None)
    parser.add_argument(
        "--windows",
        nargs="+",
        default=["1-10", "25-35", "75-85", "200-210", "1000-1010"],
        help="Rank windows to display in window mode",
    )
    parser.add_argument(
        "--probe",
        nargs="*",
        default=None,
        help="Probe mode: words to look up across sources",
    )
    args = parser.parse_args()

    script_dir = Path(__file__).resolve().parent
    data_dir = Path(args.data_dir) if args.data_dir else script_dir.parent / "server" / "data"

    sources: dict[str, dict[str, int]] = {}
    for name, dirname in SOURCES:
        loaded = load_source(data_dir, dirname, args.secret)
        if loaded is not None:
            sources[name] = loaded
        else:
            print(f"  (no data for {name} at {data_dir / dirname / (args.secret + '.json')})")

    if not sources:
        sys.exit(f"No ranking files found for '{args.secret}'.")

    if args.probe is not None:
        show_probe(args.secret, sources, args.probe)
    else:
        show_windows(args.secret, sources, parse_windows(args.windows))


if __name__ == "__main__":
    main()
