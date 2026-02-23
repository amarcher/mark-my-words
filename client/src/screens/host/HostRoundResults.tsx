import type {
  RoundRevealingState,
  RoundAccoladesState,
  RoundScoreboardState,
} from '@mmw/shared';
import RankBadge from '../../components/RankBadge';
import ProximityBar from '../../components/ProximityBar';
import AccoladeCard from '../../components/AccoladeCard';
import Leaderboard from '../../components/Leaderboard';
import GuessHistory from '../../components/GuessHistory';

interface Props {
  state: RoundRevealingState | RoundAccoladesState | RoundScoreboardState;
  game: {
    notifications: string[];
  };
}

function PhaseProgressBar({ timeRemaining, totalTime, paused }: { timeRemaining: number; totalTime: number; paused: boolean }) {
  const progress = totalTime > 0 ? (timeRemaining / totalTime) * 100 : 0;

  return (
    <div className="w-full mt-6">
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className={`h-full bg-accent rounded-full transition-all duration-1000 ${paused ? '' : 'ease-linear'}`}
          style={{ width: `${progress}%` }}
        />
      </div>
      {paused && (
        <p className="text-white/30 text-xs text-center mt-1">Paused</p>
      )}
    </div>
  );
}

function RevealView({ state }: { state: RoundRevealingState }) {
  const playerColorMap = new Map(state.players.map(p => [p.id, p.color]));

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <h2 className="text-3xl font-bold mb-6 text-white/60">The Results Are In...</h2>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        {/* Round guesses */}
        <div className="space-y-3">
          {state.revealedGuesses.map((guess, i) => (
            <div
              key={guess.playerId}
              className="flex items-center gap-4 p-4 rounded-xl bg-bg-card/50 border border-white/5 animate-slide-up"
              style={{ animationDelay: `${i * 200}ms` }}
            >
              <RankBadge rank={guess.rank} size="md" />
              <div className="flex-1">
                <p
                  className="font-semibold text-lg"
                  style={{ color: playerColorMap.get(guess.playerId) || undefined }}
                >
                  {guess.playerName}
                </p>
                <p className="text-white/40 font-mono text-base">"{guess.word}"</p>
              </div>
              <div className="w-32">
                <ProximityBar rank={guess.rank} showLabel={false} />
              </div>
              <span className="font-mono text-accent text-base">+{guess.points}</span>
            </div>
          ))}
        </div>

        {/* Guess history */}
        <div>
          <h3 className="text-sm text-white/40 uppercase tracking-wider text-center mb-3">All Guesses</h3>
          <div className="max-h-[75vh] overflow-y-auto">
            <GuessHistory guesses={state.guessHistory} players={state.players} />
          </div>
        </div>
      </div>

      <PhaseProgressBar
        timeRemaining={state.phaseTimeRemaining}
        totalTime={state.phaseTotalTime}
        paused={state.paused}
      />
    </div>
  );
}

function AccoladesView({ state }: { state: RoundAccoladesState }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-8">
      <h2 className="text-3xl font-bold mb-10 text-white/60">Awards Ceremony</h2>

      <div className="flex flex-wrap justify-center gap-6">
        {state.accolades.map((accolade, i) => (
          <AccoladeCard key={accolade.type + accolade.playerId} accolade={accolade} index={i} players={state.players} />
        ))}
      </div>

      <PhaseProgressBar
        timeRemaining={state.phaseTimeRemaining}
        totalTime={state.phaseTotalTime}
        paused={state.paused}
      />
    </div>
  );
}

function ScoreboardView({ state }: { state: RoundScoreboardState }) {
  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      <h2 className="text-3xl font-bold mb-2">Scoreboard</h2>
      <p className="text-white/40 text-sm mb-6">
        Round {state.round.roundNumber} of {state.round.totalRounds}
      </p>

      <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
        {/* Leaderboard */}
        <div>
          <Leaderboard scoreboard={state.scoreboard} players={state.players} />
        </div>

        {/* Guess history */}
        <div>
          <h3 className="text-sm text-white/40 uppercase tracking-wider text-center mb-3">All Guesses</h3>
          <div className="max-h-[75vh] overflow-y-auto">
            <GuessHistory guesses={state.guessHistory} players={state.players} />
          </div>
        </div>
      </div>

      <PhaseProgressBar
        timeRemaining={state.phaseTimeRemaining}
        totalTime={state.phaseTotalTime}
        paused={state.paused}
      />
    </div>
  );
}

export default function HostRoundResults({ state, game }: Props) {
  switch (state.phase) {
    case 'ROUND_REVEALING':
      return <RevealView state={state} />;
    case 'ROUND_ACCOLADES':
      return <AccoladesView state={state} />;
    case 'ROUND_SCOREBOARD':
      return <ScoreboardView state={state} />;
  }
}
