#!/usr/bin/env python3
"""
Generate synthetic dev ranking data so the game is playable without GloVe.
Creates rankings for a handful of secret words using hand-crafted similarity tiers.
"""

import json
import os
import random
from pathlib import Path

# For each secret word, define tiers of related words (closer = lower rank)
DEV_WORDS = {
    "dog": {
        "very_close": ["puppy", "canine", "hound", "pup", "terrier", "retriever", "spaniel", "poodle", "beagle", "labrador"],
        "close": ["cat", "pet", "bark", "leash", "kennel", "fetch", "bone", "collar", "tail", "paw", "wolf", "fur", "breed", "vet", "walk", "loyal", "domesticated", "mutt", "shelter", "adopt", "wag", "sniff", "howl", "whimper", "growl", "bite", "lick", "obedient", "treat", "toy"],
        "medium": ["animal", "mammal", "companion", "friend", "house", "yard", "park", "grass", "ball", "stick", "chase", "run", "play", "love", "family", "warm", "soft", "fluffy", "cute", "friendly", "rabbit", "hamster", "fish", "bird", "horse", "farm", "wild", "nature", "creature", "owner", "food", "water", "sleep", "bed", "happy", "nose", "ear", "leg", "teeth", "tongue"],
        "far": ["car", "book", "phone", "computer", "table", "chair", "music", "dance", "cook", "paint", "building", "city", "sky", "ocean", "mountain", "tree", "flower", "rain", "snow", "fire", "rock", "metal", "glass", "paper", "plastic", "wood", "stone", "earth", "moon", "star", "light", "dark", "cold", "hot", "fast", "slow", "big", "small", "old", "new"],
    },
    "ocean": {
        "very_close": ["sea", "marine", "atlantic", "pacific", "waters", "seawater", "saltwater", "maritime", "oceanic", "tidal"],
        "close": ["wave", "tide", "shore", "coast", "beach", "deep", "fish", "whale", "shark", "coral", "reef", "ship", "boat", "sail", "island", "current", "surf", "swim", "dive", "underwater", "seaweed", "shell", "sand", "dolphin", "jellyfish", "squid", "crab", "lobster", "anchor", "harbor"],
        "medium": ["water", "lake", "river", "pond", "stream", "blue", "vast", "horizon", "storm", "wind", "rain", "cloud", "sky", "sun", "salt", "wet", "cold", "ice", "arctic", "tropical", "nature", "earth", "planet", "world", "travel", "explore", "adventure", "voyage", "captain", "pirate", "treasure", "map", "lighthouse", "port", "dock", "cliff", "rock", "cave", "bay", "gulf"],
        "far": ["dog", "cat", "book", "phone", "computer", "chair", "table", "music", "dance", "paint", "building", "factory", "office", "school", "hospital", "church", "castle", "tower", "bridge", "road", "car", "train", "bus", "bike", "shoe", "hat", "dress", "ring", "clock", "mirror", "lamp", "bed", "door", "wall", "floor", "roof", "garden", "farm", "field", "forest"],
    },
    "fire": {
        "very_close": ["flame", "blaze", "burn", "inferno", "combustion", "bonfire", "wildfire", "fiery", "ignite", "ember"],
        "close": ["smoke", "ash", "heat", "hot", "warm", "torch", "candle", "fireplace", "furnace", "oven", "stove", "match", "lighter", "fuel", "wood", "coal", "charcoal", "grill", "roast", "sizzle", "spark", "flicker", "glow", "red", "orange", "firefighter", "alarm", "extinguisher", "hydrant", "arson"],
        "medium": ["light", "energy", "power", "sun", "lava", "volcano", "explosion", "bomb", "destroy", "damage", "danger", "emergency", "rescue", "water", "earth", "air", "element", "nature", "camp", "outdoor", "night", "dark", "bright", "intense", "fierce", "wild", "rage", "anger", "passion", "desire", "love", "heart", "spirit", "dragon", "phoenix", "hell", "devil", "cook", "kitchen", "temperature"],
        "far": ["ice", "snow", "cold", "freeze", "winter", "ocean", "fish", "book", "phone", "computer", "chair", "table", "music", "dance", "paint", "school", "hospital", "church", "castle", "bridge", "car", "train", "shoe", "hat", "dress", "ring", "clock", "mirror", "lamp", "bed", "door", "wall", "floor", "garden", "farm", "field", "forest", "quiet", "gentle", "peace"],
    },
    "music": {
        "very_close": ["song", "melody", "rhythm", "harmony", "tune", "musical", "soundtrack", "hymn", "ballad", "anthem"],
        "close": ["guitar", "piano", "drum", "violin", "bass", "singer", "band", "orchestra", "concert", "album", "record", "play", "listen", "hear", "sound", "note", "chord", "beat", "tempo", "jazz", "rock", "pop", "classical", "hip", "rap", "blues", "folk", "country", "soul", "disco"],
        "medium": ["dance", "party", "club", "stage", "performance", "artist", "creative", "art", "compose", "write", "lyric", "voice", "microphone", "speaker", "radio", "headphone", "instrument", "practice", "talent", "famous", "celebrity", "tour", "festival", "audience", "crowd", "fan", "emotion", "feeling", "joy", "love", "sad", "happy", "express", "culture", "entertainment", "movie", "theater", "opera", "choir", "worship"],
        "far": ["dog", "cat", "ocean", "fire", "book", "phone", "computer", "chair", "table", "building", "factory", "office", "school", "hospital", "car", "train", "shoe", "hat", "dress", "ring", "clock", "mirror", "lamp", "bed", "door", "wall", "floor", "garden", "farm", "field", "forest", "mountain", "river", "rain", "snow", "stone", "metal", "glass", "paper", "plastic"],
    },
    "hospital": {
        "very_close": ["clinic", "medical", "healthcare", "infirmary", "ward", "surgical", "emergency", "ambulance", "hospitalize", "icu"],
        "close": ["doctor", "nurse", "patient", "surgery", "medicine", "health", "sick", "ill", "disease", "treatment", "cure", "diagnose", "pharmacy", "prescription", "injection", "vaccine", "blood", "organ", "heart", "brain", "bone", "wound", "injury", "pain", "fever", "infection", "recovery", "therapy", "bed", "stretcher"],
        "medium": ["building", "room", "care", "help", "life", "death", "birth", "baby", "old", "wheelchair", "crutch", "bandage", "cast", "needle", "stethoscope", "mask", "glove", "gown", "sterile", "clean", "white", "science", "research", "test", "lab", "exam", "xray", "scan", "insurance", "cost", "visit", "family", "waiting", "anxiety", "fear", "hope", "pray", "staff", "volunteer", "charity"],
        "far": ["dog", "cat", "ocean", "fire", "music", "guitar", "dance", "party", "game", "sport", "ball", "car", "train", "shoe", "hat", "dress", "ring", "clock", "mirror", "lamp", "garden", "farm", "field", "forest", "mountain", "river", "rain", "snow", "stone", "metal", "glass", "paper", "plastic", "wood", "paint", "color", "food", "cook", "eat", "drink"],
    },
    "book": {
        "very_close": ["novel", "textbook", "paperback", "hardcover", "volume", "manuscript", "publication", "bookstore", "bookshelf", "ebook"],
        "close": ["read", "write", "page", "chapter", "author", "story", "fiction", "literature", "library", "publish", "print", "cover", "title", "word", "sentence", "paragraph", "text", "reader", "writer", "editor", "poem", "essay", "journal", "diary", "biography", "memoir", "tale", "plot", "character", "genre"],
        "medium": ["paper", "pen", "ink", "learn", "study", "school", "education", "knowledge", "wisdom", "information", "language", "english", "history", "science", "art", "imagination", "fantasy", "adventure", "mystery", "romance", "drama", "horror", "magazine", "newspaper", "article", "blog", "document", "file", "shelf", "desk", "lamp", "quiet", "mind", "think", "idea", "dream", "inspire", "creative", "culture", "intellectual"],
        "far": ["dog", "cat", "ocean", "fire", "music", "guitar", "dance", "sport", "ball", "car", "train", "shoe", "hat", "dress", "ring", "clock", "mirror", "bed", "door", "wall", "floor", "garden", "farm", "field", "forest", "mountain", "river", "rain", "snow", "stone", "metal", "glass", "plastic", "wood", "food", "cook", "eat", "drink", "swim", "fly"],
    },
    "pizza": {
        "very_close": ["pepperoni", "mozzarella", "calzone", "slice", "crust", "topping", "marinara", "pizzeria", "dough", "oven"],
        "close": ["cheese", "tomato", "bread", "italian", "delivery", "restaurant", "menu", "order", "eat", "hungry", "delicious", "tasty", "food", "meal", "dinner", "lunch", "snack", "fast", "box", "plate", "fork", "napkin", "sauce", "garlic", "basil", "mushroom", "olive", "onion", "sausage", "bacon"],
        "medium": ["cook", "bake", "kitchen", "chef", "recipe", "ingredient", "flour", "yeast", "salt", "oil", "hot", "warm", "party", "share", "friend", "family", "movie", "night", "friday", "weekend", "comfort", "favorite", "popular", "cheap", "quick", "easy", "round", "flat", "cut", "serve", "tip", "coupon", "special", "large", "medium", "small", "extra", "side", "drink", "soda"],
        "far": ["dog", "cat", "ocean", "fire", "music", "guitar", "dance", "car", "train", "shoe", "hat", "dress", "ring", "clock", "mirror", "lamp", "bed", "door", "wall", "floor", "garden", "farm", "field", "forest", "mountain", "river", "rain", "snow", "stone", "metal", "glass", "paper", "plastic", "wood", "paint", "color", "book", "phone", "computer", "hospital"],
    },
    "castle": {
        "very_close": ["fortress", "palace", "citadel", "stronghold", "dungeon", "turret", "drawbridge", "moat", "tower", "battlements"],
        "close": ["king", "queen", "prince", "princess", "knight", "royal", "throne", "crown", "sword", "shield", "armor", "medieval", "kingdom", "empire", "lord", "lady", "noble", "court", "guard", "soldier", "siege", "wall", "gate", "stone", "brick", "arch", "hall", "chamber", "staircase", "banner"],
        "medium": ["history", "ancient", "old", "war", "battle", "power", "rule", "govern", "land", "territory", "dragon", "fairy", "tale", "legend", "myth", "magic", "treasure", "gold", "rich", "wealth", "church", "cathedral", "temple", "monument", "ruins", "heritage", "tourism", "england", "europe", "scotland", "ireland", "france", "germany", "gothic", "romantic", "beautiful", "grand", "magnificent", "imposing", "dark"],
        "far": ["dog", "cat", "ocean", "fire", "music", "guitar", "dance", "car", "train", "shoe", "hat", "dress", "ring", "clock", "mirror", "lamp", "bed", "phone", "computer", "pizza", "food", "cook", "eat", "drink", "swim", "fly", "book", "read", "write", "school", "hospital", "doctor", "nurse", "sport", "ball", "game", "play", "garden", "farm", "field"],
    },
    "diamond": {
        "very_close": ["gem", "jewel", "gemstone", "carat", "brilliant", "sparkle", "crystal", "ruby", "emerald", "sapphire"],
        "close": ["ring", "necklace", "jewelry", "gold", "silver", "platinum", "precious", "valuable", "expensive", "luxury", "wealth", "rich", "mine", "carbon", "hard", "cut", "polish", "facet", "clarity", "engagement", "wedding", "proposal", "love", "romance", "gift", "present", "birthday", "anniversary", "treasure", "rare"],
        "medium": ["stone", "rock", "mineral", "earth", "dig", "underground", "cave", "natural", "beauty", "shine", "bright", "light", "glass", "clear", "transparent", "ice", "crown", "queen", "king", "royal", "museum", "display", "collection", "auction", "price", "market", "trade", "export", "africa", "industry", "tool", "drill", "blade", "pressure", "formation", "geology", "science", "baseball", "card", "shape"],
        "far": ["dog", "cat", "ocean", "fire", "music", "guitar", "dance", "car", "train", "shoe", "hat", "dress", "clock", "mirror", "lamp", "bed", "phone", "computer", "pizza", "food", "cook", "eat", "drink", "swim", "fly", "book", "read", "write", "school", "hospital", "doctor", "nurse", "sport", "ball", "game", "play", "garden", "farm", "field", "forest"],
    },
    "dream": {
        "very_close": ["nightmare", "sleep", "dreaming", "slumber", "subconscious", "vision", "reverie", "fantasy", "illusion", "hallucination"],
        "close": ["bed", "night", "pillow", "rest", "nap", "awake", "wake", "unconscious", "imagine", "wish", "hope", "desire", "goal", "aspire", "ambition", "future", "mind", "brain", "thought", "memory", "surreal", "strange", "weird", "vivid", "lucid", "symbol", "meaning", "interpret", "psychology", "freud"],
        "medium": ["eye", "close", "dark", "quiet", "peace", "calm", "relax", "float", "fly", "fall", "chase", "escape", "fear", "joy", "love", "adventure", "world", "reality", "fiction", "story", "movie", "art", "creative", "inspire", "beautiful", "magical", "wonder", "mystery", "cloud", "star", "moon", "sky", "heaven", "angel", "spirit", "soul", "consciousness", "meditation", "therapy", "journal"],
        "far": ["dog", "cat", "ocean", "fire", "music", "guitar", "dance", "car", "train", "shoe", "hat", "dress", "ring", "clock", "mirror", "lamp", "phone", "computer", "pizza", "food", "cook", "eat", "drink", "swim", "book", "write", "school", "hospital", "doctor", "nurse", "sport", "ball", "game", "garden", "farm", "field", "forest", "mountain", "river", "stone"],
    },
}

