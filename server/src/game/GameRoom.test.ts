import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { GameState } from '@mmw/shared';
import {
  REVEAL_DISPLAY_TIME,
  ACCOLADES_DISPLAY_TIME,
  SCOREBOARD_DISPLAY_TIME,
  PLAYER_COLORS,
  INITIAL_TEAM_BEST,
  calculateAdvancementScore,
} from '@mmw/shared';

// vi.hoisted runs before vi.mock, so these are available in the factory
const { mockWordRankerInstance, mockPickRandomSecretWord } = vi.hoisted(() => ({
  mockWordRankerInstance: {
    isValidWord: vi.fn().mockReturnValue(true),
    getRank: vi.fn().mockReturnValue(500),
    loadRankings: vi.fn().mockReturnValue(true),
    getSecretWord: vi.fn().mockReturnValue('apple'),
  },
  mockPickRandomSecretWord: vi.fn().mockReturnValue('apple'),
}));

// Mock WordRanker before importing GameRoom
vi.mock('../words/WordRanker.js', () => {
  class MockWordRanker {
    isValidWord = mockWordRankerInstance.isValidWord;
    getRank = mockWordRankerInstance.getRank;
    loadRankings = mockWordRankerInstance.loadRankings;
    getSecretWord = mockWordRankerInstance.getSecretWord;

    static pickRandomSecretWord = mockPickRandomSecretWord;
    static getAvailableSecretWords = vi.fn().mockReturnValue(['apple', 'banana']);
  }
  return { WordRanker: MockWordRanker };
});

import { GameRoom } from './GameRoom.js';

function makeCallbacks() {
  return {
    onStateChange: vi.fn(),
    onTimerTick: vi.fn(),
    onGuessResult: vi.fn(),
    onPlayerSubmitted: vi.fn(),
    onAfkClose: vi.fn(),
  };
}

