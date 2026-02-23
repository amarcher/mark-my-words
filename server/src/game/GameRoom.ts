import {
  type GamePhase,
  type GameState,
  type Player,
  type GuessResult,
  type ScoreEntry,
  type RoomSettings,
  type Accolade,
  getPointsForRank,
  FIRST_SUBMIT_BONUS,
  DEFAULT_ROUND_TIME,
  MAX_ROUNDS,
  MIN_PLAYERS,
  REVEAL_DISPLAY_TIME,
  ACCOLADES_DISPLAY_TIME,
  SCOREBOARD_DISPLAY_TIME,
} from '@mmw/shared';
import { WordRanker } from '../words/WordRanker.js';
import { AccoladeEngine } from '../accolades/AccoladeEngine.js';

export class GameRoom {
  readonly roomCode: string;
  private phase: GamePhase = 'LOBBY';
  private players: Map<string, Player> = new Map();
  private hostSocketId: string = '';
  private leaderId: string = '';
  private paused: boolean = false;
  private settings: RoomSettings = {
    maxRounds: MAX_ROUNDS,
    roundTime: DEFAULT_ROUND_TIME,
  };

  // Round state
  private currentRound: number = 0;
  private roundGuesses: Map<string, GuessResult> = new Map();
  private allGuesses: GuessResult[] = [];
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  private timeRemaining: number = 0;
  private firstSubmitterId: string | null = null;
  private usedSecretWords: string[] = [];
  private wordRanker: WordRanker = new WordRanker();
  private accoladeEngine: AccoladeEngine = new AccoladeEngine();

  // Phase auto-advance timer
  private phaseTimer: ReturnType<typeof setInterval> | null = null;
  private phaseTimeRemaining: number = 0;
  private phaseTotalTime: number = 0;

  // Scoring
  private scores: Map<string, number> = new Map();
  private previousPositions: Map<string, number> = new Map();

  // Callbacks
  private onStateChange: (state: GameState) => void;
  private onTimerTick: (timeRemaining: number) => void;
  private onGuessResult: (playerId: string, result: GuessResult) => void;
  private onPlayerSubmitted: (playerId: string, playerName: string) => void;

  lastActivity: number = Date.now();

  constructor(
    roomCode: string,
    callbacks: {
      onStateChange: (state: GameState) => void;
      onTimerTick: (timeRemaining: number) => void;
      onGuessResult: (playerId: string, result: GuessResult) => void;
      onPlayerSubmitted: (playerId: string, playerName: string) => void;
    }
  ) {
    this.roomCode = roomCode;
    this.onStateChange = callbacks.onStateChange;
    this.onTimerTick = callbacks.onTimerTick;
    this.onGuessResult = callbacks.onGuessResult;
    this.onPlayerSubmitted = callbacks.onPlayerSubmitted;
  }

  touch(): void {
    this.lastActivity = Date.now();
  }

  // Host management (presenter, not a player)
  setHost(socketId: string): void {
    this.hostSocketId = socketId;
  }

  getHostSocketId(): string {
    return this.hostSocketId;
  }

  isHost(socketId: string): boolean {
    return socketId === this.hostSocketId;
  }

  // Leader management
  getLeaderId(): string {
    return this.leaderId;
  }

  isLeader(playerId: string): boolean {
    return playerId === this.leaderId;
  }

  // Player management
  addPlayer(id: string, name: string): boolean {
    if (this.players.has(id)) return false;

    this.players.set(id, { id, name, connected: true });
    this.scores.set(id, 0);

    // First player to join becomes leader
    if (!this.leaderId) {
      this.leaderId = id;
    }

    this.touch();
    this.broadcastState();
    return true;
  }

  removePlayer(id: string): void {
    this.players.delete(id);
    this.scores.delete(id);

    // If leader left, promote next player
    if (id === this.leaderId && this.players.size > 0) {
      const newLeader = this.players.values().next().value!;
      this.leaderId = newLeader.id;
    }

    this.touch();
    this.broadcastState();
  }

  setPlayerConnected(id: string, connected: boolean): void {
    const player = this.players.get(id);
    if (player) {
      player.connected = connected;
      this.touch();
      this.broadcastState();
    }
  }

