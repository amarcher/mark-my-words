import { useState } from 'react';
import { useSocket, useGameState } from '../../socket';
import HostLobby from './HostLobby';
import HostGame from './HostGame';
import HostRoundResults from './HostRoundResults';
import HostGameOver from './HostGameOver';
import PauseOverlay from '../../components/PauseOverlay';
import RoomClosedModal from '../../components/RoomClosedModal';

export default function HostScreen() {
  const { connected, reconnecting } = useSocket();
  const game = useGameState();
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');

  const handleCreate = async () => {
    setCreating(true);
    setError('');
    const result = await game.createRoom();
    setCreating(false);
    if (!result.success) {
      setError(result.error || 'Failed to create room');
    }
  };

  if (!connected) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 animate-pulse">Connecting to server...</p>
      </div>
    );
  }

  if (reconnecting) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="text-white/40 animate-pulse">Reconnecting...</p>
      </div>
    );
  }

  // Not yet in a room — show create button
  if (!game.gameState) {
    return (
      <>
        <div className="min-h-screen flex flex-col items-center justify-center p-6">
          <h1 className="text-4xl font-bold mb-8 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
            Mark My Words
          </h1>
          <div className="w-full max-w-xs space-y-4">
            <button
              onClick={handleCreate}
              disabled={creating}
              className="btn-primary w-full"
            >
              {creating ? 'Creating...' : 'Create Room'}
            </button>
            {error && <p className="text-rank-red text-sm text-center">{error}</p>}
          </div>
        </div>
        {game.roomClosedMessage && (
          <RoomClosedModal message={game.roomClosedMessage} onDismiss={game.dismissRoomClosed} />
        )}
      </>
    );
  }

  const { gameState } = game;
  const showPauseOverlay = gameState.phase !== 'LOBBY';

  return (
    <>
      {showPauseOverlay && (
        <PauseOverlay
          paused={gameState.paused}
          onPause={game.pause}
          onResume={game.resume}
          onLeave={game.closeRoom}
          onEndGame={game.endGame}
        />
      )}

      {(() => {
        switch (gameState.phase) {
          case 'LOBBY':
            return <HostLobby state={gameState} game={game} />;
          case 'ROUND_ACTIVE':
            return <HostGame state={gameState} game={game} />;
          case 'ROUND_REVEALING':
          case 'ROUND_ACCOLADES':
          case 'ROUND_SCOREBOARD':
            return <HostRoundResults state={gameState} game={game} />;
          case 'GAME_OVER':
            return <HostGameOver state={gameState} game={game} />;
        }
      })()}
    </>
  );
}
