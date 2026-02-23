import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fs before importing WordRanker
vi.mock('fs', () => ({
  readFileSync: vi.fn(),
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
}));

import { readFileSync, existsSync, readdirSync } from 'fs';
import { WordRanker } from './WordRanker.js';

const mockReadFileSync = vi.mocked(readFileSync);
const mockExistsSync = vi.mocked(existsSync);
const mockReaddirSync = vi.mocked(readdirSync);

describe('WordRanker', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Default: vocabulary file exists with a few words
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockImplementation((path: unknown) => {
      if (typeof path === 'string' && path.includes('vocabulary.txt')) {
        return 'apple\nbanana\ncherry\ndog\ncat\n';
      }
      return '';
    });
  });

  describe('isValidWord', () => {
    let ranker: WordRanker;

    beforeEach(() => {
      ranker = new WordRanker();
    });

    it('accepts lowercase alpha word', () => {
      expect(ranker.isValidWord('hello')).toBe(true);
    });

    it('accepts uppercase word (normalized)', () => {
      expect(ranker.isValidWord('HELLO')).toBe(true);
    });

    it('accepts mixed case word', () => {
      expect(ranker.isValidWord('Hello')).toBe(true);
    });

    it('accepts 2-char word (minimum)', () => {
      expect(ranker.isValidWord('ab')).toBe(true);
    });

    it('accepts 30-char word (maximum)', () => {
      expect(ranker.isValidWord('a'.repeat(30))).toBe(true);
    });

    it('rejects single character', () => {
      expect(ranker.isValidWord('a')).toBe(false);
    });

    it('rejects empty string', () => {
      expect(ranker.isValidWord('')).toBe(false);
    });

    it('rejects word with numbers', () => {
      expect(ranker.isValidWord('hello123')).toBe(false);
    });

    it('rejects word with spaces', () => {
      expect(ranker.isValidWord('hello world')).toBe(false);
    });

    it('rejects word with hyphens', () => {
      expect(ranker.isValidWord('well-known')).toBe(false);
    });

    it('rejects word longer than 30 chars', () => {
      expect(ranker.isValidWord('a'.repeat(31))).toBe(false);
    });

    it('rejects word with special characters', () => {
      expect(ranker.isValidWord("don't")).toBe(false);
    });
  });

  describe('getRank', () => {
    let ranker: WordRanker;

    beforeEach(() => {
      ranker = new WordRanker();
      // Load rankings for "apple"
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('apple.json')) {
          return JSON.stringify({ banana: 50, cherry: 200, dog: 1000 });
        }
        if (typeof path === 'string' && path.includes('vocabulary.txt')) {
          return 'apple\nbanana\ncherry\ndog\ncat\n';
        }
        return '';
      });
      ranker.loadRankings('apple');
    });

    it('returns 1 for the secret word', () => {
      expect(ranker.getRank('apple')).toBe(1);
    });

    it('returns 1 for secret word regardless of case', () => {
      expect(ranker.getRank('APPLE')).toBe(1);
    });

    it('returns exact rank from rankings data', () => {
      expect(ranker.getRank('banana')).toBe(50);
    });

    it('returns null for invalid word', () => {
      expect(ranker.getRank('abc123')).toBeNull();
    });

    it('returns deterministic hash rank for valid but unranked word', () => {
      const rank1 = ranker.getRank('cat');
      const rank2 = ranker.getRank('cat');
      expect(rank1).toBe(rank2); // deterministic
      expect(rank1).toBeGreaterThanOrEqual(5000);
      expect(rank1).toBeLessThanOrEqual(50000);
    });

    it('returns null for empty string', () => {
      expect(ranker.getRank('')).toBeNull();
    });
  });

  describe('loadRankings', () => {
    it('loads JSON rankings and returns true', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('test.json')) {
          return JSON.stringify({ word1: 10, word2: 20 });
        }
        if (typeof path === 'string' && path.includes('vocabulary.txt')) {
          return '';
        }
        return '';
      });

      const ranker = new WordRanker();
      expect(ranker.loadRankings('test')).toBe(true);
    });

    it('returns false when rankings file is missing', () => {
      mockExistsSync.mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('rankings')) return false;
        return true; // vocabulary exists
      });
      mockReadFileSync.mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('vocabulary.txt')) return '';
        return '';
      });

      const ranker = new WordRanker();
      expect(ranker.loadRankings('nonexistent')).toBe(false);
    });

    it('adds ranked words to vocabulary', () => {
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('fruit.json')) {
          return JSON.stringify({ mango: 10 });
        }
        if (typeof path === 'string' && path.includes('vocabulary.txt')) {
          return ''; // empty vocabulary
        }
        return '';
      });

      const ranker = new WordRanker();
      ranker.loadRankings('fruit');
      // "mango" should now be valid and have exact rank
      expect(ranker.getRank('mango')).toBe(10);
    });
  });

  describe('pickRandomSecretWord', () => {
    it('picks from available secret words', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['apple.json', 'banana.json'] as unknown as ReturnType<typeof readdirSync>);

      const word = WordRanker.pickRandomSecretWord();
      expect(['apple', 'banana']).toContain(word);
    });

    it('excludes specified words', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['apple.json', 'banana.json'] as unknown as ReturnType<typeof readdirSync>);

      const word = WordRanker.pickRandomSecretWord(['apple']);
      expect(word).toBe('banana');
    });

    it('returns null when all words are excluded', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['apple.json'] as unknown as ReturnType<typeof readdirSync>);

      const word = WordRanker.pickRandomSecretWord(['apple']);
      expect(word).toBeNull();
    });

    it('returns null when rankings directory is empty', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue([] as unknown as ReturnType<typeof readdirSync>);

      const word = WordRanker.pickRandomSecretWord();
      expect(word).toBeNull();
    });
  });

  describe('getWordInRange', () => {
    let ranker: WordRanker;

    beforeEach(() => {
      ranker = new WordRanker();
      mockExistsSync.mockReturnValue(true);
      mockReadFileSync.mockImplementation((path: unknown) => {
        if (typeof path === 'string' && path.includes('apple.json')) {
          return JSON.stringify({ banana: 50, cherry: 200, dog: 1000, cat: 5000 });
        }
        if (typeof path === 'string' && path.includes('vocabulary.txt')) {
          return 'apple\nbanana\ncherry\ndog\ncat\n';
        }
        return '';
      });
      ranker.loadRankings('apple');
    });

    it('returns a word within the specified range', () => {
      const result = ranker.getWordInRange(100, 300);
      expect(result).not.toBeNull();
      expect(result!.word).toBe('cherry');
      expect(result!.rank).toBe(200);
    });

    it('returns null when no words in range', () => {
      const result = ranker.getWordInRange(10000, 20000);
      expect(result).toBeNull();
    });

    it('includes words at exact min boundary', () => {
      const result = ranker.getWordInRange(50, 50);
      expect(result).not.toBeNull();
      expect(result!.word).toBe('banana');
    });

    it('includes words at exact max boundary', () => {
      const result = ranker.getWordInRange(1000, 1000);
      expect(result).not.toBeNull();
      expect(result!.word).toBe('dog');
    });

    it('excludes words in the exclude set', () => {
      const result = ranker.getWordInRange(100, 300, new Set(['cherry']));
      expect(result).toBeNull();
    });

    it('returns different word when one is excluded', () => {
      const result = ranker.getWordInRange(40, 250, new Set(['banana']));
      expect(result).not.toBeNull();
      expect(result!.word).toBe('cherry');
    });
  });

  describe('getAvailableSecretWords', () => {
    it('returns word names without .json extension', () => {
      mockExistsSync.mockReturnValue(true);
      mockReaddirSync.mockReturnValue(['apple.json', 'banana.json', 'cherry.json'] as unknown as ReturnType<typeof readdirSync>);

      const words = WordRanker.getAvailableSecretWords();
      expect(words).toEqual(['apple', 'banana', 'cherry']);
    });

    it('returns empty array when directory missing', () => {
      mockExistsSync.mockReturnValue(false);
      const words = WordRanker.getAvailableSecretWords();
      expect(words).toEqual([]);
    });
  });
});