  getPlayer(id: string): Player | undefined {
    return this.players.get(id);
  }

  getPlayerCount(): number {
    return this.players.size;
  }

  getConnectedPlayerCount(): number {
    let count = 0;
    for (const p of this.players.values()) {
      if (p.connected) count++;
    }
    return count;
  }

  hasPlayer(id: string): boolean {
    return this.players.has(id);
  }

  rekeyPlayer(oldId: string, newId: string): void {
    // Players map
    const player = this.players.get(oldId);
    if (player) {
      this.players.delete(oldId);
      player.id = newId;
      this.players.set(newId, player);
    }

    // Scores
    const score = this.scores.get(oldId);
    if (score !== undefined) {
      this.scores.delete(oldId);
      this.scores.set(newId, score);
    }

    // Round guesses
    const guess = this.roundGuesses.get(oldId);
    if (guess) {
      this.roundGuesses.delete(oldId);
      guess.playerId = newId;
      this.roundGuesses.set(newId, guess);
    }

    // Previous positions
    const pos = this.previousPositions.get(oldId);
    if (pos !== undefined) {
      this.previousPositions.delete(oldId);
      this.previousPositions.set(newId, pos);
    }

    // All guesses history
    for (const g of this.allGuesses) {
      if (g.playerId === oldId) g.playerId = newId;
    }

    // Leader
    if (this.leaderId === oldId) this.leaderId = newId;

    // First submitter
    if (this.firstSubmitterId === oldId) this.firstSubmitterId = newId;

    // Accolade engine
    this.accoladeEngine.rekeyPlayer(oldId, newId);
  }

  getPhase(): GamePhase {
    return this.phase;
  }

  // Settings (host screen can still configure during lobby)
  updateSettings(partial: Partial<RoomSettings>): void {
    if (this.phase !== 'LOBBY') return;
    if (partial.maxRounds !== undefined) {
      this.settings.maxRounds = Math.min(Math.max(partial.maxRounds, 1), 20);
    }
    if (partial.roundTime !== undefined) {
      this.settings.roundTime = Math.min(Math.max(partial.roundTime, 10), 120);
    }
    this.touch();
    this.broadcastState();
  }

  // Game lifecycle
  startGame(): { success: boolean; error?: string } {
    if (this.phase !== 'LOBBY') return { success: false, error: 'Game not in lobby' };
    if (this.getConnectedPlayerCount() < MIN_PLAYERS) {
      return { success: false, error: `Need at least ${MIN_PLAYERS} players` };
    }

    const secretWord = WordRanker.pickRandomSecretWord(this.usedSecretWords);
    if (!secretWord) return { success: false, error: 'No secret words available' };

    if (!this.wordRanker.loadRankings(secretWord)) {
      return { success: false, error: 'Failed to load word rankings' };
    }

    this.usedSecretWords.push(secretWord);
    this.currentRound = 0;
    this.allGuesses = [];
    this.scores.clear();
    for (const p of this.players.keys()) this.scores.set(p, 0);
    this.previousPositions.clear();
    this.accoladeEngine.reset();

    this.startNextRound();
    return { success: true };
  }

  private startNextRound(): void {
    this.currentRound++;
    this.roundGuesses.clear();
    this.firstSubmitterId = null;
    this.timeRemaining = this.settings.roundTime;
    this.phase = 'ROUND_ACTIVE';

    this.broadcastState();
    this.startTimer();
  }

  private startTimer(): void {
    this.clearTimer();
    this.roundTimer = setInterval(() => {
      if (this.paused) return;
      this.timeRemaining--;
      this.onTimerTick(this.timeRemaining);

      if (this.timeRemaining <= 0) {
        this.endRound();
      }
    }, 1000);
  }

  private clearTimer(): void {
    if (this.roundTimer) {
      clearInterval(this.roundTimer);
      this.roundTimer = null;
    }
  }

  // Phase auto-advance timer
  private startPhaseTimer(durationSeconds: number): void {
    this.clearPhaseTimer();
    this.phaseTimeRemaining = durationSeconds;
    this.phaseTotalTime = durationSeconds;

    this.phaseTimer = setInterval(() => {
      if (this.paused) return;
      this.phaseTimeRemaining--;

      // Broadcast updated phase time
      this.broadcastState();

      if (this.phaseTimeRemaining <= 0) {
        this.clearPhaseTimer();
        this.advancePhase();
      }
    }, 1000);
  }

