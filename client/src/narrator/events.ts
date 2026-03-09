import type { NarratorGameEvent } from './types';
import type { Player, ScoreEntry, GuessResult } from '@mmw/shared';

export function formatEvent(event: NarratorGameEvent): string {
  const { type, data } = event;
  switch (type) {
    case 'GAME_STARTED': {
      const playerNames = (data.playerNames as string[]).join(', ');
      return `GAME_STARTED: Players: ${playerNames}. ${data.totalRounds} rounds. Team best starts at ${data.teamBest}.`;
    }
    case 'ROUND_STARTED': {
      let msg = `ROUND_STARTED: Round ${data.roundNumber} of ${data.totalRounds}. Team best: ${data.teamBest}.`;
      if (data.topGuesses) {
        msg += ` Best guesses so far: ${data.topGuesses}`;
      }
      return msg;
    }
    case 'ZONE_BREAKTHROUGH':
      return `ZONE_BREAKTHROUGH: ${data.playerName} broke into the ${data.zoneName} zone! Team best is now ${data.teamBest}.`;
    case 'ROUND_ENDED': {
      const guessLines = (data.guesses as string[]).join(', ');
      return `ROUND_ENDED: Round ${data.roundNumber} results: ${guessLines}`;
    }
    case 'HINT_REVEALED':
      return `HINT_REVEALED: Hint word "${data.hintWord}" (rank ${data.hintRank}).`;
    case 'SCOREBOARD': {
      const scores = data.scores as string;
      return `SCOREBOARD: Round ${data.roundNumber} scores: ${scores}`;
    }
    case 'GAME_OVER': {
      const finalScores = data.scores as string;
      return `GAME_OVER: The secret word was "${data.secretWord}"! Final scores: ${finalScores}`;
    }
  }
}

export function buildGameStartedEvent(
  players: Player[],
  totalRounds: number,
  teamBest: number,
): NarratorGameEvent {
  return {
    type: 'GAME_STARTED',
    data: {
      playerNames: players.map(p => p.name),
      totalRounds,
      teamBest,
    },
  };
}

export function buildRoundStartedEvent(
  roundNumber: number,
  totalRounds: number,
  teamBest: number,
  topGuesses?: GuessResult[],
): NarratorGameEvent {
  return {
    type: 'ROUND_STARTED',
    data: {
      roundNumber,
      totalRounds,
      teamBest,
      topGuesses: topGuesses
        ? topGuesses.slice(0, 3).map(g => `"${g.word}" (rank ${g.rank})`).join(', ')
        : undefined,
    },
  };
}

export function buildZoneBreakthroughEvent(
  playerName: string,
  zoneName: string,
  teamBest: number,
): NarratorGameEvent {
  return {
    type: 'ZONE_BREAKTHROUGH',
    data: { playerName, zoneName, teamBest },
  };
}

export function buildRoundEndedEvent(
  roundNumber: number,
  guesses: GuessResult[],
): NarratorGameEvent {
  return {
    type: 'ROUND_ENDED',
    data: {
      roundNumber,
      guesses: guesses.map(g => `${g.playerName}: "${g.word}" (rank ${g.rank}, +${g.points})`),
    },
  };
}

export function buildHintRevealedEvent(
  hintWord: string,
  hintRank: number,
): NarratorGameEvent {
  return {
    type: 'HINT_REVEALED',
    data: { hintWord, hintRank },
  };
}

export function buildScoreboardEvent(
  scoreboard: ScoreEntry[],
  roundNumber: number,
): NarratorGameEvent {
  const scores = scoreboard
    .map(e => `${e.playerName}: ${e.totalScore} pts (+${e.roundScore})`)
    .join(' | ');
  return {
    type: 'SCOREBOARD',
    data: { scores, roundNumber },
  };
}

export function buildGameOverEvent(
  secretWord: string,
  scoreboard: ScoreEntry[],
): NarratorGameEvent {
  const scores = scoreboard
    .map(e => `${e.playerName}: ${e.totalScore} pts`)
    .join(' | ');
  return {
    type: 'GAME_OVER',
    data: { secretWord, scores },
  };
}
