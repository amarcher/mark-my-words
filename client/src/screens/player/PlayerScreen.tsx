import { useParams } from 'react-router-dom';
import { useSocket, useGameState } from '../../socket';
import JoinRoom from './JoinRoom';
import PlayerLobby from './PlayerLobby';
import PlayerGame from './PlayerGame';
import PlayerResults from './PlayerResults';

export default function PlayerScreen() {
  const { roomCode: urlRoomCode } = useParams();
  const { connected, reconnecting } = useSocket();
  const game = useGameState();

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

  // Not yet in a room
  if (!game.gameState) {
    return <JoinRoom game={game} initialRoomCode={urlRoomCode} />;
  }

  const { gameState } = game;

  switch (gameState.phase) {
    case 'LOBBY':
      return <PlayerLobby state={gameState} game={game} />;
    case 'ROUND_ACTIVE':
      return <PlayerGame state={gameState} game={game} />;
    case 'ROUND_REVEALING':
    case 'ROUND_ACCOLADES':
    case 'ROUND_SCOREBOARD':
      return <PlayerResults state={gameState} game={game} />;
    case 'GAME_OVER':
      return <PlayerResults state={gameState} game={game} />;
  }
}
