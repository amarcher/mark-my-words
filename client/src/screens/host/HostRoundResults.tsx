import { useState, useRef } from 'react';
import type {
  RoundRevealingState,
  RoundHintRevealState,
  RoundScoreboardState,
  GuessResult,
  Accolade,
} from '@mmw/shared';
import RankBadge from '../../components/RankBadge';
import ProximityBar from '../../components/ProximityBar';
import AccoladeCard from '../../components/AccoladeCard';
import Leaderboard from '../../components/Leaderboard';
import GuessHistory from '../../components/GuessHistory';

type ResultState = RoundRevealingState | RoundHintRevealState | RoundScoreboardState;

interface Props {
  state: ResultState;
  game: {
    notifications: string[];
  };
}

function PhaseProgressBar({ timeRemaining, totalTime, paused }: { timeRemaining: number; totalTime: number; paused: boolean }) {
  const [initialElapsed] = useState(() => totalTime - timeRemaining);

  return (
    <div className="fixed bottom-0 left-0 right-0 px-8 pb-6">
      <div className="h-1 bg-white/10 rounded-full overflow-hidden">
        <div
          className="h-full w-full bg-accent rounded-full"
          style={{
            animation: `shrinkBar ${totalTime}s linear forwards`,
            animationDelay: `-${initialElapsed}s`,
            animationPlayState: paused ? 'paused' : 'running',
          }}
        />
      </div>
      {paused && (
        <p className="text-white/30 text-xs text-center mt-1">Paused</p>
      )}
    </div>
  );
}

export default function HostRoundResults({ state }: Props) {
  const playerColorMap = new Map(state.players.map(p => [p.id, p.color]));

  // Persist data from ROUND_REVEALING across subsequent phases
  const revealDataRef = useRef<{ guesses: GuessResult[]; accolades: Accolade[] } | null>(null);
  if (state.phase === 'ROUND_REVEALING') {
    revealDataRef.current = {
      guesses: [...state.revealedGuesses].sort((a, b) => a.rank - b.rank),
      accolades: state.accolades,
    };
  }
  const revealData = revealDataRef.current;

  // Determine what's active for the left column
  const isScoreboard = state.phase === 'ROUND_SCOREBOARD';
  const isHintReveal = state.phase === 'ROUND_HINT_REVEAL';

  return (
    <>
      <div className="min-h-screen flex flex-col items-center p-8 pb-16">
        {/* Header */}
        <div className="mb-6 text-center">
          {isScoreboard ? (
            <>
              <h2 className="text-3xl font-bold mb-1">Scoreboard</h2>
              <p className="text-white/40 text-sm">
                Round {state.round.roundNumber} of {state.round.totalRounds}
              </p>
            </>
          ) : (
            <h2 className="text-3xl font-bold text-white/60">
              {isHintReveal ? 'Hint Granted!' : 'The Results Are In...'}
            </h2>
          )}
        </div>

        <div className="w-full max-w-5xl grid grid-cols-1 lg:grid-cols-2 gap-8 flex-1">
          {/* Left column: primary content */}
          <div className="space-y-4">
            {/* Hint card - appears during HINT_REVEAL, stays visible after */}
            {isHintReveal && (
              <div className="animate-scale-in mb-2">
                <div className="relative">
                  <div className="absolute inset-0 bg-amber-400/20 rounded-2xl blur-2xl" />
                  <div className="relative bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-amber-500/10 border border-amber-400/30 rounded-2xl px-8 py-6 hint-glow">
                    <p className="text-amber-300/70 text-xs uppercase tracking-widest mb-2 text-center">
                      {(state as RoundHintRevealState).hintGrantedBy === 'vote'
                        ? 'Team Voted for a Hint'
                        : 'Leader Granted a Hint'}
                    </p>
                    <div className="flex items-center justify-center gap-4">
                      <p className="text-4xl font-bold text-amber-200 font-mono">
                        "{(state as RoundHintRevealState).hintWord}"
                      </p>
                      <RankBadge rank={(state as RoundHintRevealState).hintRank} size="lg" />
                    </div>
                    <div className="w-48 mx-auto mt-3">
                      <ProximityBar rank={(state as RoundHintRevealState).hintRank} showLabel={false} />
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Scoreboard - replaces guesses in scoreboard phase */}
            {isScoreboard ? (
              <div className="animate-fade-in">
                <Leaderboard scoreboard={state.scoreboard} players={state.players} />
              </div>
            ) : revealData && (
              <>
                {/* Round guesses - animate in once during REVEALING, persist after */}
                <div className="space-y-3">
                  {revealData.guesses.map((guess, i) => (
                    <div
                      key={guess.playerId}
                      className={`flex items-center gap-4 p-4 rounded-xl bg-bg-card/50 border border-white/5 ${
                        !isHintReveal ? 'animate-slide-up' : ''
                      }`}
                      style={!isHintReveal ? { animationDelay: `${i * 100}ms` } : undefined}
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

                {/* Accolades - fade in below guesses after a delay */}
                {revealData.accolades.length > 0 && (
                  <div className="flex flex-wrap justify-center gap-6 pt-2">
                    {revealData.accolades.map((accolade, i) => (
                      <AccoladeCard
                        key={accolade.type + accolade.playerId}
                        accolade={accolade}
                        index={i}
                        players={state.players}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>

          {/* Right column: always guess history */}
          <div>
            <h3 className="text-sm text-white/40 uppercase tracking-wider text-center mb-3">All Guesses</h3>
            <div className="max-h-[75vh] overflow-y-auto">
              <GuessHistory guesses={state.guessHistory} players={state.players} />
            </div>
          </div>
        </div>
      </div>

      <PhaseProgressBar
        key={state.phase}
        timeRemaining={state.phaseTimeRemaining}
        totalTime={state.phaseTotalTime}
        paused={state.paused}
      />
    </>
  );
}