# Extra filler words to pad vocabulary
FILLER_WORDS = [
    "the", "be", "to", "of", "and", "in", "that", "have", "it", "for",
    "not", "on", "with", "he", "as", "you", "do", "at", "this", "but",
    "his", "by", "from", "they", "we", "say", "her", "she", "or", "an",
    "will", "my", "one", "all", "would", "there", "their", "what", "so",
    "up", "out", "if", "about", "who", "get", "which", "go", "me",
    "when", "make", "can", "like", "time", "no", "just", "him", "know",
    "take", "people", "into", "year", "your", "good", "some", "could",
    "them", "see", "other", "than", "then", "now", "look", "only",
    "come", "its", "over", "think", "also", "back", "after", "use",
    "two", "how", "our", "work", "first", "well", "way", "even",
    "want", "because", "any", "these", "give", "day", "most",
    "purple", "yellow", "green", "blue", "brown", "black", "white",
    "gray", "pink", "orange", "tall", "short", "wide", "narrow",
    "thick", "thin", "heavy", "empty", "full", "open", "closed",
    "above", "below", "inside", "outside", "near", "north", "south",
    "east", "west", "left", "right", "front", "behind", "between",
    "through", "during", "before", "after", "until", "while",
    "monday", "tuesday", "wednesday", "thursday", "friday", "saturday", "sunday",
    "january", "february", "march", "april", "may", "june", "july",
    "august", "september", "october", "november", "december",
    "zero", "three", "four", "five", "six", "seven", "eight", "nine", "ten",
    "hundred", "thousand", "million", "billion",
    "mother", "father", "sister", "brother", "daughter", "son", "aunt",
    "uncle", "cousin", "grandmother", "grandfather", "husband", "wife",
    "teacher", "student", "professor", "scientist", "engineer", "lawyer",
    "soldier", "artist", "writer", "actor", "athlete", "politician",
    "president", "minister", "judge", "police", "detective", "spy",
    "robot", "machine", "engine", "wheel", "wire", "battery", "screen",
    "keyboard", "mouse", "printer", "camera", "television", "satellite",
    "rocket", "airplane", "helicopter", "submarine", "tank", "weapon",
    "knife", "gun", "arrow", "cannon", "missile", "grenade",
    "apple", "banana", "grape", "lemon", "peach", "strawberry", "cherry",
    "pear", "plum", "watermelon", "pineapple", "coconut", "mango",
    "potato", "carrot", "broccoli", "spinach", "lettuce", "corn",
    "bean", "pea", "pepper", "cucumber", "celery", "cabbage",
    "chicken", "beef", "pork", "lamb", "turkey", "shrimp", "salmon",
    "butter", "cream", "milk", "egg", "sugar", "honey", "vinegar",
    "shirt", "pants", "jacket", "coat", "sweater", "sock", "boot",
    "scarf", "tie", "belt", "glove", "umbrella", "bag", "wallet",
    "pencil", "crayon", "brush", "canvas", "frame", "sculpture",
    "photograph", "portrait", "landscape", "abstract", "gallery",
    "football", "basketball", "baseball", "soccer", "tennis", "golf",
    "hockey", "boxing", "wrestling", "skiing", "skating", "surfing",
    "running", "jumping", "throwing", "catching", "kicking", "hitting",
    "winning", "losing", "score", "team", "coach", "referee", "trophy",
    "medal", "champion", "league", "tournament", "match", "race",
    "spring", "summer", "autumn", "winter", "morning", "afternoon",
    "evening", "midnight", "dawn", "dusk", "sunrise", "sunset",
    "yesterday", "today", "tomorrow", "forever", "never", "always",
    "sometimes", "often", "rarely", "usually", "probably", "maybe",
    "certainly", "absolutely", "definitely", "perhaps", "possibly",
    "electricity", "gravity", "oxygen", "hydrogen", "nitrogen",
    "photograph", "telephone", "internet", "website", "software",
    "hardware", "program", "algorithm", "database", "network",
    "virus", "bacteria", "cell", "molecule", "atom", "electron",
    "proton", "neutron", "particle", "quantum", "relativity",
    "galaxy", "universe", "planet", "comet", "asteroid", "meteor",
    "nebula", "constellation", "telescope", "microscope",
    "democracy", "freedom", "justice", "equality", "liberty",
    "revolution", "independence", "constitution", "parliament",
    "election", "vote", "campaign", "debate", "policy", "reform",
    "economy", "inflation", "recession", "investment", "stock",
    "market", "currency", "dollar", "profit", "loss", "tax",
    "budget", "debt", "loan", "mortgage", "credit", "savings",
    "piano", "violin", "trumpet", "flute", "clarinet", "saxophone",
    "harmonica", "accordion", "banjo", "mandolin", "harp", "cello",
    "symphony", "concerto", "sonata", "prelude", "overture",
]


