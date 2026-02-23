import type { LobbyState } from '@mmw/shared';
import RoomCode from '../../components/RoomCode';
import PlayerList from '../../components/PlayerList';
import { socket } from '../../socket';

interface Props {
  state: LobbyState;
  game: {
    leaveRoom: () => void;
    startGame: () => void;
    kickPlayer: (id: string) => void;
    notifications: string[];
  };
}

export default function PlayerLobby({ state, game }: Props) {
  const playerId = socket.id || '';
  const isLeader = playerId === state.leaderId;
  const leaderName = state.players.find(p => p.id === state.leaderId)?.name;
  const connectedCount = state.players.filter(p => p.connected).length;

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <RoomCode code={state.roomCode} size="sm" />

      <div className="w-full max-w-sm my-6">
        <PlayerList
          players={state.players}
          leaderId={state.leaderId}
          currentPlayerId={playerId}
          onKick={isLeader ? game.kickPlayer : undefined}
        />
      </div>

      {isLeader ? (
        <button
          onClick={game.startGame}
          disabled={connectedCount < 2}
          className="btn-primary text-lg px-12 mb-4"
        >
          {connectedCount < 2 ? 'Waiting for players...' : 'Start Game'}
        </button>
      ) : (
        <p className="text-white/40 text-center animate-pulse mb-4">
          Waiting for {leaderName || 'leader'} to start...
        </p>
      )}

      <button onClick={game.leaveRoom} className="text-white/30 hover:text-white/50 text-sm transition-colors">
        Leave Room
      </button>

      {/* Notifications */}
      <div className="fixed bottom-4 left-4 right-4 space-y-2">
        {game.notifications.map((n, i) => (
          <div key={i} className="bg-bg-card border border-white/10 rounded-lg px-4 py-2 text-sm text-center animate-slide-up">
            {n}
          </div>
        ))}
      </div>
    </div>
  );
}