describe('GameRoom', () => {
  let room: GameRoom;
  let callbacks: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    vi.useFakeTimers();
    vi.clearAllMocks();
    // Reset mock defaults
    mockWordRankerInstance.isValidWord.mockReturnValue(true);
    mockWordRankerInstance.getRank.mockReturnValue(500);
    mockWordRankerInstance.loadRankings.mockReturnValue(true);
    mockWordRankerInstance.getSecretWord.mockReturnValue('apple');
    mockPickRandomSecretWord.mockReturnValue('apple');

    callbacks = makeCallbacks();
    room = new GameRoom('ABCD', callbacks);
  });

  afterEach(() => {
    room.destroy();
    vi.useRealTimers();
  });

  // Helper: add N connected players
  function addPlayers(count: number): string[] {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const id = `player${i}`;
      room.addPlayer(id, `Player${i}`);
      ids.push(id);
    }
    return ids;
  }

  // Helper: start a game with 2 players
  function startGame(): string[] {
    const ids = addPlayers(2);
    room.startGame();
    return ids;
  }

  describe('Player management', () => {
    it('first player becomes leader', () => {
      room.addPlayer('p1', 'Alice');
      expect(room.getLeaderId()).toBe('p1');
    });

    it('second player does not change leader', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      expect(room.getLeaderId()).toBe('p1');
    });

    it('promotes next player when leader leaves', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      room.removePlayer('p1');
      expect(room.getLeaderId()).toBe('p2');
    });

    it('addPlayer returns true for new player', () => {
      expect(room.addPlayer('p1', 'Alice')).toBe(true);
    });

    it('addPlayer returns false for duplicate ID', () => {
      room.addPlayer('p1', 'Alice');
      expect(room.addPlayer('p1', 'Bob')).toBe(false);
    });

    it('removePlayer decrements player count', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      room.removePlayer('p1');
      expect(room.getPlayerCount()).toBe(1);
    });

    it('setPlayerConnected changes connection state', () => {
      room.addPlayer('p1', 'Alice');
      room.setPlayerConnected('p1', false);
      expect(room.getPlayer('p1')?.connected).toBe(false);
      room.setPlayerConnected('p1', true);
      expect(room.getPlayer('p1')?.connected).toBe(true);
    });

    it('getConnectedPlayerCount counts only connected', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      room.setPlayerConnected('p1', false);
      expect(room.getConnectedPlayerCount()).toBe(1);
    });

    it('hasPlayer returns true for existing player', () => {
      room.addPlayer('p1', 'Alice');
      expect(room.hasPlayer('p1')).toBe(true);
    });

    it('hasPlayer returns false for nonexistent player', () => {
      expect(room.hasPlayer('p1')).toBe(false);
    });

    it('rekeyPlayer updates all maps', () => {
      room.addPlayer('old-id', 'Alice');
      room.rekeyPlayer('old-id', 'new-id');

      expect(room.hasPlayer('old-id')).toBe(false);
      expect(room.hasPlayer('new-id')).toBe(true);
      expect(room.getPlayer('new-id')?.name).toBe('Alice');
      expect(room.getLeaderId()).toBe('new-id');
    });

    it('broadcasts state on addPlayer', () => {
      room.addPlayer('p1', 'Alice');
      expect(callbacks.onStateChange).toHaveBeenCalled();
    });

    it('broadcasts state on removePlayer', () => {
      room.addPlayer('p1', 'Alice');
      callbacks.onStateChange.mockClear();
      room.removePlayer('p1');
      expect(callbacks.onStateChange).toHaveBeenCalled();
    });
  });

  describe('Settings', () => {
    it('clamps maxRounds to minimum 1', () => {
      room.updateSettings({ maxRounds: 0 });
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.maxRounds).toBe(1);
      }
    });

    it('clamps maxRounds to maximum 20', () => {
      room.updateSettings({ maxRounds: 50 });
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.maxRounds).toBe(20);
      }
    });

    it('clamps roundTime to minimum 10', () => {
      room.updateSettings({ roundTime: 5 });
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.roundTime).toBe(10);
      }
    });

    it('clamps roundTime to maximum 120', () => {
      room.updateSettings({ roundTime: 200 });
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.roundTime).toBe(120);
      }
    });

    it('ignores settings update outside LOBBY', () => {
      startGame();
      room.updateSettings({ maxRounds: 5 });
      // Should not have changed from default (10)
      const state = room.getState();
      expect(state.phase).toBe('ROUND_ACTIVE');
    });

    it('accepts valid settings', () => {
      room.updateSettings({ maxRounds: 5, roundTime: 60 });
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.maxRounds).toBe(5);
        expect(state.settings.roundTime).toBe(60);
      }
    });
  });

  describe('startGame', () => {
    it('fails with less than 2 players', () => {
      room.addPlayer('p1', 'Alice');
      const result = room.startGame();
      expect(result.success).toBe(false);
      expect(result.error).toContain('2');
    });

    it('fails when not in LOBBY phase', () => {
      startGame();
      const result = room.startGame();
      expect(result.success).toBe(false);
      expect(result.error).toContain('lobby');
    });

    it('fails when no secret word available', () => {
      addPlayers(2);
      mockPickRandomSecretWord.mockReturnValue(null);
      const result = room.startGame();
      expect(result.success).toBe(false);
      expect(result.error).toContain('secret');
    });

    it('fails when loadRankings fails', () => {
      addPlayers(2);
      mockWordRankerInstance.loadRankings.mockReturnValue(false);
      const result = room.startGame();
      expect(result.success).toBe(false);
      expect(result.error).toContain('rankings');
    });

    it('succeeds with 2+ players and transitions to ROUND_ACTIVE', () => {
      addPlayers(2);
      const result = room.startGame();
      expect(result.success).toBe(true);
      expect(room.getPhase()).toBe('ROUND_ACTIVE');
    });

    it('resets scores on start', () => {
      const ids = addPlayers(2);
      room.startGame();
      const state = room.getState();
      if (state.phase === 'ROUND_ACTIVE') {
        for (const entry of state.scoreboard) {
          expect(entry.totalScore).toBe(0);
        }
      }
    });

    it('counts disconnected players as not enough', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      room.setPlayerConnected('p2', false);
      const result = room.startGame();
      expect(result.success).toBe(false);
    });
  });

  describe('submitGuess', () => {
    it('fails when not ROUND_ACTIVE', () => {
      room.addPlayer('p1', 'Alice');
      const result = room.submitGuess('p1', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not active');
    });

    it('fails for unknown player', () => {
      startGame();
      const result = room.submitGuess('unknown', 'test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('fails when already guessed', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      const result = room.submitGuess(ids[0], 'test');
      expect(result.success).toBe(false);
      expect(result.error).toContain('Already guessed');
    });

    it('fails for invalid word', () => {
      const ids = startGame();
      mockWordRankerInstance.isValidWord.mockReturnValue(false);
      const result = room.submitGuess(ids[0], 'invalid');
      expect(result.success).toBe(false);
    });

    it('fails when getRank returns null', () => {
      const ids = startGame();
      mockWordRankerInstance.getRank.mockReturnValue(null);
      const result = room.submitGuess(ids[0], 'test');
      expect(result.success).toBe(false);
    });

    it('succeeds with valid guess', () => {
      const ids = startGame();
      const result = room.submitGuess(ids[0], 'test');
      expect(result.success).toBe(true);
      expect(result.result).toBeDefined();
    });

    it('gives correct points based on advancement', () => {
      mockWordRankerInstance.getRank.mockReturnValue(5); // rank 5, teamBest starts at 50000
      const ids = startGame();
      const result = room.submitGuess(ids[0], 'test');
      const expected = calculateAdvancementScore(INITIAL_TEAM_BEST, 5);
      expect(result.result?.points).toBe(expected);
      expect(expected).toBeGreaterThan(0);
    });

    it('non-advancing guess scores 0', () => {
      mockWordRankerInstance.getRank.mockReturnValue(50001); // worse than teamBest
      const ids = startGame();
      const result = room.submitGuess(ids[0], 'test');
      expect(result.result?.points).toBe(0);
    });

    it('first submitter flag still set', () => {
      const ids = startGame();
      const result1 = room.submitGuess(ids[0], 'test');
      expect(result1.result?.wasFirst).toBe(true);
    });

    it('second submitter is not first', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'first');
      const result2 = room.submitGuess(ids[1], 'second');
      expect(result2.result?.wasFirst).toBe(false);
    });

    it('calls onGuessResult callback', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      expect(callbacks.onGuessResult).toHaveBeenCalledWith(ids[0], expect.any(Object));
    });

    it('calls onPlayerSubmitted callback', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      expect(callbacks.onPlayerSubmitted).toHaveBeenCalledWith(ids[0], 'Player0');
    });

    it('auto-ends round when all players submitted', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'word1');
      room.submitGuess(ids[1], 'word2');
      expect(room.getPhase()).toBe('ROUND_REVEALING');
    });

    it('auto-ends round when someone guesses rank 1', () => {
      mockWordRankerInstance.getRank.mockReturnValue(1);
      const ids = startGame();
      room.submitGuess(ids[0], 'apple');
      expect(room.getPhase()).toBe('ROUND_REVEALING');
    });

    it('does not end round when only 1 of 2 players submitted', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      expect(room.getPhase()).toBe('ROUND_ACTIVE');
    });

    it('skips disconnected players for all-submitted check', () => {
      const ids = startGame();
      room.setPlayerConnected(ids[1], false);
      room.submitGuess(ids[0], 'test');
      // Only 1 connected player submitted → round should end
      expect(room.getPhase()).toBe('ROUND_REVEALING');
    });
  });

  describe('Round timer', () => {
    it('decrements each second', () => {
      startGame();
      vi.advanceTimersByTime(1000);
      expect(callbacks.onTimerTick).toHaveBeenCalledWith(expect.any(Number));
    });

    it('ends round when timer reaches 0 with guesses', () => {
      addPlayers(2);
      room.updateSettings({ roundTime: 10 });
      room.startGame();
      room.submitGuess('player0', 'test');
      vi.advanceTimersByTime(10_000);
      expect(room.getPhase()).toBe('ROUND_REVEALING');
    });

    it('triggers AFK pause when timer reaches 0 with no guesses', () => {
      addPlayers(2);
      room.updateSettings({ roundTime: 10 });
      room.startGame();
      vi.advanceTimersByTime(10_000);
      expect(room.getPhase()).toBe('ROUND_ACTIVE');
      expect(room.isPaused()).toBe(true);
      const state = room.getState();
      expect(state.afkCountdown).toBe(60);
    });

    it('does not decrement when paused', () => {
      addPlayers(2);
      room.updateSettings({ roundTime: 30 });
      room.startGame();
      room.pause();
      const ticksBefore = callbacks.onTimerTick.mock.calls.length;
      vi.advanceTimersByTime(5000);
      // Timer still fires but skips when paused, so onTimerTick shouldn't increase
      expect(callbacks.onTimerTick.mock.calls.length).toBe(ticksBefore);
    });

    it('resumes decrementing after unpause', () => {
      addPlayers(2);
      room.updateSettings({ roundTime: 30 });
      room.startGame();
      room.pause();
      vi.advanceTimersByTime(5000);
      room.resume();
      callbacks.onTimerTick.mockClear();
      vi.advanceTimersByTime(1000);
      expect(callbacks.onTimerTick).toHaveBeenCalled();
    });
  });

  describe('Phase advancement', () => {
    function advancePastReveal() {
      // Advance past ROUND_REVEALING phase timer
      const revealTime = Math.max(5, Math.min(0 * 2, REVEAL_DISPLAY_TIME));
      // With 0 guesses in endRound scenario, min is 5; but if round ended by timer, guesses may be 0 or more.
      // Just advance enough time for worst case
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
    }

    it('REVEALING → ACCOLADES', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      expect(room.getPhase()).toBe('ROUND_REVEALING');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_ACCOLADES');
    });

    it('ACCOLADES → SCOREBOARD', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_ACCOLADES');
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_SCOREBOARD');
    });

    it('SCOREBOARD → next ROUND_ACTIVE (when rounds remain)', () => {
      addPlayers(2);
      room.updateSettings({ maxRounds: 3 });
      room.startGame();
      const ids = ['player0', 'player1'];
      // Complete round 1
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_ACTIVE');
    });

    it('SCOREBOARD → GAME_OVER when max rounds reached', () => {
      addPlayers(2);
      room.updateSettings({ maxRounds: 1 });
      room.startGame();
      const ids = ['player0', 'player1'];
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('GAME_OVER');
    });

    it('SCOREBOARD → GAME_OVER when someone guessed rank 1', () => {
      mockWordRankerInstance.getRank.mockReturnValue(1);
      addPlayers(2);
      room.updateSettings({ maxRounds: 5 });
      room.startGame();
      // rank=1 guess auto-ends round
      room.submitGuess('player0', 'apple');
      expect(room.getPhase()).toBe('ROUND_REVEALING');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('GAME_OVER');
    });

    it('GAME_OVER does NOT auto-advance', () => {
      addPlayers(2);
      room.updateSettings({ maxRounds: 1 });
      room.startGame();
      room.submitGuess('player0', 'test');
      room.submitGuess('player1', 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('GAME_OVER');
      // Advance a lot more time — should stay at GAME_OVER
      vi.advanceTimersByTime(60_000);
      expect(room.getPhase()).toBe('GAME_OVER');
    });

    it('phase timer does not advance when paused', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      expect(room.getPhase()).toBe('ROUND_REVEALING');
      room.pause();
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000 + 5000);
      // Should still be in REVEALING because paused
      expect(room.getPhase()).toBe('ROUND_REVEALING');
    });

    it('phase timer resumes after unpause', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      room.pause();
      vi.advanceTimersByTime(3000);
      room.resume();
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      // Should have advanced past REVEALING
      expect(room.getPhase()).not.toBe('ROUND_REVEALING');
    });
  });

  describe('Pause/resume', () => {
    it('pause sets paused state', () => {
      startGame();
      room.pause();
      expect(room.isPaused()).toBe(true);
    });

    it('resume clears paused state', () => {
      startGame();
      room.pause();
      room.resume();
      expect(room.isPaused()).toBe(false);
    });

    it('pause is idempotent', () => {
      startGame();
      room.pause();
      room.pause();
      expect(room.isPaused()).toBe(true);
      // Should still broadcast only once for each call
    });

    it('resume is idempotent', () => {
      startGame();
      room.resume();
      expect(room.isPaused()).toBe(false);
    });

    it('broadcasts state on pause', () => {
      startGame();
      callbacks.onStateChange.mockClear();
      room.pause();
      expect(callbacks.onStateChange).toHaveBeenCalled();
    });

    it('broadcasts state on resume', () => {
      startGame();
      room.pause();
      callbacks.onStateChange.mockClear();
      room.resume();
      expect(callbacks.onStateChange).toHaveBeenCalled();
    });

    it('paused state is reflected in getState', () => {
      startGame();
      room.pause();
      expect(room.getState().paused).toBe(true);
    });
  });

  describe('playAgain', () => {
    function goToGameOver() {
      addPlayers(2);
      room.updateSettings({ maxRounds: 1 });
      room.startGame();
      room.submitGuess('player0', 'test');
      room.submitGuess('player1', 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('GAME_OVER');
    }

    it('transitions from GAME_OVER to LOBBY', () => {
      goToGameOver();
      room.playAgain();
      expect(room.getPhase()).toBe('LOBBY');
    });

    it('does nothing when not in GAME_OVER', () => {
      startGame();
      room.playAgain();
      expect(room.getPhase()).toBe('ROUND_ACTIVE');
    });

    it('resets paused state', () => {
      goToGameOver();
      room.playAgain();
      expect(room.isPaused()).toBe(false);
    });

    it('broadcasts state after reset', () => {
      goToGameOver();
      callbacks.onStateChange.mockClear();
      room.playAgain();
      expect(callbacks.onStateChange).toHaveBeenCalled();
    });
  });

  describe('endGame', () => {
    it('transitions from ROUND_ACTIVE to GAME_OVER', () => {
      const ids = startGame();
      expect(room.getPhase()).toBe('ROUND_ACTIVE');
      room.endGame();
      expect(room.getPhase()).toBe('GAME_OVER');
    });

    it('does nothing in LOBBY', () => {
      addPlayers(2);
      room.endGame();
      expect(room.getPhase()).toBe('LOBBY');
    });

    it('does nothing when already GAME_OVER', () => {
      addPlayers(2);
      room.updateSettings({ maxRounds: 1 });
      room.startGame();
      room.submitGuess('player0', 'test');
      room.submitGuess('player1', 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('GAME_OVER');
      callbacks.onStateChange.mockClear();
      room.endGame();
      expect(room.getPhase()).toBe('GAME_OVER');
      expect(callbacks.onStateChange).not.toHaveBeenCalled();
    });

    it('collects submitted guesses when ending during ROUND_ACTIVE', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.endGame();
      const state = room.getState();
      if (state.phase === 'GAME_OVER') {
        expect(state.guessHistory.length).toBe(1);
      }
    });

    it('generates accolades when ending during ROUND_ACTIVE', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test2');
      room.endGame();
      const state = room.getState();
      if (state.phase === 'GAME_OVER') {
        expect(state.accolades.length).toBeGreaterThan(0);
      }
    });

    it('clears paused state', () => {
      startGame();
      room.pause();
      expect(room.isPaused()).toBe(true);
      room.endGame();
      expect(room.isPaused()).toBe(false);
    });

    it('works from ROUND_REVEALING phase', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      expect(room.getPhase()).toBe('ROUND_REVEALING');
      room.endGame();
      expect(room.getPhase()).toBe('GAME_OVER');
    });

    it('works from ROUND_ACCOLADES phase', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_ACCOLADES');
      room.endGame();
      expect(room.getPhase()).toBe('GAME_OVER');
    });

    it('works from ROUND_SCOREBOARD phase', () => {
      const ids = startGame();
      room.submitGuess(ids[0], 'test');
      room.submitGuess(ids[1], 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_SCOREBOARD');
      room.endGame();
      expect(room.getPhase()).toBe('GAME_OVER');
    });

    it('broadcasts state', () => {
      startGame();
      callbacks.onStateChange.mockClear();
      room.endGame();
      expect(callbacks.onStateChange).toHaveBeenCalled();
    });
  });

  describe('Host management', () => {
    it('setHost and getHostSocketId', () => {
      room.setHost('host-1');
      expect(room.getHostSocketId()).toBe('host-1');
    });

    it('isHost returns true for host', () => {
      room.setHost('host-1');
      expect(room.isHost('host-1')).toBe(true);
    });

    it('isHost returns false for non-host', () => {
      room.setHost('host-1');
      expect(room.isHost('other')).toBe(false);
    });

    it('isLeader returns true for leader (first player to join)', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      expect(room.isLeader('p1')).toBe(true);
    });

    it('isLeader returns false for non-leader', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      expect(room.isLeader('p2')).toBe(false);
    });
  });

  describe('getState', () => {
    it('returns LOBBY state with settings', () => {
      room.addPlayer('p1', 'Alice');
      const state = room.getState();
      expect(state.phase).toBe('LOBBY');
      if (state.phase === 'LOBBY') {
        expect(state.settings).toBeDefined();
        expect(state.players).toHaveLength(1);
      }
    });

    it('returns ROUND_ACTIVE state with round data', () => {
      startGame();
      const state = room.getState();
      expect(state.phase).toBe('ROUND_ACTIVE');
      if (state.phase === 'ROUND_ACTIVE') {
        expect(state.round.roundNumber).toBe(1);
        expect(state.scoreboard).toBeDefined();
      }
    });

    it('includes leaderId in state', () => {
      room.addPlayer('p1', 'Alice');
      expect(room.getState().leaderId).toBe('p1');
    });

    it('includes roomCode in state', () => {
      expect(room.getState().roomCode).toBe('ABCD');
    });

    it('GAME_OVER state includes secretWord', () => {
      addPlayers(2);
      room.updateSettings({ maxRounds: 1 });
      room.startGame();
      room.submitGuess('player0', 'test');
      room.submitGuess('player1', 'test');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      const state = room.getState();
      if (state.phase === 'GAME_OVER') {
        expect(state.secretWord).toBe('apple');
      }
    });
  });

  describe('Player color assignment', () => {
    it('assigns a color from PLAYER_COLORS to each player', () => {
      room.addPlayer('p1', 'Alice');
      const player = room.getPlayer('p1');
      expect(player?.color).toBe(PLAYER_COLORS[0]);
    });

    it('assigns different colors to different players', () => {
      room.addPlayer('p1', 'Alice');
      room.addPlayer('p2', 'Bob');
      const p1 = room.getPlayer('p1');
      const p2 = room.getPlayer('p2');
      expect(p1?.color).toBe(PLAYER_COLORS[0]);
      expect(p2?.color).toBe(PLAYER_COLORS[1]);
    });

    it('wraps around color palette after 12 players', () => {
      for (let i = 0; i < 13; i++) {
        room.addPlayer(`p${i}`, `Player${i}`);
      }
      const p12 = room.getPlayer('p12');
      expect(p12?.color).toBe(PLAYER_COLORS[0]);
    });

    it('includes color in getState().players', () => {
      room.addPlayer('p1', 'Alice');
      const state = room.getState();
      expect(state.players[0].color).toBe(PLAYER_COLORS[0]);
    });
  });

  describe('noRepeatWords setting', () => {
    it('defaults to false', () => {
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.noRepeatWords).toBe(false);
      }
    });

    it('can be enabled via updateSettings', () => {
      room.updateSettings({ noRepeatWords: true });
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.noRepeatWords).toBe(true);
      }
    });

    it('can be toggled back to false', () => {
      room.updateSettings({ noRepeatWords: true });
      room.updateSettings({ noRepeatWords: false });
      const state = room.getState();
      if (state.phase === 'LOBBY') {
        expect(state.settings.noRepeatWords).toBe(false);
      }
    });

    it('rejects a word used in a previous round when enabled', () => {
      addPlayers(2);
      room.updateSettings({ noRepeatWords: true, maxRounds: 3 });
      room.startGame();

      // Round 1: both submit
      room.submitGuess('player0', 'hello');
      room.submitGuess('player1', 'world');
      // Advance through result phases to round 2
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_ACTIVE');

      // Round 2: try to reuse "hello" — should be rejected
      const result = room.submitGuess('player0', 'hello');
      expect(result.success).toBe(false);
      expect(result.error).toContain('already used');
    });

    it('allows repeated words when setting is disabled', () => {
      addPlayers(2);
      room.updateSettings({ noRepeatWords: false, maxRounds: 3 });
      room.startGame();

      // Round 1
      room.submitGuess('player0', 'hello');
      room.submitGuess('player1', 'world');
      vi.advanceTimersByTime(REVEAL_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(ACCOLADES_DISPLAY_TIME * 1000);
      vi.advanceTimersByTime(SCOREBOARD_DISPLAY_TIME * 1000);
      expect(room.getPhase()).toBe('ROUND_ACTIVE');

      // Round 2: reuse "hello" — should be allowed
      const result = room.submitGuess('player0', 'hello');
      expect(result.success).toBe(true);
    });
  });
});
