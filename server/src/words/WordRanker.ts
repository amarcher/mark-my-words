import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '../../data');

export class WordRanker {
  private rankings: Map<string, number> = new Map();
  private secretWord: string = '';
  private vocabulary: Set<string> = new Set();

  constructor() {
    this.loadVocabulary();
  }

  private loadVocabulary(): void {
    const vocabPath = join(DATA_DIR, 'vocabulary.txt');
    if (existsSync(vocabPath)) {
      const content = readFileSync(vocabPath, 'utf-8');
      for (const line of content.split('\n')) {
        const word = line.trim().toLowerCase();
        if (word) this.vocabulary.add(word);
      }
    }
  }

  loadRankings(secretWord: string): boolean {
    // Prefer LLM-tiered hybrid, fall back to Ollama embeddings, then legacy GloVe.
    const candidates = ['rankings-hybrid', 'rankings-ollama', 'rankings'];
    const filePath = candidates
      .map(dir => join(DATA_DIR, dir, `${secretWord}.json`))
      .find(p => existsSync(p));

    if (!filePath) {
      console.error(`Rankings file not found for secret word: ${secretWord}`);
      return false;
    }

    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, number>;
    this.rankings = new Map(Object.entries(data));
    this.secretWord = secretWord;

    // Add all ranked words to vocabulary
    for (const word of this.rankings.keys()) {
      this.vocabulary.add(word);
    }

    return true;
  }

  getRank(word: string): number | null {
    const normalized = word.toLowerCase().trim();
    if (normalized === this.secretWord) return 1;
    const rank = this.rankings.get(normalized);
    if (rank !== undefined) return rank;

    // Word is valid English-looking but not in our rankings — assign a far rank
    // based on a hash so the same word always gets the same rank
    if (this.isValidWord(normalized)) {
      let hash = 0;
      for (let i = 0; i < normalized.length; i++) {
        hash = ((hash << 5) - hash + normalized.charCodeAt(i)) | 0;
      }
      // Place unranked words between 5000-50000
      return 5000 + (Math.abs(hash) % 45000);
    }

    return null;
  }

  isValidWord(word: string): boolean {
    const normalized = word.toLowerCase().trim();
    // Accept any alphabetic word of reasonable length
    return /^[a-z]{2,30}$/.test(normalized);
  }

  getWordInRange(minRank: number, maxRank: number, exclude?: Set<string>): { word: string; rank: number } | null {
    const candidates: { word: string; rank: number }[] = [];
    for (const [word, rank] of this.rankings) {
      if (rank >= minRank && rank <= maxRank && (!exclude || !exclude.has(word))) {
        candidates.push({ word, rank });
      }
    }
    if (candidates.length === 0) return null;
    return candidates[Math.floor(Math.random() * candidates.length)];
  }

  getInitialHint(): { word: string; rank: number } | null {
    const filePath = join(DATA_DIR, 'initial-hints.json');
    if (!existsSync(filePath)) return null;
    const data = JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, { word: string; rank: number }>;
    return data[this.secretWord] ?? null;
  }

  getBridges(): Record<string, string[]> {
    const filePath = join(DATA_DIR, 'bridges', `${this.secretWord}.json`);
    if (!existsSync(filePath)) return {};
    return JSON.parse(readFileSync(filePath, 'utf-8')) as Record<string, string[]>;
  }

  getSecretWord(): string {
    return this.secretWord;
  }

  static getAvailableSecretWords(): string[] {
    // Union across all ranking sources (hybrid wins, ollama covers any gaps).
    const dirs = ['rankings-hybrid', 'rankings-ollama', 'rankings'];
    const seen = new Set<string>();
    for (const dir of dirs) {
      const path = join(DATA_DIR, dir);
      if (!existsSync(path)) continue;
      for (const f of readdirSync(path)) {
        if (f.endsWith('.json')) seen.add(f.replace('.json', ''));
      }
    }
    return Array.from(seen);
  }

  static pickRandomSecretWord(exclude: string[] = []): string | null {
    const available = this.getAvailableSecretWords().filter(w => !exclude.includes(w));
    if (available.length === 0) return null;
    return available[Math.floor(Math.random() * available.length)];
  }
}
