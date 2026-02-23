import { useState, useEffect, useRef } from 'react';

interface Props {
  game: {
    joinRoom: (roomCode: string, playerName: string) => Promise<{ success: boolean; error?: string }>;
    createRoom: (playerName: string) => Promise<{ success: boolean; roomCode?: string; error?: string }>;
  };
  initialRoomCode?: string;
}

export default function JoinRoom({ game, initialRoomCode }: Props) {
  const [roomCode, setRoomCode] = useState(initialRoomCode || '');
  const [playerName, setPlayerName] = useState('');
  const [joining, setJoining] = useState(false);
  const [error, setError] = useState('');
  const codeRef = useRef<HTMLInputElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (initialRoomCode) {
      nameRef.current?.focus();
    } else {
      codeRef.current?.focus();
    }
  }, [initialRoomCode]);

  const handleJoin = async () => {
    if (!roomCode.trim() || !playerName.trim()) return;
    setJoining(true);
    setError('');
    const result = await game.joinRoom(roomCode.toUpperCase().trim(), playerName.trim());
    setJoining(false);
    if (!result.success) {
      setError(result.error || 'Failed to join room');
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center p-6">
      <h1 className="text-4xl font-bold mb-2 bg-gradient-to-r from-accent to-purple-400 bg-clip-text text-transparent">
        Mark My Words
      </h1>
      <p className="text-white/40 mb-8">Join a game</p>

      <div className="w-full max-w-xs space-y-4">
        <input
          ref={codeRef}
          type="text"
          value={roomCode}
          onChange={e => setRoomCode(e.target.value.toUpperCase().replace(/[^A-Z]/g, '').slice(0, 4))}
          placeholder="Room Code"
          maxLength={4}
          className="input-field w-full text-center text-2xl font-mono tracking-[0.3em] uppercase"
        />
        <input
          ref={nameRef}
          type="text"
          value={playerName}
          onChange={e => setPlayerName(e.target.value)}
          placeholder="Your Name"
          maxLength={20}
          className="input-field w-full text-center text-lg"
          onKeyDown={e => e.key === 'Enter' && handleJoin()}
        />
        <button
          onClick={handleJoin}
          disabled={joining || !roomCode.trim() || !playerName.trim() || roomCode.length < 4}
          className="btn-primary w-full text-lg"
        >
          {joining ? 'Joining...' : 'Join Game'}
        </button>
        {error && <p className="text-rank-red text-sm text-center">{error}</p>}
      </div>
    </div>
  );
}
