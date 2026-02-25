import type { RoundHintRevealState } from '@mmw/shared';
import RankBadge from '../../components/RankBadge';

interface Props {
  state: RoundHintRevealState;
}

export default function PlayerHintReveal({ state }: Props) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <div className="text-center animate-scale-in">
        <p className="text-amber-300/80 text-xs uppercase tracking-widest mb-3">
          {state.hintGrantedBy === 'vote' ? 'Team Voted for a Hint!' : 'Hint Granted!'}
        </p>

        <div className="relative inline-block mb-4">
          <div className="absolute inset-0 bg-amber-400/20 rounded-2xl blur-xl animate-pulse" />
          <div className="relative bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-amber-500/10 border border-amber-400/30 rounded-2xl px-8 py-5 hint-glow">
            <p className="text-3xl font-bold text-amber-200 font-mono">
              "{state.hintWord}"
            </p>
          </div>
        </div>

        <div className="flex items-center justify-center gap-3 mt-2">
          <RankBadge rank={state.hintRank} size="md" />
        </div>
      </div>
    </div>
  );
}
