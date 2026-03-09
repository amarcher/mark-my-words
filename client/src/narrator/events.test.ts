import { describe, it, expect } from 'vitest';
import {
  formatEvent,
  buildGameStartedEvent,
  buildRoundStartedEvent,
  buildZoneBreakthroughEvent,
  buildRoundEndedEvent,
  buildHintRevealedEvent,
  buildScoreboardEvent,
  buildGameOverEvent,
} from './events';
import type { Player, GuessResult, ScoreEntry } from '@mmw/shared';

const players: Player[] = [
  { id: 'p1', name: 'Alice', connected: true, color: '#f00' },
  { id: 'p2', name: 'Bob', connected: true, color: '#0f0' },
];

const guesses: GuessResult[] = [
  { playerId: 'p1', playerName: 'Alice', word: 'cat', rank: 500, points: 230, isHint: false, wasFirst: false },
  { playerId: 'p2', playerName: 'Bob', word: 'dog', rank: 1200, points: 0, isHint: false, wasFirst: false },
];

const scoreboard: ScoreEntry[] = [
  { playerId: 'p1', playerName: 'Alice', totalScore: 460, roundScore: 230, previousPosition: 1, currentPosition: 1 },
  { playerId: 'p2', playerName: 'Bob', totalScore: 100, roundScore: 0, previousPosition: 2, currentPosition: 2 },
];

describe('Narrator Event Builders', () => {
  describe('buildGameStartedEvent', () => {
    it('creates event with player names, round count, and team best', () => {
      const event = buildGameStartedEvent(players, 5, 50000);
      expect(event.type).toBe('GAME_STARTED');
      expect(event.data.playerNames).toEqual(['Alice', 'Bob']);
      expect(event.data.totalRounds).toBe(5);
      expect(event.data.teamBest).toBe(50000);
    });
  });

  describe('buildRoundStartedEvent', () => {
    it('creates event with round info', () => {
      const event = buildRoundStartedEvent(2, 5, 1200);
      expect(event.type).toBe('ROUND_STARTED');
      expect(event.data.roundNumber).toBe(2);
      expect(event.data.totalRounds).toBe(5);
      expect(event.data.teamBest).toBe(1200);
      expect(event.data.topGuesses).toBeUndefined();
    });

    it('includes top guesses when provided', () => {
      const event = buildRoundStartedEvent(2, 5, 1200, guesses);
      expect(event.data.topGuesses).toContain('"cat"');
      expect(event.data.topGuesses).toContain('"dog"');
    });

    it('limits to 3 top guesses', () => {
      const manyGuesses: GuessResult[] = [
        ...guesses,
        { playerId: 'p3', playerName: 'Carol', word: 'fish', rank: 800, points: 50, isHint: false, wasFirst: false },
        { playerId: 'p4', playerName: 'Dave', word: 'bird', rank: 900, points: 30, isHint: false, wasFirst: false },
      ];
      const event = buildRoundStartedEvent(2, 5, 1200, manyGuesses);
      const parts = (event.data.topGuesses as string).split(', ');
      expect(parts).toHaveLength(3);
    });
  });

  describe('buildZoneBreakthroughEvent', () => {
    it('creates event with player, zone, and team best', () => {
      const event = buildZoneBreakthroughEvent('Alice', 'Warm', 250);
      expect(event.type).toBe('ZONE_BREAKTHROUGH');
      expect(event.data.playerName).toBe('Alice');
      expect(event.data.zoneName).toBe('Warm');
      expect(event.data.teamBest).toBe(250);
    });
  });

  describe('buildRoundEndedEvent', () => {
    it('creates event with formatted guess summaries', () => {
      const event = buildRoundEndedEvent(3, guesses);
      expect(event.type).toBe('ROUND_ENDED');
      expect(event.data.roundNumber).toBe(3);
      const lines = event.data.guesses as string[];
      expect(lines).toHaveLength(2);
      expect(lines[0]).toContain('Alice');
      expect(lines[0]).toContain('"cat"');
      expect(lines[0]).toContain('rank 500');
      expect(lines[0]).toContain('+230');
    });
  });

  describe('buildHintRevealedEvent', () => {
    it('creates event with hint word and rank', () => {
      const event = buildHintRevealedEvent('warm', 800);
      expect(event.type).toBe('HINT_REVEALED');
      expect(event.data.hintWord).toBe('warm');
      expect(event.data.hintRank).toBe(800);
    });
  });

  describe('buildScoreboardEvent', () => {
    it('creates event with formatted scores', () => {
      const event = buildScoreboardEvent(scoreboard, 3);
      expect(event.type).toBe('SCOREBOARD');
      expect(event.data.roundNumber).toBe(3);
      const scores = event.data.scores as string;
      expect(scores).toContain('Alice: 460 pts (+230)');
      expect(scores).toContain('Bob: 100 pts (+0)');
    });
  });

  describe('buildGameOverEvent', () => {
    it('creates event with secret word and final scores', () => {
      const event = buildGameOverEvent('river', scoreboard);
      expect(event.type).toBe('GAME_OVER');
      expect(event.data.secretWord).toBe('river');
      const scores = event.data.scores as string;
      expect(scores).toContain('Alice: 460 pts');
      expect(scores).toContain('Bob: 100 pts');
    });
  });
});

describe('formatEvent', () => {
  it('formats GAME_STARTED', () => {
    const event = buildGameStartedEvent(players, 5, 50000);
    const result = formatEvent(event);
    expect(result).toBe('GAME_STARTED: Players: Alice, Bob. 5 rounds. Team best starts at 50000.');
  });

  it('formats ROUND_STARTED without top guesses', () => {
    const event = buildRoundStartedEvent(1, 5, 50000);
    const result = formatEvent(event);
    expect(result).toBe('ROUND_STARTED: Round 1 of 5. Team best: 50000.');
  });

  it('formats ROUND_STARTED with top guesses', () => {
    const event = buildRoundStartedEvent(2, 5, 500, guesses);
    const result = formatEvent(event);
    expect(result).toContain('ROUND_STARTED: Round 2 of 5. Team best: 500.');
    expect(result).toContain('Best guesses so far:');
    expect(result).toContain('"cat" (rank 500)');
  });

  it('formats ZONE_BREAKTHROUGH', () => {
    const event = buildZoneBreakthroughEvent('Alice', 'Warm', 250);
    const result = formatEvent(event);
    expect(result).toBe('ZONE_BREAKTHROUGH: Alice broke into the Warm zone! Team best is now 250.');
  });

  it('formats ROUND_ENDED', () => {
    const event = buildRoundEndedEvent(3, guesses);
    const result = formatEvent(event);
    expect(result).toContain('ROUND_ENDED: Round 3 results:');
    expect(result).toContain('Alice: "cat" (rank 500, +230)');
  });

  it('formats HINT_REVEALED', () => {
    const event = buildHintRevealedEvent('warm', 800);
    const result = formatEvent(event);
    expect(result).toBe('HINT_REVEALED: Hint word "warm" (rank 800).');
  });

  it('formats SCOREBOARD', () => {
    const event = buildScoreboardEvent(scoreboard, 3);
    const result = formatEvent(event);
    expect(result).toContain('SCOREBOARD: Round 3 scores:');
    expect(result).toContain('Alice: 460 pts (+230)');
  });

  it('formats GAME_OVER', () => {
    const event = buildGameOverEvent('river', scoreboard);
    const result = formatEvent(event);
    expect(result).toContain('GAME_OVER: The secret word was "river"!');
    expect(result).toContain('Alice: 460 pts');
  });
});
