import { useState } from 'react';
import type { RoundActiveState, GuessResult } from '@mmw/shared';
import { getRankColor } from '@mmw/shared';
import GuessInput from '../../components/GuessInput';
import Timer from '../../components/Timer';
import RankBadge from '../../components/RankBadge';
import ProximityBar from '../../components/ProximityBar';
import GuessHistory from '../../components/GuessHistory';
import Leaderboard from '../../components/Leaderboard';
import { socket } from '../../socket';

interface Props {
  state: RoundActiveState;
  game: {
    submitGuess: (word: string) => Promise<{ success: boolean; result?: GuessResult; error?: string }>;
    lastGuessResult: GuessResult | null;
    timeRemaining: number;
    notifications: string[];
    endGame: () => void;
  };
}

export default function PlayerGame({ state, game }: Props) {
  const [error, setError] = useState('');
  const hasSubmitted = state.round.submittedPlayerIds.includes(socket.id || '');
  const isLeader = socket.id === state.leaderId;

  const handleGuess = async (word: string) => {
    setError('');
    const result = await game.submitGuess(word);
    if (!result.success) {
      setError(result.error || 'Invalid guess');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-xl font-bold mb-3 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
        Mark My Words
      </h1>
      {/* Round info + Timer */}
      <div className="text-center mb-6">
        <p className="text-white/40 text-xs uppercase tracking-widest mb-2">
          Round {state.round.roundNumber} / {state.round.totalRounds}
        </p>
        <Timer
          timeRemaining={game.timeRemaining}
          totalTime={state.round.totalTime}
          size="sm"
        />
      </div>

      {/* Guess input or result */}
      {hasSubmitted && game.lastGuessResult ? (
        <div className="text-center animate-scale-in">
          <p className="text-white/40 text-sm mb-4">Your guess</p>
          <p className="text-2xl font-bold mb-3 font-mono">"{game.lastGuessResult.word}"</p>
          <RankBadge rank={game.lastGuessResult.rank} size="lg" />
          <div className="w-64 mx-auto mt-4">
            <ProximityBar rank={game.lastGuessResult.rank} />
          </div>
          <p className="text-accent font-mono font-bold text-lg mt-3">
            +{game.lastGuessResult.points} pts
          </p>
          <p className="text-white/30 text-sm mt-4 animate-pulse">
            Waiting for other players...
          </p>
        </div>
      ) : (
        <div className="w-full">
          <h2 className="text-xl font-bold text-center mb-6">
            Guess the secret word!
          </h2>
          <GuessInput onSubmit={handleGuess} error={error} />
        </div>
      )}

      {/* Submission count */}
      <p className="text-white/20 text-xs mt-6">
        {state.round.submittedPlayerIds.length} / {state.players.filter(p => p.connected).length} submitted
      </p>

      {/* Standings + Previous guesses */}
      {state.scoreboard.length > 0 && (
        <div className="w-full max-w-sm mt-6 max-h-[40vh] overflow-y-auto rounded-lg">
          <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">
            Standings
          </p>
          <Leaderboard
            scoreboard={state.scoreboard}
            players={state.players}
            submittedIds={state.round.submittedPlayerIds}
            compact
          />

          {state.guessHistory.length > 0 && (
            <div className="mt-4">
              <p className="text-white/30 text-xs uppercase tracking-widest mb-2 text-center">
                Previous Guesses
              </p>
              <GuessHistory guesses={state.guessHistory} players={state.players} />
            </div>
          )}
        </div>
      )}

      {/* End Game (leader only) */}
      {isLeader && (
        <button
          onClick={game.endGame}
          className="mt-6 text-sm text-amber-400 border border-amber-500/20 rounded-lg px-4 py-2 hover:bg-amber-500/10 transition-colors"
        >
          End Game
        </button>
      )}

      {/* Notifications */}
      <div className="fixed bottom-4 left-4 right-4 space-y-2">
        {game.notifications.map((n, i) => (
          <div key={i} className="bg-bg-card border border-white/10 rounded-lg px-4 py-2 text-sm text-center animate-slide-up">
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
