export type GamePhase =
  | 'LOBBY'
  | 'ROUND_ACTIVE'
  | 'ROUND_REVEALING'
  | 'ROUND_ACCOLADES'
  | 'ROUND_SCOREBOARD'
  | 'GAME_OVER';

export interface Player {
  id: string;
  name: string;
  connected: boolean;
  color: string;
}

export interface GuessResult {
  playerId: string;
  playerName: string;
  word: string;
  rank: number;
  points: number;
  wasFirst: boolean;
}

export interface RoundData {
  roundNumber: number;
  totalRounds: number;
  timeRemaining: number;
  totalTime: number;
  guesses: GuessResult[];
  submittedPlayerIds: string[];
}

export interface Accolade {
  type: AccoladeType;
  playerId: string;
  playerName: string;
  title: string;
  description: string;
  icon: string;
  isPositive: boolean;
}

export type AccoladeType =
  | 'closest'
  | 'biggest_leap'
  | 'on_fire'
  | 'galaxy_brain'
  | 'worst'
  | 'brave_explorer'
  | 'ice_cold';

export interface ScoreEntry {
  playerId: string;
  playerName: string;
  totalScore: number;
  roundScore: number;
  previousPosition: number;
  currentPosition: number;
}

export interface RoomSettings {
  maxRounds: number;
  roundTime: number; // seconds
  noRepeatWords: boolean;
}

interface BaseState {
  roomCode: string;
  players: Player[];
  hostId: string;
  leaderId: string;
  paused: boolean;
  guessHistory: GuessResult[];
}

export interface LobbyState extends BaseState {
  phase: 'LOBBY';
  settings: RoomSettings;
}

export interface RoundActiveState extends BaseState {
  phase: 'ROUND_ACTIVE';
  round: RoundData;
  scoreboard: ScoreEntry[];
}

export interface RoundRevealingState extends BaseState {
  phase: 'ROUND_REVEALING';
  round: RoundData;
  revealedGuesses: GuessResult[];
  scoreboard: ScoreEntry[];
  phaseTimeRemaining: number;
  phaseTotalTime: number;
}

export interface RoundAccoladesState extends BaseState {
  phase: 'ROUND_ACCOLADES';
  round: RoundData;
  accolades: Accolade[];
  scoreboard: ScoreEntry[];
  phaseTimeRemaining: number;
  phaseTotalTime: number;
}

export interface RoundScoreboardState extends BaseState {
  phase: 'ROUND_SCOREBOARD';
  round: RoundData;
  scoreboard: ScoreEntry[];
  phaseTimeRemaining: number;
  phaseTotalTime: number;
}

export interface GameOverState extends BaseState {
  phase: 'GAME_OVER';
  secretWord: string;
  scoreboard: ScoreEntry[];
  accolades: Accolade[];
}

export type GameState =
  | LobbyState
  | RoundActiveState
  | RoundRevealingState
  | RoundAccoladesState
  | RoundScoreboardState
  | GameOverState;