  private clearPhaseTimer(): void {
    if (this.phaseTimer) {
      clearInterval(this.phaseTimer);
      this.phaseTimer = null;
    }
  }

  // Pause / Resume
  pause(): void {
    if (this.paused) return;
    this.paused = true;
    this.touch();
    this.broadcastState();
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    this.touch();
    this.broadcastState();
  }

  isPaused(): boolean {
    return this.paused;
  }

  // Guess handling
  submitGuess(playerId: string, word: string): { success: boolean; result?: GuessResult; error?: string } {
    if (this.phase !== 'ROUND_ACTIVE') return { success: false, error: 'Round not active' };
    if (this.roundGuesses.has(playerId)) return { success: false, error: 'Already guessed this round' };

    const player = this.players.get(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const normalized = word.toLowerCase().trim();

    if (!this.wordRanker.isValidWord(normalized)) {
      return { success: false, error: 'Word not in vocabulary' };
    }

    const rank = this.wordRanker.getRank(normalized);
    if (rank === null) return { success: false, error: 'Word not in vocabulary' };

    const wasFirst = this.firstSubmitterId === null;
    if (wasFirst) this.firstSubmitterId = playerId;

    const points = getPointsForRank(rank) + (wasFirst ? FIRST_SUBMIT_BONUS : 0);

    const result: GuessResult = {
      playerId,
      playerName: player.name,
      word: normalized,
      rank,
      points,
      wasFirst,
    };

    this.roundGuesses.set(playerId, result);
    this.scores.set(playerId, (this.scores.get(playerId) || 0) + points);
    this.touch();

    // Notify other players someone submitted
    this.onPlayerSubmitted(playerId, player.name);

    // Send private result to guesser
    this.onGuessResult(playerId, result);

    // Check if word was guessed or all players submitted
    if (rank === 1 || this.allPlayersSubmitted()) {
      this.endRound();
    }

    return { success: true, result };
  }

  private allPlayersSubmitted(): boolean {
    for (const [id, player] of this.players) {
      if (player.connected && !this.roundGuesses.has(id)) return false;
    }
    return true;
  }

  private endRound(): void {
    this.clearTimer();
    this.phase = 'ROUND_REVEALING';

    const guesses = Array.from(this.roundGuesses.values());

    // Accumulate all guesses across rounds
    this.allGuesses.push(...guesses);

    // Record for accolades
    this.accoladeEngine.recordRound(guesses);

    // Calculate reveal display time: 2s per guess, min 5s, max REVEAL_DISPLAY_TIME
    const revealTime = Math.max(5, Math.min(guesses.length * 2, REVEAL_DISPLAY_TIME));

    this.broadcastState();
    this.startPhaseTimer(revealTime);
  }

  // Auto-advance through result phases
  private advancePhase(): void {
    this.touch();

    switch (this.phase) {
      case 'ROUND_REVEALING': {
        this.phase = 'ROUND_ACCOLADES';
        this.broadcastState();
        this.startPhaseTimer(ACCOLADES_DISPLAY_TIME);
        break;
      }
      case 'ROUND_ACCOLADES': {
        this.phase = 'ROUND_SCOREBOARD';
        // Save positions before update
        const scoreboard = this.getScoreboard();
        for (const entry of scoreboard) {
          this.previousPositions.set(entry.playerId, entry.currentPosition);
        }
        this.broadcastState();
        this.startPhaseTimer(SCOREBOARD_DISPLAY_TIME);
        break;
      }
      case 'ROUND_SCOREBOARD': {
        const guesses = Array.from(this.roundGuesses.values());
        const someoneGuessedIt = guesses.some(g => g.rank === 1);

        if (someoneGuessedIt || this.currentRound >= this.settings.maxRounds) {
          this.phase = 'GAME_OVER';
          this.broadcastState();
          // GAME_OVER stays — no auto-advance
        } else {
          this.startNextRound();
        }
        break;
      }
      default:
        break;
    }
  }

  playAgain(): void {
    if (this.phase !== 'GAME_OVER') return;
    this.phase = 'LOBBY';
    this.currentRound = 0;
    this.roundGuesses.clear();
    this.allGuesses = [];
    this.clearTimer();
    this.clearPhaseTimer();
    this.paused = false;
    this.touch();
    this.broadcastState();
  }

  // State building
  getState(): GameState {
    const players = Array.from(this.players.values());
    const base = {
      roomCode: this.roomCode,
      players,
      hostId: this.hostSocketId,
      leaderId: this.leaderId,
      paused: this.paused,
      guessHistory: this.getSortedHistory(),
    };

    switch (this.phase) {
      case 'LOBBY':
        return { ...base, phase: 'LOBBY', settings: { ...this.settings } };

      case 'ROUND_ACTIVE':
        return {
          ...base,
          phase: 'ROUND_ACTIVE',
          round: {
            roundNumber: this.currentRound,
            totalRounds: this.settings.maxRounds,
            timeRemaining: this.timeRemaining,
            totalTime: this.settings.roundTime,
            guesses: [],
            submittedPlayerIds: Array.from(this.roundGuesses.keys()),
          },
          scoreboard: this.getScoreboard(),
        };

      case 'ROUND_REVEALING':
        return {
          ...base,
          phase: 'ROUND_REVEALING',
          round: this.getRoundData(),
          revealedGuesses: this.getSortedGuesses(),
          scoreboard: this.getScoreboard(),
          phaseTimeRemaining: this.phaseTimeRemaining,
          phaseTotalTime: this.phaseTotalTime,
        };

      case 'ROUND_ACCOLADES':
        return {
          ...base,
          phase: 'ROUND_ACCOLADES',
          round: this.getRoundData(),
          accolades: this.getAccolades(),
          scoreboard: this.getScoreboard(),
          phaseTimeRemaining: this.phaseTimeRemaining,
          phaseTotalTime: this.phaseTotalTime,
        };

      case 'ROUND_SCOREBOARD':
        return {
          ...base,
          phase: 'ROUND_SCOREBOARD',
          round: this.getRoundData(),
          scoreboard: this.getScoreboard(),
          phaseTimeRemaining: this.phaseTimeRemaining,
          phaseTotalTime: this.phaseTotalTime,
        };

      case 'GAME_OVER':
        return {
          ...base,
          phase: 'GAME_OVER',
          secretWord: this.wordRanker.getSecretWord(),
          scoreboard: this.getScoreboard(),
          accolades: this.getAccolades(),
        };
    }
  }

  private getRoundData() {
    return {
      roundNumber: this.currentRound,
      totalRounds: this.settings.maxRounds,
      timeRemaining: this.timeRemaining,
      totalTime: this.settings.roundTime,
      guesses: this.getSortedGuesses(),
      submittedPlayerIds: Array.from(this.roundGuesses.keys()),
    };
  }

  private getSortedGuesses(): GuessResult[] {
    return Array.from(this.roundGuesses.values()).sort((a, b) => b.rank - a.rank); // worst first
  }

  private getSortedHistory(): GuessResult[] {
    return [...this.allGuesses].sort((a, b) => a.rank - b.rank); // best first
  }

  private getAccolades(): Accolade[] {
    const guesses = Array.from(this.roundGuesses.values());
    return this.accoladeEngine.generateAccolades(guesses, this.currentRound);
  }

  private getScoreboard(): ScoreEntry[] {
    const entries: ScoreEntry[] = [];
    for (const [id, player] of this.players) {
      const totalScore = this.scores.get(id) || 0;
      const roundGuess = this.roundGuesses.get(id);
      entries.push({
        playerId: id,
        playerName: player.name,
        totalScore,
        roundScore: roundGuess?.points || 0,
        previousPosition: this.previousPositions.get(id) || 0,
        currentPosition: 0,
      });
    }

    entries.sort((a, b) => b.totalScore - a.totalScore);
    entries.forEach((e, i) => (e.currentPosition = i + 1));
    return entries;
  }

  private broadcastState(): void {
    this.onStateChange(this.getState());
  }

  destroy(): void {
    this.clearTimer();
    this.clearPhaseTimer();
  }
}
