import type {
  GameState,
  GuessResult,
  Accolade,
  ScoreEntry,
  RoomSettings,
} from './gameState.js';

// Client → Server events
export interface ClientToServerEvents {
  'room:create': (callback: (res: { success: boolean; roomCode?: string; error?: string }) => void) => void;
  'room:join': (data: { roomCode: string; playerName: string }, callback: (res: { success: boolean; error?: string }) => void) => void;
  'room:leave': () => void;
  'room:close': () => void;
  'room:kick': (data: { playerId: string }) => void;
  'lobby:settings': (data: Partial<RoomSettings>) => void;
  'lobby:start': () => void;
  'game:guess': (data: { word: string }, callback: (res: { success: boolean; result?: GuessResult; error?: string }) => void) => void;
  'game:play-again': () => void;
  'game:end': () => void;
  'game:pause': () => void;
  'game:resume': () => void;
  'room:reconnect': (
    data: { roomCode: string; playerName: string },
    callback: (res: { success: boolean; error?: string }) => void
  ) => void;
}

// Server → Client events
export interface ServerToClientEvents {
  'game:state': (state: GameState) => void;
  'round:start': (data: { roundNumber: number; totalRounds: number; timeRemaining: number }) => void;
  'round:player-submitted': (data: { playerId: string; playerName: string }) => void;
  'round:guess-result': (result: GuessResult) => void;
  'round:timer': (data: { timeRemaining: number }) => void;
  'round:reveal': (data: { guesses: GuessResult[] }) => void;
  'round:accolades': (data: { accolades: Accolade[] }) => void;
  'round:scoreboard': (data: { scoreboard: ScoreEntry[] }) => void;
  'game:over': (data: { secretWord: string; scoreboard: ScoreEntry[] }) => void;
  'room:closed': (data: { message: string }) => void;
  'room:error': (data: { message: string }) => void;
  'player:joined': (data: { playerId: string; playerName: string }) => void;
  'player:left': (data: { playerId: string; playerName: string }) => void;
  'player:disconnected': (data: { playerId: string; playerName: string }) => void;
  'player:reconnected': (data: { playerId: string; playerName: string }) => void;
}

// Inter-server events (unused for now)
export interface InterServerEvents {}

// Socket data
export interface SocketData {
  playerId: string;
  playerName: string;
  roomCode: string;
}
