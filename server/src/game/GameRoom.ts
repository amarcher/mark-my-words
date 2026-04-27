import {
  type GamePhase,
  type GameState,
  type Player,
  type GuessResult,
  type ScoreEntry,
  type RoomSettings,
  type HintMode,
  type HintVoteState,
  type Accolade,
  calculateAdvancementScore,
  INITIAL_TEAM_BEST,
  DEFAULT_ROUND_TIME,
  MAX_ROUNDS,
  MIN_PLAYERS,
  REVEAL_DISPLAY_TIME,
  HINT_REVEAL_DISPLAY_TIME,
  SCOREBOARD_DISPLAY_TIME,
  AFK_CLOSE_TIMEOUT,
  PLAYER_COLORS,
  HINT_PLAYER_ID,
  HINT_PLAYER_NAME,
  getHintTargetRange,
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
    noRepeatWords: true,
    hintMode: 'host' as HintMode,
    initialHint: false,
  };
  private colorIndex: number = 0;

  // Round state
  private currentRound: number = 0;
  private roundGuesses: Map<string, GuessResult> = new Map();
  private allGuesses: GuessResult[] = [];
  private roundTimer: ReturnType<typeof setInterval> | null = null;
  private timeRemaining: number = 0;
  private firstSubmitterId: string | null = null;
  private cachedAccolades: Accolade[] = [];
  private usedSecretWords: string[] = [];
  private wordRanker: WordRanker = new WordRanker();
  private accoladeEngine: AccoladeEngine = new AccoladeEngine();

  // Hint state
  private hintVotes: Set<string> = new Set();
  private hintApproved: boolean = false; // host mode: host approved hint for this round
  private usedHintWords: Set<string> = new Set();
  private lastHintResult: { word: string; rank: number; grantedBy: 'host' | 'vote' } | null = null;

  // Phase auto-advance timer
  private phaseTimer: ReturnType<typeof setInterval> | null = null;
  private phaseTimeRemaining: number = 0;
  private phaseTotalTime: number = 0;

  // Host hold (TTS still speaking)
  private hostHold: boolean = false;
  private hostHoldTimeout: ReturnType<typeof setTimeout> | null = null;
  private static readonly MAX_HOLD_MS = 90_000;

  // AFK detection
  private afkTimer: ReturnType<typeof setInterval> | null = null;
  private afkCountdown: number | null = null;

  // Scoring
  private teamBest: number = INITIAL_TEAM_BEST;
  private scores: Map<string, number> = new Map();
  private previousPositions: Map<string, number> = new Map();

  // Callbacks
  private onStateChange: (state: GameState) => void;
  private onTimerTick: (timeRemaining: number) => void;
  private onGuessResult: (playerId: string, result: GuessResult) => void;
  private onPlayerSubmitted: (playerId: string, playerName: string) => void;
  private onAfkClose: () => void;
  private onHintRevealed: (word: string, rank: number) => void;

  lastActivity: number = Date.now();

  constructor(
    roomCode: string,
    callbacks: {
      onStateChange: (state: GameState) => void;
      onTimerTick: (timeRemaining: number) => void;
      onGuessResult: (playerId: string, result: GuessResult) => void;
      onPlayerSubmitted: (playerId: string, playerName: string) => void;
      onAfkClose: () => void;
      onHintRevealed: (word: string, rank: number) => void;
    }
  ) {
    this.roomCode = roomCode;
    this.onStateChange = callbacks.onStateChange;
    this.onTimerTick = callbacks.onTimerTick;
    this.onGuessResult = callbacks.onGuessResult;
    this.onPlayerSubmitted = callbacks.onPlayerSubmitted;
    this.onAfkClose = callbacks.onAfkClose;
    this.onHintRevealed = callbacks.onHintRevealed;
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

    const color = PLAYER_COLORS[this.colorIndex % PLAYER_COLORS.length];
    this.colorIndex++;
    this.players.set(id, { id, name, connected: true, color });
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

    // If leader left, promote the next connected player (fallback to first if none)
    if (id === this.leaderId) {
      this.leaderId = this.pickNextLeaderId() ?? '';
    }

    this.touch();
    this.broadcastState();
  }

  /**
   * If the given disconnected player is the current leader, promote the next
   * connected player. Returns true if the leader changed.
   */
  promoteNextLeaderIfDisconnected(disconnectedId: string): boolean {
    if (disconnectedId !== this.leaderId) return false;
    const next = this.pickNextLeaderId({ excludeId: disconnectedId, requireConnected: true });
    if (!next || next === this.leaderId) return false;
    this.leaderId = next;
    this.touch();
    this.broadcastState();
    return true;
  }

  private pickNextLeaderId(opts?: { excludeId?: string; requireConnected?: boolean }): string | undefined {
    const excludeId = opts?.excludeId;
    const requireConnected = opts?.requireConnected ?? false;
    // Insertion-order iteration; prefer connected players first
    let firstFallback: string | undefined;
    for (const p of this.players.values()) {
      if (p.id === excludeId) continue;
      if (p.connected) return p.id;
      if (firstFallback === undefined) firstFallback = p.id;
    }
    return requireConnected ? undefined : firstFallback;
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
    if (partial.noRepeatWords !== undefined) {
      this.settings.noRepeatWords = !!partial.noRepeatWords;
    }
    if (partial.hintMode !== undefined && ['none', 'host', 'vote'].includes(partial.hintMode)) {
      this.settings.hintMode = partial.hintMode;
    }
    if (partial.initialHint !== undefined) {
      this.settings.initialHint = !!partial.initialHint;
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
    this.teamBest = INITIAL_TEAM_BEST;
    this.scores.clear();
    for (const p of this.players.keys()) this.scores.set(p, 0);
    this.previousPositions.clear();
    this.accoladeEngine.reset();
    this.usedHintWords.clear();
    this.hintVotes.clear();
    this.hintApproved = false;
    this.lastHintResult = null;

    this.startNextRound();
    return { success: true };
  }

  private startNextRound(): void {
    this.currentRound++;
    this.roundGuesses.clear();
    this.firstSubmitterId = null;
    this.hintVotes.clear();
    this.hintApproved = false;
    this.timeRemaining = this.settings.roundTime;
    this.phase = 'ROUND_ACTIVE';

    if (this.settings.initialHint && this.currentRound === 1) {
      this.giveInitialHint();
    }

    this.broadcastState();
    this.startTimer();
  }

  private giveInitialHint(): void {
    const result = this.wordRanker.getInitialHint();
    if (!result) return;
    if (this.usedHintWords.has(result.word)) return; // already given (e.g. AFK resume)

    const guessResult: GuessResult = {
      playerId: HINT_PLAYER_ID,
      playerName: HINT_PLAYER_NAME,
      word: result.word,
      rank: result.rank,
      points: 0,
      wasFirst: false,
      isHint: true,
    };

    this.allGuesses.push(guessResult);
    if (result.rank < this.teamBest) {
      this.teamBest = result.rank;
    }
    this.usedHintWords.add(result.word);
    this.onHintRevealed(result.word, result.rank);
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
      if (this.paused || this.hostHold) return;
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

  // Host hold — freeze phase timer while TTS is speaking
  holdPhase(): void {
    if (this.hostHold) return;
    this.hostHold = true;

    // Safety cap: auto-release after MAX_HOLD_MS
    this.hostHoldTimeout = setTimeout(() => {
      this.releasePhase();
    }, GameRoom.MAX_HOLD_MS);
  }

  releasePhase(): void {
    if (!this.hostHold) return;
    this.hostHold = false;

    if (this.hostHoldTimeout) {
      clearTimeout(this.hostHoldTimeout);
      this.hostHoldTimeout = null;
    }

    // TTS is done — advance immediately, no reason to wait out remaining time
    if (this.phaseTimer) {
      this.clearPhaseTimer();
      this.advancePhase();
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

    if (this.afkCountdown !== null) {
      // Resuming from AFK pause: clear AFK timer, rewind the empty round, start fresh
      this.clearAfkTimer();
      this.afkCountdown = null;
      this.currentRound--; // empty round doesn't count
      this.paused = false;
      this.touch();
      this.startNextRound();
      return;
    }

    this.paused = false;
    this.touch();
    this.broadcastState();
  }

  isPaused(): boolean {
    return this.paused;
  }

  // Hint system
  getSettings(): RoomSettings {
    return { ...this.settings };
  }

  isHintAvailable(): boolean {
    return getHintTargetRange(this.teamBest) !== null;
  }

  approveHint(): void {
    if (this.phase !== 'ROUND_ACTIVE' && this.phase !== 'ROUND_REVEALING') return;
    if (this.settings.hintMode !== 'host') return;
    if (!this.isHintAvailable()) return;
    this.hintApproved = true;
    this.broadcastState();
  }

  isHintApproved(): boolean {
    return this.hintApproved;
  }

  giveHint(): { success: boolean; error?: string } {
    if (this.settings.hintMode === 'none') return { success: false, error: 'Hints are disabled' };

    const range = getHintTargetRange(this.teamBest);
    if (!range) return { success: false, error: 'Team is already close enough' };

    const [min, max] = range;
    const result = this.wordRanker.getWordInRange(min, max, this.usedHintWords);
    if (!result) return { success: false, error: 'No hint word available in range' };

    const guessResult: GuessResult = {
      playerId: HINT_PLAYER_ID,
      playerName: HINT_PLAYER_NAME,
      word: result.word,
      rank: result.rank,
      points: 0,
      wasFirst: false,
      isHint: true,
    };

    this.allGuesses.push(guessResult);
    if (result.rank < this.teamBest) {
      this.teamBest = result.rank;
    }
    this.usedHintWords.add(result.word);
    const grantedBy = this.settings.hintMode === 'host' ? 'host' as const : 'vote' as const;
    this.lastHintResult = { word: result.word, rank: result.rank, grantedBy };
    this.hintVotes.clear();
    this.touch();
    this.onHintRevealed(result.word, result.rank);
    this.broadcastState();
    return { success: true };
  }

  /** Total voters = connected players (host/TV display does not vote) */
  private getVoterCount(): number {
    return this.getConnectedPlayerCount();
  }

  /** Strict majority: votes must exceed half of total voters */
  private hintVotePassed(): boolean {
    return this.hintVotes.size > Math.floor(this.getVoterCount() / 2);
  }

  voteForHint(voterId: string): void {
    if (this.phase !== 'ROUND_ACTIVE' && this.phase !== 'ROUND_REVEALING') return;
    if (this.settings.hintMode !== 'vote') return;
    if (!this.isHintAvailable()) return;

    this.hintVotes.add(voterId);
    this.broadcastState();
  }

  // Guess handling
  submitGuess(playerId: string, word: string): { success: boolean; result?: GuessResult; error?: string } {
    if (this.phase !== 'ROUND_ACTIVE') return { success: false, error: 'Round not active' };
    if (this.roundGuesses.has(playerId)) return { success: false, error: 'Already guessed this round' };

    const player = this.players.get(playerId);
    if (!player) return { success: false, error: 'Player not found' };

    const normalized = word.toLowerCase().trim();

    if (this.settings.noRepeatWords && this.allGuesses.some(g => g.word === normalized && !g.isHint)) {
      return { success: false, error: 'Word already used in a previous round' };
    }

    if (!this.wordRanker.isValidWord(normalized)) {
      return { success: false, error: 'Word not in vocabulary' };
    }

    const rank = this.wordRanker.getRank(normalized);
    if (rank === null) return { success: false, error: 'Word not in vocabulary' };

    const wasFirst = this.firstSubmitterId === null;
    if (wasFirst) this.firstSubmitterId = playerId;

    const points = calculateAdvancementScore(this.teamBest, rank);

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

    // AFK detection: no guesses submitted this round
    if (this.roundGuesses.size === 0) {
      this.triggerAfkPause();
      return;
    }

    this.phase = 'ROUND_REVEALING';

    const guesses = Array.from(this.roundGuesses.values());

    // Accumulate all guesses across rounds
    this.allGuesses.push(...guesses);

    // Snapshot team best before this round's guesses update it
    const prevTeamBest = this.teamBest;

    // Update team best from this round's guesses
    for (const g of guesses) {
      if (g.rank < this.teamBest) this.teamBest = g.rank;
    }

    // Record for accolades and generate immediately (shown during reveal)
    this.accoladeEngine.recordRound(guesses);
    this.cachedAccolades = this.generateAccolades(prevTeamBest);

    // Clear last hint result — hint decisions now happen during ROUND_REVEALING
    this.lastHintResult = null;

    // Calculate reveal display time: 2s per guess, min 8s, max REVEAL_DISPLAY_TIME
    const revealTime = Math.max(8, Math.min(guesses.length * 2 + 4, REVEAL_DISPLAY_TIME));

    this.broadcastState();
    this.startPhaseTimer(revealTime);
  }

  private triggerAfkPause(): void {
    this.paused = true;
    this.afkCountdown = AFK_CLOSE_TIMEOUT;
    this.broadcastState();

    this.afkTimer = setInterval(() => {
      if (this.afkCountdown === null) return;
      this.afkCountdown--;
      this.broadcastState();

      if (this.afkCountdown <= 0) {
        this.clearAfkTimer();
        this.onAfkClose();
      }
    }, 1000);
  }

  private clearAfkTimer(): void {
    if (this.afkTimer) {
      clearInterval(this.afkTimer);
      this.afkTimer = null;
    }
  }

  private transitionToScoreboard(): void {
    this.phase = 'ROUND_SCOREBOARD';
    // Save positions before update (for next round's movement indicators)
    const scoreboard = this.getScoreboard();
    for (const entry of scoreboard) {
      this.previousPositions.set(entry.playerId, entry.currentPosition);
    }
    this.broadcastState();
    this.startPhaseTimer(SCOREBOARD_DISPLAY_TIME);
  }

  // Auto-advance through result phases
  private advancePhase(): void {
    this.hostHold = false;
    if (this.hostHoldTimeout) {
      clearTimeout(this.hostHoldTimeout);
      this.hostHoldTimeout = null;
    }
    this.touch();

    switch (this.phase) {
      case 'ROUND_REVEALING': {
        // Check if a hint should be granted (approved/voted during ROUND_ACTIVE or ROUND_REVEALING)
        const shouldGiveHint =
          (this.settings.hintMode === 'host' && this.hintApproved) ||
          (this.settings.hintMode === 'vote' && this.hintVotePassed());
        if (shouldGiveHint && this.isHintAvailable()) {
          const hintResult = this.giveHint();
          if (hintResult.success && this.lastHintResult) {
            // Transition to ROUND_HINT_REVEAL
            this.phase = 'ROUND_HINT_REVEAL';
            this.broadcastState();
            this.startPhaseTimer(HINT_REVEAL_DISPLAY_TIME);
            break;
          }
        }
        // No hint — go directly to scoreboard
        this.transitionToScoreboard();
        break;
      }
      case 'ROUND_HINT_REVEAL': {
        this.transitionToScoreboard();
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

  endGame(): void {
    if (this.phase === 'LOBBY' || this.phase === 'GAME_OVER') return;
    this.clearTimer();
    this.clearPhaseTimer();

    // If ending during an active round, collect any submitted guesses
    if (this.phase === 'ROUND_ACTIVE') {
      const guesses = Array.from(this.roundGuesses.values());
      this.allGuesses.push(...guesses);
      this.accoladeEngine.recordRound(guesses);
    }

    // Generate accolades if they haven't been generated yet this round
    if (this.phase === 'ROUND_ACTIVE') {
      this.cachedAccolades = this.generateAccolades();
    }

    this.phase = 'GAME_OVER';
    this.paused = false;
    this.touch();
    this.broadcastState();
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
    this.afkCountdown = null;
    this.previousPositions.clear();
    this.colorIndex = 0;
    this.usedHintWords.clear();
    this.hintVotes.clear();
    this.hintApproved = false;
    this.lastHintResult = null;
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
      afkCountdown: this.afkCountdown,
      guessHistory: this.getSortedHistory(),
      teamBest: this.teamBest,
      settings: { ...this.settings },
    };

    switch (this.phase) {
      case 'LOBBY':
        return { ...base, phase: 'LOBBY' };

      case 'ROUND_ACTIVE': {
        const activeState: GameState = {
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
          hintAvailable: this.isHintAvailable(),
          hintMode: this.settings.hintMode,
          hintApproved: this.hintApproved,
        };
        if (this.settings.hintMode === 'vote') {
          (activeState as import('@mmw/shared').RoundActiveState).hintVote = {
            votesNeeded: Math.floor(this.getVoterCount() / 2) + 1,
            currentVotes: this.hintVotes.size,
            voterIds: Array.from(this.hintVotes),
          };
        }
        return activeState;
      }

      case 'ROUND_REVEALING': {
        const revealState: GameState = {
          ...base,
          phase: 'ROUND_REVEALING',
          round: this.getRoundData(),
          revealedGuesses: this.getSortedGuesses(),
          accolades: this.getAccolades(),
          scoreboard: this.getScoreboard(),
          phaseTimeRemaining: this.phaseTimeRemaining,
          phaseTotalTime: this.phaseTotalTime,
          hostHold: this.hostHold,
          hintAvailable: this.isHintAvailable(),
          hintMode: this.settings.hintMode,
          hintApproved: this.hintApproved,
        };
        if (this.settings.hintMode === 'vote') {
          (revealState as import('@mmw/shared').RoundRevealingState).hintVote = {
            votesNeeded: Math.floor(this.getVoterCount() / 2) + 1,
            currentVotes: this.hintVotes.size,
            voterIds: Array.from(this.hintVotes),
          };
        }
        return revealState;
      }

      case 'ROUND_HINT_REVEAL':
        return {
          ...base,
          phase: 'ROUND_HINT_REVEAL',
          round: this.getRoundData(),
          hintWord: this.lastHintResult?.word ?? '',
          hintRank: this.lastHintResult?.rank ?? 0,
          hintGrantedBy: this.lastHintResult?.grantedBy ?? 'host',
          scoreboard: this.getScoreboard(),
          phaseTimeRemaining: this.phaseTimeRemaining,
          phaseTotalTime: this.phaseTotalTime,
          hostHold: this.hostHold,
        };

      case 'ROUND_SCOREBOARD':
        return {
          ...base,
          phase: 'ROUND_SCOREBOARD',
          round: this.getRoundData(),
          scoreboard: this.getScoreboard(),
          phaseTimeRemaining: this.phaseTimeRemaining,
          phaseTotalTime: this.phaseTotalTime,
          hostHold: this.hostHold,
        };

      case 'GAME_OVER': {
        const allBridges = this.wordRanker.getBridges();
        const guessedWords = new Set(this.allGuesses.map(g => g.word));
        const wordBridges: Record<string, string[]> = {};
        for (const word of guessedWords) {
          if (allBridges[word]) wordBridges[word] = allBridges[word];
        }
        return {
          ...base,
          phase: 'GAME_OVER',
          secretWord: this.wordRanker.getSecretWord(),
          scoreboard: this.getScoreboard(),
          accolades: this.getAccolades(),
          wordBridges,
        };
      }
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

  private generateAccolades(prevTeamBest?: number): Accolade[] {
    const guesses = Array.from(this.roundGuesses.values());
    return this.accoladeEngine.generateAccolades(guesses, this.currentRound, prevTeamBest);
  }

  private getAccolades(): Accolade[] {
    return this.cachedAccolades;
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
    this.clearAfkTimer();
    if (this.hostHoldTimeout) {
      clearTimeout(this.hostHoldTimeout);
      this.hostHoldTimeout = null;
    }
  }
}
