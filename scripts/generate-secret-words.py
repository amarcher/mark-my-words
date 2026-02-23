#!/usr/bin/env python3
"""
Generate a list of good secret words for Word-Similarity-Game.
These should be common, concrete nouns that have interesting semantic neighborhoods.
"""

import json
from pathlib import Path

# Curated list of good secret words - common, concrete, interesting
SECRET_WORDS = [
    # Animals
    "dog", "cat", "horse", "elephant", "dolphin", "eagle", "snake", "bear",
    "tiger", "whale",
    # Food
    "pizza", "bread", "apple", "chocolate", "coffee", "cheese", "rice", "cake",
    "banana", "soup",
    # Objects
    "book", "phone", "car", "chair", "guitar", "clock", "mirror", "lamp",
    "bridge", "camera",
    # Nature
    "ocean", "mountain", "forest", "river", "desert", "island", "volcano",
    "garden", "beach", "storm",
    # Places
    "hospital", "school", "castle", "library", "museum", "stadium", "temple",
    "airport", "prison", "church",
    # Body
    "heart", "brain", "hand", "blood", "bone", "skin", "muscle", "tooth",
    # Concepts
    "fire", "water", "light", "shadow", "music", "dream", "gold", "iron",
    "diamond", "silver",
    # Activities
    "dance", "sleep", "fight", "swim", "paint", "sing", "cook", "climb",
    # Clothing
    "shoe", "hat", "ring", "crown", "mask", "armor",
    # Weather/Sky
    "rain", "snow", "cloud", "star", "moon", "sun", "thunder",
]

def main():
    script_dir = Path(__file__).parent
    data_dir = script_dir.parent / 'server' / 'data'
    data_dir.mkdir(parents=True, exist_ok=True)

    output_path = data_dir / 'secret-words.json'

    # Remove duplicates while preserving order
    seen = set()
    unique_words = []
    for word in SECRET_WORDS:
        if word not in seen:
            seen.add(word)
            unique_words.append(word)

    with open(output_path, 'w') as f:
        json.dump(unique_words, f, indent=2)

    print(f"Generated {len(unique_words)} secret words at {output_path}")


if __name__ == '__main__':
    main()
