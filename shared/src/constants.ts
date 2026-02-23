// Game limits
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 12;
export const MAX_ROUNDS = 10;
export const DEFAULT_ROUND_TIME = 30; // seconds
export const ROOM_CODE_LENGTH = 4;
export const ROOM_INACTIVITY_TIMEOUT = 30 * 60 * 1000; // 30 minutes
export const MAX_GUESS_LENGTH = 30;

// Room code alphabet (excludes I and O for readability)
export const ROOM_CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ';

// Rank thresholds and colors
export const RANK_ZONES = {
  WIN: { max: 1, color: '#fbbf24', label: 'SECRET WORD' },
  GREEN_HOT: { max: 10, color: '#22c55e', label: 'On Fire' },
  GREEN_WARM: { max: 50, color: '#22c55e', label: 'Very Warm' },
  GREEN: { max: 300, color: '#22c55e', label: 'Warm' },
  ORANGE: { max: 1500, color: '#f59e0b', label: 'Cold' },
  RED: { max: Infinity, color: '#ef4444', label: 'Ice Cold' },
} as const;

// Advancement-based scoring
export const INITIAL_TEAM_BEST = 50000;
export const SCORE_MULTIPLIER = 100;

export function calculateAdvancementScore(teamBest: number, guessRank: number): number {
  if (guessRank >= teamBest) return 0;
  return Math.round(SCORE_MULTIPLIER * Math.log(teamBest / guessRank));
}

// Phase auto-advance display durations (seconds)
export const REVEAL_DISPLAY_TIME = 8;
export const ACCOLADES_DISPLAY_TIME = 8;
export const SCOREBOARD_DISPLAY_TIME = 6;

// AFK detection
export const AFK_CLOSE_TIMEOUT = 60; // seconds until room closes after AFK pause


export function getRankZone(rank: number): string {
  if (rank <= 1) return 'win';
  if (rank <= 300) return 'green';
  if (rank <= 1500) return 'orange';
  return 'red';
}

export const PLAYER_COLORS = [
  '#6c63ff', // purple
  '#f472b6', // pink
  '#38bdf8', // sky blue
  '#fb923c', // orange
  '#a78bfa', // lavender
  '#34d399', // emerald
  '#fbbf24', // gold
  '#f87171', // red
  '#2dd4bf', // teal
  '#e879f9', // fuchsia
  '#818cf8', // indigo
  '#a3e635', // lime
];

export function getRankColor(rank: number): string {
  if (rank <= 1) return RANK_ZONES.WIN.color;
  if (rank <= 300) return RANK_ZONES.GREEN.color;
  if (rank <= 1500) return RANK_ZONES.ORANGE.color;
  return RANK_ZONES.RED.color;
}
