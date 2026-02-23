import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { AccoladeEngine } from './AccoladeEngine.js';
import type { GuessResult } from '@mmw/shared';

function makeGuess(overrides: Partial<GuessResult> = {}): GuessResult {
  return {
    playerId: 'p1',
    playerName: 'Alice',
    word: 'test',
    rank: 500,
    points: 300,
    wasFirst: false,
    ...overrides,
  };
}

describe('AccoladeEngine', () => {
  let engine: AccoladeEngine;
  let randomSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    engine = new AccoladeEngine();
    // Always pick first template for determinism
    randomSpy = vi.spyOn(Math, 'random').mockReturnValue(0);
  });

  afterEach(() => {
    randomSpy.mockRestore();
  });

  describe('generateAccolades', () => {
    it('returns empty array for no guesses', () => {
      expect(engine.generateAccolades([], 1)).toEqual([]);
    });

    it('always includes "closest" accolade', () => {
      const guesses = [makeGuess({ rank: 100 })];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'closest')).toBe(true);
    });

    it('closest accolade picks the lowest rank guess', () => {
      const guesses = [
        makeGuess({ playerId: 'p1', playerName: 'Alice', rank: 500 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 50 }),
      ];
      const accolades = engine.generateAccolades(guesses, 1);
      const closest = accolades.find(a => a.type === 'closest');
      expect(closest?.playerId).toBe('p2');
      expect(closest?.isPositive).toBe(true);
    });

    it('generates galaxy_brain when best rank is 2-10', () => {
      const guesses = [makeGuess({ rank: 5 })];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'galaxy_brain')).toBe(true);
    });

    it('generates galaxy_brain for rank 2 (lower boundary)', () => {
      const guesses = [makeGuess({ rank: 2 })];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'galaxy_brain')).toBe(true);
    });

    it('generates galaxy_brain for rank 10 (upper boundary)', () => {
      const guesses = [makeGuess({ rank: 10 })];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'galaxy_brain')).toBe(true);
    });

    it('does NOT generate galaxy_brain for rank 1', () => {
      const guesses = [makeGuess({ rank: 1 })];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'galaxy_brain')).toBe(false);
    });

    it('does NOT generate galaxy_brain for rank 11', () => {
      const guesses = [makeGuess({ rank: 11 })];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'galaxy_brain')).toBe(false);
    });

    it('generates worst accolade only with 2+ players', () => {
      const guesses = [
        makeGuess({ playerId: 'p1', rank: 50 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 5000 }),
      ];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'worst')).toBe(true);
      const worst = accolades.find(a => a.type === 'worst');
      expect(worst?.playerId).toBe('p2');
      expect(worst?.isPositive).toBe(false);
    });

    it('does NOT generate worst with only 1 player', () => {
      const guesses = [makeGuess({ rank: 5000 })];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'worst')).toBe(false);
    });

    it('generates brave_explorer when rank > 10000', () => {
      const guesses = [
        makeGuess({ playerId: 'p1', rank: 50 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 15000 }),
      ];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'brave_explorer')).toBe(true);
    });

    it('does NOT generate brave_explorer when rank <= 10000', () => {
      const guesses = [
        makeGuess({ playerId: 'p1', rank: 50 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 10000 }),
      ];
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'brave_explorer')).toBe(false);
    });

    it('generates biggest_leap when improvement > 50 in round 2+', () => {
      // Round 1 history
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 500 })]);
      // Round 2 guess
      const guesses = [makeGuess({ playerId: 'p1', rank: 100 })];
      engine.recordRound(guesses);
      const accolades = engine.generateAccolades(guesses, 2);
      expect(accolades.some(a => a.type === 'biggest_leap')).toBe(true);
    });

    it('does NOT generate biggest_leap in round 1', () => {
      const guesses = [makeGuess({ rank: 100 })];
      engine.recordRound(guesses);
      const accolades = engine.generateAccolades(guesses, 1);
      expect(accolades.some(a => a.type === 'biggest_leap')).toBe(false);
    });

    it('does NOT generate biggest_leap when improvement <= 50', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 500 })]);
      const guesses = [makeGuess({ playerId: 'p1', rank: 460 })];
      engine.recordRound(guesses);
      const accolades = engine.generateAccolades(guesses, 2);
      expect(accolades.some(a => a.type === 'biggest_leap')).toBe(false);
    });

    it('generates on_fire after 3 consecutive improving rounds', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 300 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      const round3 = [makeGuess({ playerId: 'p1', rank: 100 })];
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      expect(accolades.some(a => a.type === 'on_fire')).toBe(true);
    });

    it('does NOT generate on_fire with only 2 rounds', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 300 })]);
      const round2 = [makeGuess({ playerId: 'p1', rank: 200 })];
      engine.recordRound(round2);
      const accolades = engine.generateAccolades(round2, 2);
      expect(accolades.some(a => a.type === 'on_fire')).toBe(false);
    });

    it('does NOT generate on_fire when not strictly improving', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 300 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      const round3 = [makeGuess({ playerId: 'p1', rank: 200 })]; // same, not improving
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      expect(accolades.some(a => a.type === 'on_fire')).toBe(false);
    });

    it('generates ice_cold after 3 consecutive worsening rounds', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 100 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      const round3 = [makeGuess({ playerId: 'p1', rank: 300 })];
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      expect(accolades.some(a => a.type === 'ice_cold')).toBe(true);
    });

    it('does NOT generate ice_cold when not strictly worsening', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 100 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      const round3 = [makeGuess({ playerId: 'p1', rank: 200 })]; // same, not worsening
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      expect(accolades.some(a => a.type === 'ice_cold')).toBe(false);
    });

    it('ice_cold isPositive is false', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 100 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      const round3 = [makeGuess({ playerId: 'p1', rank: 300 })];
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      const iceCold = accolades.find(a => a.type === 'ice_cold');
      expect(iceCold?.isPositive).toBe(false);
    });
  });

  describe('selectBestAccolades (via generateAccolades)', () => {
    it('returns at most 3 accolades', () => {
      // Create scenario that generates many accolades
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 300 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      const round3 = [
        makeGuess({ playerId: 'p1', rank: 5 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 15000 }),
      ];
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      expect(accolades.length).toBeLessThanOrEqual(3);
    });

    it('includes both positive and negative when available', () => {
      const guesses = [
        makeGuess({ playerId: 'p1', rank: 5 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 15000 }),
      ];
      const accolades = engine.generateAccolades(guesses, 1);
      const hasPositive = accolades.some(a => a.isPositive);
      const hasNegative = accolades.some(a => !a.isPositive);
      expect(hasPositive).toBe(true);
      expect(hasNegative).toBe(true);
    });

    it('returns fewer than 3 when fewer are generated', () => {
      const guesses = [makeGuess({ rank: 500 })];
      const accolades = engine.generateAccolades(guesses, 1);
      // Single player, middling rank = just closest
      expect(accolades.length).toBe(1);
    });
  });

  describe('rekeyPlayer', () => {
    it('transfers history to new ID', () => {
      engine.recordRound([makeGuess({ playerId: 'old-id', rank: 300 })]);
      engine.recordRound([makeGuess({ playerId: 'old-id', rank: 200 })]);
      engine.rekeyPlayer('old-id', 'new-id');

      // Record a third round under new ID and check on_fire works
      const round3 = [makeGuess({ playerId: 'new-id', rank: 100 })];
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      expect(accolades.some(a => a.type === 'on_fire')).toBe(true);
    });

    it('is a no-op for unknown player ID', () => {
      engine.rekeyPlayer('nonexistent', 'new-id');
      // Should not throw
    });
  });

  describe('recordRound', () => {
    it('accumulates history per player', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 300 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 100 })]);
      // Verify by checking on_fire triggers
      const round3 = [makeGuess({ playerId: 'p1', rank: 100 })];
      const accolades = engine.generateAccolades(round3, 3);
      // on_fire uses existing history, not the passed guesses
      // After 3 records: [300, 200, 100] — strictly improving
      expect(accolades.some(a => a.type === 'on_fire')).toBe(true);
    });

    it('tracks multiple players independently', () => {
      engine.recordRound([
        makeGuess({ playerId: 'p1', rank: 300 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 100 }),
      ]);
      engine.recordRound([
        makeGuess({ playerId: 'p1', rank: 200 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 200 }),
      ]);
      const round3 = [
        makeGuess({ playerId: 'p1', rank: 100 }),
        makeGuess({ playerId: 'p2', playerName: 'Bob', rank: 300 }),
      ];
      engine.recordRound(round3);
      const accolades = engine.generateAccolades(round3, 3);
      // p1: 300 → 200 → 100 = on_fire candidate
      // p2: 100 → 200 → 300 = ice_cold candidate
      // selectBestAccolades caps at 3, so not all may survive,
      // but both players should have accolades generated
      const playerIds = new Set(accolades.map(a => a.playerId));
      expect(playerIds.has('p1')).toBe(true);
      expect(playerIds.has('p2')).toBe(true);
      // Verify ice_cold specifically (negative, so it's prioritized by selection)
      expect(accolades.some(a => a.type === 'ice_cold')).toBe(true);
    });
  });

  describe('reset', () => {
    it('clears all player histories', () => {
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 300 })]);
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 200 })]);
      engine.reset();
      engine.recordRound([makeGuess({ playerId: 'p1', rank: 100 })]);
      // Only 1 round of history now, on_fire needs 3
      const round = [makeGuess({ playerId: 'p1', rank: 100 })];
      const accolades = engine.generateAccolades(round, 3);
      expect(accolades.some(a => a.type === 'on_fire')).toBe(false);
    });
  });
});
