import { useRef, useEffect } from 'react';
import type {
  RoundRevealingState,
  RoundHintRevealState,
  RoundScoreboardState,
  GameOverState,
  GuessResult,
  Accolade,
} from '@mmw/shared';
import RankBadge from '../../components/RankBadge';
import AccoladeCard from '../../components/AccoladeCard';
import Leaderboard from '../../components/Leaderboard';
import WordConnections from '../../components/WordConnections';
import GuessHistory from '../../components/GuessHistory';
import PlayerRevealStep from '../../components/PlayerRevealStep';
import { useRevealSequence } from '../../hooks/useRevealSequence';
import { socket } from '../../socket';

type ResultState = RoundRevealingState | RoundHintRevealState | RoundScoreboardState | GameOverState;

const ACCOLADE_DISPLAY_MS = 3000;

interface Props {
  state: ResultState;
  game: {
    lastGuessResult: GuessResult | null;
    playAgain: () => void;
    closeRoom: () => void;
    leaveRoom: () => void;
    notifications: string[];
    requestHint: () => void;
  };
}

export default function PlayerResults({ state, game }: Props) {
  const playerId = socket.id || '';
  const isLeader = playerId === state.leaderId;
  const leaderName = state.players.find(p => p.id === state.leaderId)?.name;

  const isRevealing = state.phase === 'ROUND_REVEALING';

  const reveal = useRevealSequence(
    isRevealing,
    isRevealing ? state.revealedGuesses : undefined,
    isRevealing ? state.accolades : undefined,
  );

  // Auto-advance after accolades display
  const accoladeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => {
    if (reveal.showingAccolades) {
      accoladeTimerRef.current = setTimeout(() => {
        reveal.advance();
      }, ACCOLADE_DISPLAY_MS);
    }
    return () => {
      if (accoladeTimerRef.current) clearTimeout(accoladeTimerRef.current);
    };
  }, [reveal.showingAccolades, reveal.advance]);

  // Persist data from ROUND_REVEALING for use in subsequent phases
  const revealDataRef = useRef<{ guesses: GuessResult[]; accolades: Accolade[] } | null>(null);
  if (isRevealing && reveal.shuffledGuesses.length > 0) {
    revealDataRef.current = {
      guesses: [...reveal.shuffledGuesses].sort((a, b) => a.rank - b.rank),
      accolades: reveal.accolades,
    };
  }

  if (state.phase === 'GAME_OVER') {
    const winner = state.scoreboard[0];

    return (
      <div className="min-h-screen flex flex-col items-center p-6">
        <h1 className="text-xl font-bold mb-4 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
          Mark My Words
        </h1>
        <div className="text-center mb-4 animate-scale-in">
          <p className="text-white/40 text-xs uppercase tracking-widest mb-2">The Secret Word Was</p>
          <h1 className="text-4xl font-bold text-accent">{state.secretWord}</h1>
        </div>

        {/* Winner */}
        {winner && (
          <div className="text-center mb-6 animate-bounce-in">
            <p className="text-2xl mb-1">👑</p>
            <p className="text-lg font-bold text-gold">{winner.playerName}</p>
            <p className="text-white/40 text-sm">{winner.totalScore.toLocaleString()} pts</p>
          </div>
        )}

        {/* Final Standings */}
        <div className="w-full max-w-sm mb-6">
          <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">Final Standings</p>
          <Leaderboard scoreboard={state.scoreboard} showRoundScore={false} players={state.players} compact />
        </div>

        {/* Word Connections */}
        {Object.keys(state.wordBridges).length > 0 && (
          <div className="w-full max-w-sm mb-6">
            <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">How It Connects</p>
            <div className="max-h-[40vh] overflow-y-auto rounded-lg">
              <WordConnections secretWord={state.secretWord} guesses={state.guessHistory} wordBridges={state.wordBridges} />
            </div>
          </div>
        )}

        {/* All Guesses */}
        {state.guessHistory.length > 0 && (
          <div className="w-full max-w-sm mb-6">
            <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">All Guesses</p>
            <div className="max-h-[40vh] overflow-y-auto rounded-lg">
              <GuessHistory guesses={state.guessHistory} players={state.players} />
            </div>
          </div>
        )}

        {isLeader ? (
          <div className="flex flex-col items-center gap-3 mt-2">
            <button onClick={game.playAgain} className="btn-primary text-lg px-12">
              Play Again
            </button>
            <button onClick={game.closeRoom} className="text-white/30 hover:text-white/50 text-sm transition-colors">
              Close Room
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3 mt-2">
            <p className="text-white/30 text-sm animate-pulse">
              Waiting for {leaderName || 'leader'}...
            </p>
            <button onClick={game.leaveRoom} className="text-white/30 hover:text-white/50 text-sm transition-colors">
              Leave Room
            </button>
          </div>
        )}
      </div>
    );
  }

  // During ROUND_REVEALING with active per-player sequence
  if (isRevealing && !reveal.done && !reveal.showingAccolades && reveal.currentGuess) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        <PlayerRevealStep
          key={reveal.step}
          guess={reveal.currentGuess}
          previousGuesses={reveal.previousGuesses}
          players={state.players}
          onComplete={reveal.advance}
          compact
        />
      </div>
    );
  }

  // Accolades step (still during ROUND_REVEALING, compact view)
  if (isRevealing && reveal.showingAccolades) {
    const myAccolades = reveal.accolades.filter(a => a.playerId === playerId);

    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-6">
        {myAccolades.length > 0 ? (
          <>
            <p className="text-white/30 text-xs uppercase tracking-widest mb-4 text-center">Your Awards</p>
            <div className="w-full max-w-sm space-y-3">
              {myAccolades.map((a, i) => (
                <AccoladeCard key={a.type} accolade={a} index={i} />
              ))}
            </div>
          </>
        ) : (
          <p className="text-white/40 text-sm">Awards being announced...</p>
        )}
      </div>
    );
  }

  // ROUND_HINT_REVEAL and ROUND_SCOREBOARD
  const isHintReveal = state.phase === 'ROUND_HINT_REVEAL';
  const isScoreboard = state.phase === 'ROUND_SCOREBOARD';
  const revealData = revealDataRef.current;

  return (
    <div className="min-h-screen flex flex-col items-center p-6">
      {/* Header */}
      <h2 className="text-xl font-bold text-white/60 mb-4">
        {isScoreboard ? 'Scoreboard' : isHintReveal ? 'Hint Granted!' : 'Round Results'}
      </h2>

      {/* Hint card - shown during hint reveal */}
      {isHintReveal && (
        <div className="w-full max-w-sm mb-4 animate-scale-in">
          <div className="relative">
            <div className="absolute inset-0 bg-amber-400/20 rounded-2xl blur-xl" />
            <div className="relative bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-amber-500/10 border border-amber-400/30 rounded-2xl px-6 py-4 hint-glow">
              <p className="text-amber-300/70 text-xs uppercase tracking-widest mb-2 text-center">
                {(state as RoundHintRevealState).hintGrantedBy === 'vote'
                  ? 'Team Voted for a Hint'
                  : 'Leader Granted a Hint'}
              </p>
              <div className="flex items-center justify-center gap-3">
                <p className="text-3xl font-bold text-amber-200 font-mono">
                  "{(state as RoundHintRevealState).hintWord}"
                </p>
                <RankBadge rank={(state as RoundHintRevealState).hintRank} size="md" />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Scoreboard phase: position + leaderboard */}
      {isScoreboard && (() => {
        const myEntry = state.scoreboard.find(e => e.playerId === playerId);
        return (
          <>
            {myEntry && (
              <div className="text-center mb-4 animate-scale-in">
                <p className="text-4xl font-bold text-accent">#{myEntry.currentPosition}</p>
                <p className="text-white/40 text-sm">{myEntry.totalScore.toLocaleString()} total points</p>
              </div>
            )}
            <div className="w-full max-w-sm">
              <Leaderboard scoreboard={state.scoreboard} compact />
            </div>
          </>
        );
      })()}

      {/* Hint reveal phase: show round summary */}
      {isHintReveal && revealData && (
        <div className="w-full max-w-sm space-y-2 mt-2">
          {revealData.guesses.map((guess) => {
            const isMe = guess.playerId === playerId;
            return (
              <div
                key={guess.playerId}
                className={`flex items-center gap-3 p-3 rounded-xl ${
                  isMe
                    ? 'bg-accent/10 border border-accent/30'
                    : 'bg-bg-card/50 border border-white/5'
                }`}
              >
                <RankBadge rank={guess.rank} size="sm" />
                <div className="flex-1 min-w-0">
                  <p className={`font-semibold text-sm truncate ${isMe ? 'text-accent' : 'text-white/70'}`}>
                    {isMe ? 'You' : guess.playerName}
                  </p>
                  <p className="text-white/40 font-mono text-xs truncate">"{guess.word}"</p>
                </div>
                <span className="font-mono text-accent text-sm shrink-0">+{guess.points}</span>
              </div>
            );
          })}
        </div>
      )}

      {/* Hint request buttons during reveal phase (when reveals are done) */}
      {isRevealing && reveal.done && state.phase === 'ROUND_REVEALING' && (
        <>
          {state.hintMode === 'host' && state.hintAvailable && isLeader && (
            <button
              onClick={game.requestHint}
              disabled={state.hintApproved}
              className={`mt-4 text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors border ${
                state.hintApproved
                  ? 'text-amber-300/50 border-amber-400/15 bg-amber-500/5 cursor-not-allowed'
                  : 'text-amber-300 border-amber-400/30 hover:bg-amber-400/10 bg-gradient-to-r from-amber-500/5 to-yellow-500/5'
              }`}
            >
              {state.hintApproved ? 'Hint Queued' : 'Grant Hint'}
            </button>
          )}

          {state.hintMode === 'vote' && state.hintAvailable && state.hintVote && (() => {
            const hasVoted = state.hintVote!.voterIds.includes(socket.id || '');
            return (
              <button
                onClick={game.requestHint}
                disabled={hasVoted}
                className={`mt-4 text-xs font-semibold rounded-lg px-4 py-1.5 transition-colors border ${
                  hasVoted
                    ? 'text-amber-300/50 border-amber-400/15 bg-amber-500/5 cursor-not-allowed'
                    : 'text-amber-300 border-amber-400/30 hover:bg-amber-400/10 bg-gradient-to-r from-amber-500/5 to-yellow-500/5'
                }`}
              >
                {hasVoted
                  ? `Voted (${state.hintVote!.currentVotes}/${state.hintVote!.votesNeeded})`
                  : `Vote for Hint (${state.hintVote!.currentVotes}/${state.hintVote!.votesNeeded})`}
              </button>
            );
          })()}
        </>
      )}
    </div>
  );
}
