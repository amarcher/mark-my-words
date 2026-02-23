import type { RoundActiveState } from '@mmw/shared';
import Timer from '../../components/Timer';
import GuessHistory from '../../components/GuessHistory';

interface Props {
  state: RoundActiveState;
  game: {
    timeRemaining: number;
    notifications: string[];
  };
}

export default function HostGame({ state, game }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      {/* Round info + Timer */}
      <div className="text-center mb-4">
        <p className="text-white/40 text-sm uppercase tracking-widest mb-2">
          Round {state.round.roundNumber} of {state.round.totalRounds}
        </p>
        <Timer
          timeRemaining={game.timeRemaining}
          totalTime={state.round.totalTime}
        />
        <p className="text-white/30 text-sm mt-2">
          {state.round.submittedPlayerIds.length} / {state.players.filter(p => p.connected).length} submitted
        </p>
      </div>

      {/* Guess history — the main display */}
      <div className="w-full max-w-xl flex-1 overflow-y-auto">
        <GuessHistory guesses={state.guessHistory} />
      </div>

      {/* Notifications */}
      <div className="fixed bottom-4 right-4 space-y-2">
        {game.notifications.map((n, i) => (
          <div key={i} className="bg-bg-card border border-white/10 rounded-lg px-4 py-2 text-sm animate-slide-up">
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
