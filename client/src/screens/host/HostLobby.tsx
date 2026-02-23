import type { LobbyState } from '@mmw/shared';
import { QRCodeSVG } from 'qrcode.react';
import RoomCode from '../../components/RoomCode';
import PlayerList from '../../components/PlayerList';

interface Props {
  state: LobbyState;
  game: {
    updateSettings: (s: Record<string, unknown>) => void;
    notifications: string[];
  };
}

export default function HostLobby({ state, game }: Props) {
  const leaderName = state.players.find(p => p.id === state.leaderId)?.name;
  const joinUrl = `${window.location.origin}/play/${state.roomCode}`;

  return (
    <div className="min-h-screen flex flex-col items-center p-8">
      {/* Room Code + QR */}
      <div className="mb-8 flex flex-col items-center">
        <RoomCode code={state.roomCode} />
        <div className="mt-4 p-3 bg-white rounded-xl">
          <QRCodeSVG value={joinUrl} size={160} />
        </div>
        <p className="text-white/30 text-xs mt-2">Scan to join</p>
      </div>

      {/* Settings */}
      <div className="card mb-6 w-full max-w-md">
        <div className="flex items-center justify-between mb-4">
          <h3 className="font-semibold text-white/60 text-sm uppercase tracking-wider">Settings</h3>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="text-xs text-white/40 block mb-1">Rounds</label>
            <select
              value={state.settings.maxRounds}
              onChange={e => game.updateSettings({ maxRounds: Number(e.target.value) })}
              className="input-field w-full text-sm"
            >
              {[3, 5, 7, 10, 15, 20].map(n => (
                <option key={n} value={n}>{n}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs text-white/40 block mb-1">Round Timer</label>
            <select
              value={state.settings.roundTime}
              onChange={e => game.updateSettings({ roundTime: Number(e.target.value) })}
              className="input-field w-full text-sm"
            >
              {[15, 20, 30, 45, 60, 90, 120].map(n => (
                <option key={n} value={n}>{n}s</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Players */}
      <div className="w-full max-w-md mb-6">
        <h3 className="text-sm text-white/40 uppercase tracking-wider mb-3 text-center">
          Players ({state.players.length})
        </h3>
        <PlayerList
          players={state.players}
          leaderId={state.leaderId}
        />
      </div>

      {/* Waiting message */}
      <p className="text-white/40 animate-pulse text-center">
        {state.players.length < 2
          ? 'Waiting for players to join...'
          : `Waiting for ${leaderName || 'leader'} to start...`}
      </p>

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
