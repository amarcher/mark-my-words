import type { Player } from '@mmw/shared';

interface PlayerListProps {
  players: Player[];
  leaderId?: string;
  currentPlayerId?: string;
  onKick?: (playerId: string) => void;
  submittedIds?: string[];
}

export default function PlayerList({ players, leaderId, currentPlayerId, onKick, submittedIds }: PlayerListProps) {
  return (
    <div className="space-y-2 w-full max-w-md mx-auto">
      {players.map(player => (
        <div
          key={player.id}
          className={`flex items-center gap-3 p-3 rounded-xl border transition-all ${
            !player.connected
              ? 'bg-bg-card/30 border-white/5 opacity-50'
              : submittedIds?.includes(player.id)
              ? 'bg-rank-green/10 border-rank-green/20'
              : 'bg-bg-card/50 border-white/5'
          }`}
        >
          {/* Avatar */}
          <div
            className="w-8 h-8 rounded-full flex items-center justify-center font-bold text-sm"
            style={{
              backgroundColor: player.color ? `${player.color}33` : undefined,
              color: player.color || undefined,
            }}
          >
            {player.name[0].toUpperCase()}
          </div>

          {/* Name */}
          <span className="flex-1 font-medium truncate">
            {player.name}
            {player.id === leaderId && (
              <span className="ml-2 text-xs text-accent bg-accent/10 px-2 py-0.5 rounded-full">
                Leader
              </span>
            )}
            {!player.connected && (
              <span className="ml-2 text-xs text-rank-red">Disconnected</span>
            )}
          </span>

          {/* Submitted indicator */}
          {submittedIds?.includes(player.id) && (
            <span className="text-rank-green text-sm">✓</span>
          )}

          {/* Kick button */}
          {onKick && player.id !== currentPlayerId && (
            <button
              onClick={() => onKick(player.id)}
              className="text-white/20 hover:text-rank-red text-sm transition-colors"
            >
              ✕
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
