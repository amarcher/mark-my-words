import type { ScoreEntry, Player } from '@mmw/shared';

interface LeaderboardProps {
  scoreboard: ScoreEntry[];
  showRoundScore?: boolean;
  compact?: boolean;
  submittedIds?: string[];
  players?: Player[];
}

const POSITION_COLORS: Record<number, string> = {
  1: 'text-gold',
  2: 'text-silver',
  3: 'text-bronze',
};

const POSITION_ICONS: Record<number, string> = {
  1: '👑',
  2: '🥈',
  3: '🥉',
};

export default function Leaderboard({ scoreboard, showRoundScore = true, compact = false, submittedIds, players }: LeaderboardProps) {
  const playerColorMap = new Map(players?.map(p => [p.id, p.color]) ?? []);

  return (
    <div className={`w-full max-w-lg mx-auto ${compact ? 'space-y-1' : 'space-y-2'}`}>
      {scoreboard.map((entry, i) => {
        const moved = entry.previousPosition > 0
          ? entry.previousPosition - entry.currentPosition
          : 0;
        const hasSubmitted = submittedIds?.includes(entry.playerId);

        return (
          <div
            key={entry.playerId}
            className={`flex items-center gap-3 ${compact ? 'p-2' : 'p-3'} rounded-xl border ${
              hasSubmitted
                ? 'bg-rank-green/10 border-rank-green/20'
                : 'bg-bg-card/50 border-white/5'
            }`}
          >
            {/* Position */}
            <div className={`w-8 text-center font-bold ${POSITION_COLORS[entry.currentPosition] || 'text-white/50'}`}>
              {POSITION_ICONS[entry.currentPosition] || `${entry.currentPosition}`}
            </div>

            {/* Name */}
            <div
              className="flex-1 font-semibold truncate"
              style={{ color: playerColorMap.get(entry.playerId) || undefined }}
            >
              {entry.playerName}
            </div>

            {/* Submitted indicator */}
            {hasSubmitted && (
              <span className="text-rank-green text-sm">✓</span>
            )}

            {/* Movement indicator */}
            {moved !== 0 && (
              <span className={`text-xs font-mono ${moved > 0 ? 'text-rank-green' : 'text-rank-red'}`}>
                {moved > 0 ? `↑${moved}` : `↓${Math.abs(moved)}`}
              </span>
            )}

            {/* Round score */}
            {showRoundScore && entry.roundScore > 0 && (
              <span className="text-sm text-accent font-mono">
                +{entry.roundScore}
              </span>
            )}

            {/* Total score */}
            <div className="font-mono font-bold text-white/80 min-w-[4rem] text-right">
              {entry.totalScore.toLocaleString()}
            </div>
          </div>
        );
      })}
    </div>
  );
}
