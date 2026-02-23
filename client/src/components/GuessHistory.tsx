import type { GuessResult, Player } from '@mmw/shared';
import { getRankColor } from '@mmw/shared';

interface GuessHistoryProps {
  guesses: GuessResult[];
  players?: Player[];
}

export default function GuessHistory({ guesses, players }: GuessHistoryProps) {
  if (guesses.length === 0) {
    return (
      <div className="text-center text-white/20 py-8">
        No guesses yet
      </div>
    );
  }

  const playerColorMap = new Map(players?.map(p => [p.id, p.color]) ?? []);

  return (
    <div className="w-full space-y-1.5">
      {guesses.map((guess, i) => {
        const color = getRankColor(guess.rank);
        const playerColor = playerColorMap.get(guess.playerId);
        const isWin = guess.rank === 1;
        const isHint = guess.isHint === true;

        return (
          <div
            key={`${guess.word}-${guess.playerId}`}
            className={`flex items-center gap-4 px-3 py-2 rounded-lg ${
              isHint
                ? 'bg-gradient-to-r from-amber-500/10 via-yellow-400/15 to-amber-500/10 border border-amber-400/25 hint-glow'
                : isWin
                  ? 'bg-gold/10 border border-gold/30'
                  : 'bg-white/[0.03]'
            }`}
          >
            {/* Rank */}
            <span
              className="font-mono font-bold text-base min-w-[3.5rem] text-right"
              style={{ color: isHint ? '#fcd34d' : color }}
            >
              {isWin ? '★' : `#${guess.rank.toLocaleString()}`}
            </span>

            {/* Color bar indicator */}
            <div
              className={`w-1 h-5 rounded-full flex-shrink-0 ${isHint ? 'bg-gradient-to-b from-amber-300 to-yellow-500' : ''}`}
              style={isHint ? undefined : { backgroundColor: color }}
            />

            {/* Word */}
            <span
              className="font-mono font-medium text-base flex-1 truncate"
              style={isHint ? { color: '#fcd34d' } : undefined}
            >
              {guess.word}
            </span>

            {/* Player name with color dot */}
            {isHint ? (
              <span className="text-sm text-amber-300 truncate max-w-[8rem]">
                ✦ Hint
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-sm truncate max-w-[8rem]">
                {playerColor && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: playerColor }}
                  />
                )}
                <span
                  className="truncate"
                  style={{ color: playerColor || 'rgba(255,255,255,0.4)' }}
                >
                  {guess.playerName}
                </span>
              </span>
            )}
          </div>
        );
      })}
    </div>
  );
}
