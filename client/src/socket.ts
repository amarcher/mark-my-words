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

// Generate or retrieve a stable reconnect token
function getReconnectToken(): string {
  let token = sessionStorage.getItem('reconnectToken');
  if (!token) {
    token = crypto.randomUUID();
    sessionStorage.setItem('reconnectToken', token);
  }
  return token;
}

const socket: TypedSocket = io(
  import.meta.env.PROD ? window.location.origin : 'http://localhost:3001',
  {
    autoConnect: false,
    transports: ['websocket', 'polling'],
    auth: { reconnectToken: getReconnectToken() },
  }
);

export { socket };

// Pagehide beacon: tabs that close abruptly never flush their socket frames,
// so we synchronously POST a self-disconnect keyed by the reconnect token.
// Use pagehide rather than beforeunload — pagehide is reliable on mobile
// Safari and bfcache-aware. The endpoint is idempotent.
if (typeof window !== 'undefined') {
  window.addEventListener('pagehide', () => {
    const roomCode = sessionStorage.getItem('roomCode');
    const reconnectToken = sessionStorage.getItem('reconnectToken');
    if (!roomCode || !reconnectToken) return;
    const body = new Blob(
      [JSON.stringify({ reconnectToken, roomCode })],
      { type: 'application/json' },
    );
    // sendBeacon may return false if the browser refuses (rare); we have no
    // recourse since the page is dying. Best-effort is the contract.
    navigator.sendBeacon('/api/player/disconnect', body);
  });
}

// Session storage helpers
function saveSession(data: { roomCode: string; playerName?: string; isHost?: boolean }) {
  sessionStorage.setItem('roomCode', data.roomCode);
  if (data.playerName) sessionStorage.setItem('playerName', data.playerName);
  if (data.isHost) sessionStorage.setItem('isHost', 'true');
}

function clearSession() {
  sessionStorage.removeItem('roomCode');
  sessionStorage.removeItem('playerName');
  sessionStorage.removeItem('isHost');
}

function getSavedSession() {
  const roomCode = sessionStorage.getItem('roomCode');
  const playerName = sessionStorage.getItem('playerName');
  const isHost = sessionStorage.getItem('isHost') === 'true';
  if (!roomCode) return null;
  return { roomCode, playerName: playerName || '', isHost };
}

export interface SessionConflict {
  roomCode: string;
  playerName: string;
}

export function useSocket() {
  const [connected, setConnected] = useState(socket.connected);
  const [reconnecting, setReconnecting] = useState(false);
  const [sessionConflict, setSessionConflict] = useState<SessionConflict | null>(null);

  useEffect(() => {
    if (!socket.connected) socket.connect();

    const onConnect = () => {
      setConnected(true);

      // Check if we have a saved session to reconnect to
      const session = getSavedSession();
      if (session) {
        setReconnecting(true);
        socket.emit(
          'room:reconnect',
          { roomCode: session.roomCode, playerName: session.playerName },
          (res) => {
            setReconnecting(false);
            if (res.success) return;
            if (res.error === 'token_in_use') {
              // Another tab owns this slot. Surface a modal so the user can
              // explicitly take over here or bail to home.
              setSessionConflict({ roomCode: session.roomCode, playerName: session.playerName });
              return;
            }
            // Stale session — clear it so user sees JoinRoom/CreateRoom
            clearSession();
          }
        );
      }
    };
    const onDisconnect = () => setConnected(false);

    socket.on('connect', onConnect);
    socket.on('disconnect', onDisconnect);

    return () => {
      socket.off('connect', onConnect);
      socket.off('disconnect', onDisconnect);
    };
  }, []);

  const acceptSessionTakeover = useCallback(() => {
    const conflict = sessionConflict;
    if (!conflict) return;
    setReconnecting(true);
    socket.emit(
      'room:steal-session',
      { roomCode: conflict.roomCode, playerName: conflict.playerName },
      (res) => {
        setReconnecting(false);
        setSessionConflict(null);
        if (!res.success) {
          // Couldn't take over (e.g. room gone) — fall back to clean state
          clearSession();
        }
      },
    );
  }, [sessionConflict]);

  const cancelSessionTakeover = useCallback(() => {
    clearSession();
    setSessionConflict(null);
  }, []);

  return { socket, connected, reconnecting, sessionConflict, acceptSessionTakeover, cancelSessionTakeover };
}

