import type { GuessResult } from '@mmw/shared';
import { getRankColor } from '@mmw/shared';

interface GuessHistoryProps {
  guesses: GuessResult[];
}

export default function GuessHistory({ guesses }: GuessHistoryProps) {
  if (guesses.length === 0) {
    return (
      <div className="text-center text-white/20 py-8">
        No guesses yet
      </div>
    );
  }

  return (
    <div className="w-full space-y-1">
      {guesses.map((guess, i) => {
        const color = getRankColor(guess.rank);
        const isWin = guess.rank === 1;

        return (
          <div
            key={`${guess.word}-${guess.playerId}`}
            className={`flex items-center gap-3 px-3 py-1.5 rounded-lg ${
              isWin ? 'bg-gold/10 border border-gold/30' : 'bg-white/[0.03]'
            }`}
          >
            {/* Rank */}
            <span
              className="font-mono font-bold text-sm min-w-[3.5rem] text-right"
              style={{ color }}
            >
              {isWin ? '★' : `#${guess.rank.toLocaleString()}`}
            </span>

            {/* Color bar indicator */}
            <div
              className="w-1 h-5 rounded-full flex-shrink-0"
              style={{ backgroundColor: color }}
            />

            {/* Word */}
            <span className="font-mono font-medium flex-1 truncate">
              {guess.word}
            </span>

            {/* Player name */}
            <span className="text-white/30 text-xs truncate max-w-[6rem]">
              {guess.playerName}
            </span>
          </div>
        );
      })}
    </div>
  );
}
