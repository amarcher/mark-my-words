import { useState } from 'react';
import type { RoundHintRevealState } from '@mmw/shared';
import RankBadge from '../../components/RankBadge';
import ProximityBar from '../../components/ProximityBar';

interface Props {
  state: RoundHintRevealState;
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
    </div>
  );
}

export default function HostHintReveal({ state }: Props) {
  return (
    <>
      <div className="min-h-screen flex flex-col items-center justify-center p-8">
        <div className="text-center animate-scale-in">
          <p className="text-amber-300/70 text-sm uppercase tracking-widest mb-4">
            {state.hintGrantedBy === 'vote' ? 'Team Voted for a Hint!' : 'Hint Granted!'}
          </p>

          <div className="relative inline-block mb-6">
            <div className="absolute inset-0 bg-amber-400/20 rounded-2xl blur-2xl animate-pulse" />
            <div className="relative bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-amber-500/10 border border-amber-400/30 rounded-2xl px-12 py-8 hint-glow">
              <p className="text-5xl font-bold text-amber-200 font-mono">
                "{state.hintWord}"
              </p>
            </div>
          </div>

          <div className="flex items-center justify-center gap-4">
            <RankBadge rank={state.hintRank} size="lg" />
            <div className="w-48">
              <ProximityBar rank={state.hintRank} showLabel={false} />
            </div>
          </div>
        </div>
      </div>
      <PhaseProgressBar
        timeRemaining={state.phaseTimeRemaining}
        totalTime={state.phaseTotalTime}
        paused={state.paused}
      />
    </>
  );
}
