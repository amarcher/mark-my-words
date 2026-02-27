import type { AnnouncementEntry } from './AudioManager';
import type { GameState, Accolade, GuessResult, ScoreEntry } from '@mmw/shared';

/** Phase transition announcements */
export function roundStartAnnouncement(roundNumber: number, guessHistory: GuessResult[]): AnnouncementEntry {
  let text: string;

  if (roundNumber === 1) {
    text = "Let's start the game! Enter a word and we'll see how close you are to the secret word.";
    const initialHint = guessHistory.find(g => g.isHint);
    if (initialHint) {
      text += ` Here's a hint: you can't be further from the secret word than ${initialHint.word}.`;
    }
  } else {
    // guessHistory is sorted best-first; pick top 2
    const top = guessHistory.filter(g => !g.isHint).slice(0, 2);
    if (top.length >= 2) {
      text = `Round ${roundNumber}, begin! Enter a word that's closer than ${top[0].word} and ${top[1].word}.`;
    } else if (top.length === 1) {
      text = `Round ${roundNumber}, begin! Enter a word that's closer than ${top[0].word}.`;
    } else {
      text = `Round ${roundNumber}, begin!`;
    }
  }

  return {
    id: `round-${roundNumber}-start`,
    text,
    priority: 1,
    phase: 'ROUND_ACTIVE',
  };
}

export function roundEndAnnouncement(): AnnouncementEntry {
  return {
    id: 'round-end',
    text: "Time's up! Let's see the results.",
    priority: 1,
    phase: 'ROUND_REVEALING',
  };
}

export function scoreboardAnnouncement(scoreboard: ScoreEntry[]): AnnouncementEntry {
  const scorers = scoreboard
    .filter(e => e.roundScore > 0)
    .sort((a, b) => b.roundScore - a.roundScore);

  let text: string;
  if (scorers.length === 0) {
    text = 'No points scored this round.';
  } else {
    const roundParts = scorers.map(e => `${e.playerName} earned ${e.roundScore} points`);
    const leader = scoreboard[0]; // already sorted by totalScore
    text = roundParts.join(', ') + `. ${leader.playerName} leads with ${leader.totalScore} points.`;
  }

  return {
    id: 'scoreboard',
    text,
    priority: 1,
    phase: 'ROUND_SCOREBOARD',
  };
}

export function gameOverAnnouncement(secretWord: string): AnnouncementEntry {
  return {
    id: 'game-over',
    text: `Game over! The secret word was ${secretWord}!`,
    priority: 1,
    phase: 'GAME_OVER',
  };
}

/** Zone breakthrough */
export function zoneBreakthroughAnnouncement(zoneLabel: string): AnnouncementEntry {
  return {
    id: `zone-${zoneLabel.toLowerCase().replace(/\s+/g, '-')}`,
    text: `The team has entered the ${zoneLabel} zone!`,
    priority: 2,
    phase: 'ROUND_ACTIVE',
  };
}

/** Guess revealed during ROUND_REVEALING */
export function guessRevealAnnouncement(playerName: string, word: string, rank: number): AnnouncementEntry {
  return {
    id: `reveal-${word}`,
    text: `${playerName} guessed ${word}, rank ${rank.toLocaleString()}.`,
    priority: 2,
    phase: 'ROUND_REVEALING',
  };
}

/** Accolade announcement */
export function accoladeAnnouncement(accolade: Accolade): AnnouncementEntry {
  return {
    id: `accolade-${accolade.type}`,
    text: `The ${accolade.title} goes to ${accolade.playerName}!`,
    priority: 2,
    phase: 'ROUND_REVEALING',
  };
}

/** Hint reveal */
export function hintRevealAnnouncement(state: GameState): AnnouncementEntry | null {
  if (state.phase !== 'ROUND_HINT_REVEAL') return null;
  return {
    id: 'hint-reveal',
    text: `A hint has been granted! The word is ${state.hintWord}.`,
    priority: 2,
    phase: 'ROUND_HINT_REVEAL',
  };
}

/** Winner announcement (used with delay in GAME_OVER) */
export function winnerAnnouncement(name: string, score: number): AnnouncementEntry {
  return {
    id: 'winner',
    text: `${name} wins with ${score} points!`,
    priority: 2,
    phase: 'GAME_OVER',
  };
}

/** Player joined (lobby) */
export function playerJoinedAnnouncement(playerName: string): AnnouncementEntry {
  return {
    id: `welcome-${playerName.toLowerCase().replace(/\s+/g, '-')}`,
    text: `Welcome, ${playerName}!`,
    priority: 3,
    phase: 'LOBBY',
  };
}

/** Player submitted guess (mp3-only placeholder — empty text means TTS is skipped) */
export function playerSubmittedAnnouncement(playerName: string): AnnouncementEntry {
  return {
    id: 'player-submitted',
    text: '',
    priority: 3,
    phase: 'ROUND_ACTIVE',
  };
}