export function useGameState() {
  const [gameState, setGameState] = useState<GameState | null>(null);
  const [lastGuessResult, setLastGuessResult] = useState<GuessResult | null>(null);
  const [timeRemaining, setTimeRemaining] = useState<number>(0);
  const [notifications, setNotifications] = useState<string[]>([]);
  const [roomClosedMessage, setRoomClosedMessage] = useState<string | null>(null);
  const leftRoomRef = useRef(false);
  const prevLeaderIdRef = useRef<string | null>(null);

  useEffect(() => {
    const onState = (state: GameState) => {
      if (leftRoomRef.current) return;
      setGameState(state);
      if (state.phase === 'ROUND_ACTIVE') {
        setTimeRemaining(state.round.timeRemaining);
      }
      // Leader-change toast — surfaces auto-promotion and reconnect-reclaim,
      // both of which are otherwise silent. Skip the very first state seen
      // (initial leaderId, not a change).
      const prevLeader = prevLeaderIdRef.current;
      if (prevLeader !== null && state.leaderId && prevLeader !== state.leaderId) {
        const isMe = state.leaderId === socket.id;
        const newLeaderName = state.players.find(p => p.id === state.leaderId)?.name;
        const msg = isMe
          ? "You're now leading!"
          : newLeaderName
            ? `${newLeaderName} is now leading`
            : 'A new leader was promoted';
        setNotifications(prev => [...prev, msg]);
        setTimeout(() => setNotifications(prev => prev.slice(1)), 4000);
      }
      prevLeaderIdRef.current = state.leaderId;
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

    const onPlayerReconnected = (data: { playerId: string; playerName: string }) => {
      setNotifications(prev => [...prev, `${data.playerName} reconnected`]);
      setTimeout(() => setNotifications(prev => prev.slice(1)), 3000);
      // Mirror server's connected flag immediately so the roster doesn't lag
      // behind the next game:state broadcast.
      setGameState(prev => prev && {
        ...prev,
        players: prev.players.map(p =>
          p.id === data.playerId ? { ...p, connected: true } : p,
        ),
      });
    };

    const onPlayerDisconnected = (data: { playerId: string }) => {
      // Update connected=false instantly. game:state will follow but may be
      // delayed by phase timer ticks.
      setGameState(prev => prev && {
        ...prev,
        players: prev.players.map(p =>
          p.id === data.playerId ? { ...p, connected: false } : p,
        ),
      });
    };

    const onError = (data: { message: string }) => {
      setNotifications(prev => [...prev, `Error: ${data.message}`]);
      setTimeout(() => setNotifications(prev => prev.slice(1)), 5000);
    };

    const onRoomClosed = (data: { message: string }) => {
      setGameState(null);
      setLastGuessResult(null);
      prevLeaderIdRef.current = null;
      clearSession();
      setRoomClosedMessage(data.message);
    };

    const onHintRevealed = (data: { word: string; rank: number }) => {
      setNotifications(prev => [...prev, `Hint revealed: '${data.word}' (rank #${data.rank.toLocaleString()})`]);
      setTimeout(() => setNotifications(prev => prev.slice(1)), 4000);
    };

    socket.on('game:state', onState);
    socket.on('round:timer', onTimer);
    socket.on('round:guess-result', onGuessResult);
    socket.on('round:player-submitted', onPlayerSubmitted);
    socket.on('player:joined', onPlayerJoined);
    socket.on('player:left', onPlayerLeft);
    socket.on('player:disconnected', onPlayerDisconnected);
    socket.on('player:reconnected', onPlayerReconnected);
    socket.on('room:error', onError);
    socket.on('room:closed', onRoomClosed);
    socket.on('game:hint-revealed', onHintRevealed);

    return () => {
      socket.off('game:state', onState);
      socket.off('round:timer', onTimer);
      socket.off('round:guess-result', onGuessResult);
      socket.off('round:player-submitted', onPlayerSubmitted);
      socket.off('player:joined', onPlayerJoined);
      socket.off('player:left', onPlayerLeft);
      socket.off('player:disconnected', onPlayerDisconnected);
      socket.off('player:reconnected', onPlayerReconnected);
      socket.off('room:error', onError);
      socket.off('room:closed', onRoomClosed);
      socket.off('game:hint-revealed', onHintRevealed);
    };
  }, []);

  const createRoom = useCallback((): Promise<{ success: boolean; roomCode?: string; error?: string }> => {
    return new Promise(resolve => {
      socket.emit('room:create', (res) => {
        if (res.success && res.roomCode) {
          leftRoomRef.current = false;
          saveSession({ roomCode: res.roomCode, isHost: true });
        }
        resolve(res);
      });
    });
  }, []);

  const joinRoom = useCallback((roomCode: string, playerName: string): Promise<{ success: boolean; error?: string }> => {
    return new Promise(resolve => {
      socket.emit('room:join', { roomCode, playerName }, (res) => {
        if (res.success) {
          leftRoomRef.current = false;
          saveSession({ roomCode: roomCode.toUpperCase(), playerName });
        }
        resolve(res);
      });
    });
  }, []);

  const leaveRoom = useCallback(() => {
    leftRoomRef.current = true;
    socket.emit('room:leave');
    setGameState(null);
    setLastGuessResult(null);
    prevLeaderIdRef.current = null;
    clearSession();
  }, []);

  const closeRoom = useCallback(() => {
    leftRoomRef.current = true;
    socket.emit('room:close');
    setGameState(null);
    setLastGuessResult(null);
    prevLeaderIdRef.current = null;
    clearSession();
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

  const endGame = useCallback(() => {
    socket.emit('game:end');
  }, []);

  const pause = useCallback(() => {
    socket.emit('game:pause');
  }, []);

  const resume = useCallback(() => {
    socket.emit('game:resume');
  }, []);

  const requestHint = useCallback(() => {
    socket.emit('game:hint');
  }, []);

  const dismissRoomClosed = useCallback(() => {
    setRoomClosedMessage(null);
  }, []);

  return {
    gameState,
    lastGuessResult,
    timeRemaining,
    notifications,
    roomClosedMessage,
    dismissRoomClosed,
    createRoom,
    joinRoom,
    leaveRoom,
    closeRoom,
    endGame,
    startGame,
    submitGuess,
    playAgain,
    kickPlayer,
    updateSettings,
    pause,
    resume,
    requestHint,
    setLastGuessResult,
  };
}
