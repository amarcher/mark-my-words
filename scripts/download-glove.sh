#!/bin/bash
# Download GloVe 6B embeddings (100d)
# These are used to pre-compute word similarity rankings

set -e

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
DATA_DIR="$SCRIPT_DIR/../server/data"
GLOVE_DIR="$DATA_DIR/glove"

mkdir -p "$GLOVE_DIR"

if [ -f "$GLOVE_DIR/glove.6B.100d.txt" ]; then
    echo "GloVe embeddings already downloaded."
    exit 0
fi

echo "Downloading GloVe 6B embeddings (~822MB zip)..."
curl -L -o "$GLOVE_DIR/glove.6B.zip" "https://nlp.stanford.edu/data/glove.6B.zip"

echo "Extracting 100d vectors..."
unzip -j "$GLOVE_DIR/glove.6B.zip" "glove.6B.100d.txt" -d "$GLOVE_DIR"

echo "Cleaning up zip..."
rm "$GLOVE_DIR/glove.6B.zip"

echo "Done! GloVe vectors at: $GLOVE_DIR/glove.6B.100d.txt"
