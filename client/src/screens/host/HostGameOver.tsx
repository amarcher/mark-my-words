import type { GameOverState } from '@mmw/shared';
import Leaderboard from '../../components/Leaderboard';
import GuessHistory from '../../components/GuessHistory';

interface Props {
  state: GameOverState;
  game: {};
}

export default function HostGameOver({ state, game }: Props) {
  const winner = state.scoreboard[0];
  const leaderName = state.players.find(p => p.id === state.leaderId)?.name;

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      {/* Secret word reveal */}
      <div className="text-center mb-6 animate-scale-in">
        <p className="text-white/40 text-sm uppercase tracking-widest mb-2">The Secret Word Was</p>
        <h1 className="text-5xl font-bold text-accent mb-4">{state.secretWord}</h1>
      </div>

      {/* Winner announcement */}
      {winner && (
        <div className="text-center mb-6 animate-bounce-in">
          <p className="text-3xl mb-2">👑</p>
          <h2 className="text-2xl font-bold text-gold">{winner.playerName}</h2>
          <p className="text-white/40">wins with {winner.totalScore.toLocaleString()} points!</p>
        </div>
      )}

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        {/* Final scoreboard */}
        <div>
          <h3 className="text-sm text-white/40 uppercase tracking-wider text-center mb-4">Final Standings</h3>
          <Leaderboard scoreboard={state.scoreboard} showRoundScore={false} />
        </div>

        {/* Guess history */}
        <div>
          <h3 className="text-sm text-white/40 uppercase tracking-wider text-center mb-4">All Guesses</h3>
          <div className="max-h-[60vh] overflow-y-auto">
            <GuessHistory guesses={state.guessHistory} />
          </div>
        </div>
      </div>

      {/* Waiting for leader */}
      <p className="text-white/40 animate-pulse mt-6">
        Waiting for {leaderName || 'leader'}...
      </p>
    </div>
  );
}