def generate_rankings(secret_word, tiers):
    """Generate rankings from tier definitions."""
    rankings = {}
    rank = 2  # 1 is the secret word itself

    for word in tiers.get("very_close", []):
        rankings[word] = rank
        rank += 1

    # close: ranks ~12-50
    for word in tiers.get("close", []):
        rankings[word] = rank
        rank += random.randint(1, 2)

    # medium: ranks ~50-500
    rank = max(rank, 50)
    for word in tiers.get("medium", []):
        rankings[word] = rank
        rank += random.randint(5, 15)

    # far: ranks ~1000-5000
    rank = max(rank, 1000)
    for word in tiers.get("far", []):
        rankings[word] = rank
        rank += random.randint(20, 100)

    # Add filler words at very far ranks
    rank = max(rank, 5000)
    for word in FILLER_WORDS:
        if word not in rankings and word != secret_word:
            rankings[word] = rank
            rank += random.randint(10, 50)

    return rankings


def main():
    random.seed(42)

    script_dir = Path(__file__).parent
    data_dir = script_dir.parent / 'server' / 'data'
    rankings_dir = data_dir / 'rankings'
    rankings_dir.mkdir(parents=True, exist_ok=True)

    # Generate secret words list
    secret_words = list(DEV_WORDS.keys())
    with open(data_dir / 'secret-words.json', 'w') as f:
        json.dump(secret_words, f, indent=2)
    print(f"Generated {len(secret_words)} secret words")

    # Generate rankings for each word
    all_vocab = set()
    for word, tiers in DEV_WORDS.items():
        print(f"  Generating rankings for '{word}'...")
        rankings = generate_rankings(word, tiers)
        all_vocab.update(rankings.keys())
        all_vocab.add(word)

        with open(rankings_dir / f'{word}.json', 'w') as f:
            json.dump(rankings, f)
        print(f"    {len(rankings)} words ranked")

    # Generate vocabulary file
    with open(data_dir / 'vocabulary.txt', 'w') as f:
        f.write('\n'.join(sorted(all_vocab)))
    print(f"\nGenerated vocabulary with {len(all_vocab)} words")
    print("Done! Dev data is ready.")


if __name__ == '__main__':
    main()
