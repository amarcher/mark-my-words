import { io, Socket } from 'socket.io-client';
import { useState, useEffect, useCallback, useRef } from 'react';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  GameState,
  GuessResult,
  Accolade,
  ScoreEntry,
} from '@mmw/shared';

type TypedSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

const socket: TypedSocket = io(
  import.meta.env.PROD ? window.location.origin : 'http://localhost:3001',
  {
    autoConnect: false,
    transports: ['websocket', 'polling'],
  }
);

export { socket };

export function useSocket() {
  const [connected, setConnected] = useState(socket.connected);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    const onConnect = () => setConnected(true);
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  return { socket, connected };
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastGuessResult, setLastGuessResult] = useState<GuessResult | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [notifications, setNotifications] = useState<string[]>([]);

  useEffect(() => {
    const onState = (state: GameState) => {
      setGameState(state);
      if (state.phase === 'ROUND_ACTIVE') {
        setTimeRemaining(state.round.timeRemaining);
      }
    };

    const onTimer = (data: { timeRemaining: number }) => {
      setTimeRemaining(data.timeRemaining);
    };

    const onGuessResult = (result: GuessResult) => {
      setLastGuessResult(result);
    };

    const onPlayerSubmitted = (data: { playerId: string; playerName: string }) => {
      setNotifications(prev => [...prev, `${data.playerName} submitted their guess`]);
      setTimeout(() => {
        setNotifications(prev => prev.slice(1));
      }, 3000);
    };

    const onPlayerJoined = (data: { playerId: string; playerName: string }) => {
      setNotifications(prev => [...prev, `${data.playerName} joined`]);
      setTimeout(() => setNotifications(prev => prev.slice(1)), 3000);
    };

    const onPlayerLeft = (data: { playerId: string; playerName: string }) => {
      setNotifications(prev => [...prev, `${data.playerName} left`]);
      setTimeout(() => setNotifications(prev => prev.slice(1)), 3000);
    };

    const onError = (data: { message: string }) => {
      setNotifications(prev => [...prev, `Error: ${data.message}`]);
      setTimeout(() => setNotifications(prev => prev.slice(1)), 5000);
    };

    socket.on('game:state', onState);
    socket.on('round:timer', onTimer);
    socket.on('round:guess-result', onGuessResult);
    socket.on('round:player-submitted', onPlayerSubmitted);
    socket.on('player:joined', onPlayerJoined);
    socket.on('player:left', onPlayerLeft);
    socket.on('room:error', onError);

    return () => {
      socket.off('game:state', onState);
      socket.off('round:timer', onTimer);
      socket.off('round:guess-result', onGuessResult);
      socket.off('round:player-submitted', onPlayerSubmitted);
      socket.off('player:joined', onPlayerJoined);
      socket.off('player:left', onPlayerLeft);
      socket.off('room:error', onError);
    };
  }, []);

  const createRoom = useCallback((): Promise<{ success: boolean; roomCode?: string; error?: string }> => {
    return new Promise(resolve => {
      socket.emit('room:create', resolve);
    });
  }, []);

  const joinRoom = useCallback((roomCode: string, playerName: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise(resolve => {
      socket.emit('room:join', { roomCode, playerName }, resolve);
    });
  }, []);

  const leaveRoom = useCallback(() => {
    socket.emit('room:leave');
    setGameState(null);
    setLastGuessResult(null);
  }, []);

  const startGame = useCallback(() => {
    socket.emit('lobby:start');
  }, []);

  const submitGuess = useCallback((word: string): Promise<{ success: boolean; result?: GuessResult; error?: string }> => {
    return new Promise(resolve => {
      socket.emit('game:guess', { word }, resolve);
    });
  }, []);

  const playAgain = useCallback(() => {
    socket.emit('game:play-again');
    setLastGuessResult(null);
  }, []);

  const kickPlayer = useCallback((playerId: string) => {
    socket.emit('room:kick', { playerId });
  }, []);

  const updateSettings = useCallback((settings: Record<string, unknown>) => {
    socket.emit('lobby:settings', settings as { maxRounds?: number; roundTime?: number });
  }, []);

  const pause = useCallback(() => {
    socket.emit('game:pause');
  }, []);

  const resume = useCallback(() => {
    socket.emit('game:resume');
  }, []);

  return {
    gameState,
    lastGuessResult,
    timeRemaining,
    notifications,
    createRoom,
    joinRoom,
    leaveRoom,
    startGame,
    submitGuess,
    playAgain,
    kickPlayer,
    updateSettings,
    pause,
    resume,
    setLastGuessResult,
  };
}
