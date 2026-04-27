import type { Server, Socket } from 'socket.io';
import type {
  ClientToServerEvents,
  ServerToClientEvents,
  InterServerEvents,
  SocketData,
  RoomSettings,
} from '@mmw/shared';
import { RoomManager } from '../game/RoomManager.js';

type TypedServer = Server<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;
type TypedSocket = Socket<ClientToServerEvents, ServerToClientEvents, InterServerEvents, SocketData>;

export function registerHandlers(io: TypedServer, roomManager: RoomManager): void {
  io.on('connection', (socket: TypedSocket) => {
    console.log(`Client connected: ${socket.id}`);
    const reconnectToken = socket.handshake.auth?.reconnectToken as string | undefined;

    socket.on('room:create', (callback) => {
      const roomCode = roomManager.createRoom(socket.id);
      socket.join(roomCode);
      socket.data.roomCode = roomCode;

      // Register token for host reconnection
      if (reconnectToken) {
        roomManager.registerHostToken(reconnectToken, socket.id);
      }

      // Send state directly — the broadcast in createRoom fired before socket.join
      const room = roomManager.getRoom(roomCode);
      if (room) socket.emit('game:state', room.getState());

      callback({ success: true, roomCode });
    });

    socket.on('room:join', (data, callback) => {
      const { roomCode, playerName } = data;
      if (!playerName || playerName.trim().length === 0) {
        callback({ success: false, error: 'Name is required' });
        return;
      }
      if (!roomCode || roomCode.trim().length === 0) {
        callback({ success: false, error: 'Room code is required' });
        return;
      }
      if (playerName.trim().length > 20) {
        callback({ success: false, error: 'Name too long (max 20 characters)' });
        return;
      }

      const result = roomManager.joinRoom(roomCode.toUpperCase(), socket.id, playerName.trim());
      if (!result.success) {
        callback({ success: false, error: result.error });
        return;
      }

      socket.join(roomCode.toUpperCase());
      socket.data.playerId = socket.id;
      socket.data.playerName = playerName.trim();
      socket.data.roomCode = roomCode.toUpperCase();

      // Register token for player reconnection
      if (reconnectToken) {
        roomManager.registerToken(reconnectToken, socket.id);
      }

      // Notify other players
      socket.to(roomCode.toUpperCase()).emit('player:joined', {
        playerId: socket.id,
        playerName: playerName.trim(),
      });

      // Send state directly — the broadcast in joinRoom fired before socket.join
      const room = roomManager.getRoom(roomCode);
      if (room) socket.emit('game:state', room.getState());

      callback({ success: true });
    });

    socket.on('room:leave', () => {
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      socket.to(roomCode).emit('player:left', {
        playerId: socket.id,
        playerName: socket.data.playerName || 'Unknown',
      });

      // Leave the Socket.IO room BEFORE removing the player,
      // so the broadcastState() triggered by removePlayer doesn't
      // push a stale game:state back to this socket.
      socket.leave(roomCode);
      socket.data.roomCode = undefined as unknown as string;
      roomManager.leaveRoom(socket.id);
    });

    socket.on('room:close', () => {
      // Host or leader closes the entire room
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      const room = roomManager.getRoom(roomCode);
      if (!room) return;
      if (!room.isHost(socket.id) && !room.isLeader(socket.id)) {
        socket.emit('room:error', { message: 'Only the host or leader can close the room' });
        return;
      }

      socket.leave(roomCode);
      socket.data.roomCode = undefined as unknown as string;
      roomManager.closeRoom(roomCode);
    });

    socket.on('room:reconnect', (data, callback) => {
      const { roomCode, playerName } = data;
      if (!reconnectToken) {
        callback({ success: false, error: 'No reconnect token' });
        return;
      }

      // Try player reconnect first
      const playerResult = roomManager.handleReconnect(reconnectToken, socket.id, roomCode);
      if (playerResult) {
        socket.join(roomCode.toUpperCase());
        socket.data.playerId = socket.id;
        socket.data.playerName = playerResult.playerName;
        socket.data.roomCode = roomCode.toUpperCase();

        // Notify others
        socket.to(roomCode.toUpperCase()).emit('player:reconnected', {
          playerId: socket.id,
          playerName: playerResult.playerName,
        });

        // Push fresh state
        socket.emit('game:state', playerResult.room.getState());
        callback({ success: true });
        return;
      }

      // Try host reconnect
      const hostRoom = roomManager.handleHostReconnect(reconnectToken, socket.id, roomCode);
      if (hostRoom) {
        socket.join(roomCode.toUpperCase());
        socket.data.roomCode = roomCode.toUpperCase();

        // Push fresh state
        socket.emit('game:state', hostRoom.getState());
        callback({ success: true });
        return;
      }

      callback({ success: false, error: 'Could not reconnect' });
    });

    socket.on('room:kick', (data) => {
      const { playerId } = data;
      const roomCode = socket.data.roomCode;
      if (!roomCode) return;

      // Find the target player's socket to notify and remove them
      const targetSocket = findSocketById(io, playerId);
      const room = roomManager.getRoom(roomCode);
      const targetPlayer = room?.getPlayer(playerId);

      if (roomManager.kickPlayer(socket.id, playerId)) {
        if (targetSocket) {
          targetSocket.emit('room:error', { message: 'You have been kicked from the room' });
          targetSocket.leave(roomCode);
          targetSocket.data.roomCode = undefined as unknown as string;
        }
        io.to(roomCode).emit('player:left', {
          playerId,
          playerName: targetPlayer?.name || 'Unknown',
        });
      }
    });

    socket.on('lobby:settings', (data: Partial<RoomSettings>) => {
      // Host (presenter) can update settings
      const room = roomManager.getRoomForHost(socket.id);
      if (!room) return;
      room.updateSettings(data);
    });

    socket.on('lobby:start', () => {
      // Leader (first player) can start the game
      const room = roomManager.getRoomForPlayer(socket.id);
      if (!room || !room.isLeader(socket.id)) return;

      const result = room.startGame();
      if (!result.success) {
        socket.emit('room:error', { message: result.error || 'Failed to start game' });
      }
    });

    socket.on('game:guess', (data, callback) => {
      const room = roomManager.getRoomForPlayer(socket.id);
      if (!room) {
        callback({ success: false, error: 'Not in a room' });
        return;
      }

      const result = room.submitGuess(socket.id, data.word);
      callback(result);
    });

    socket.on('game:end', () => {
      // Host or leader can end the game early
      const hostRoom = roomManager.getRoomForHost(socket.id);
      if (hostRoom) {
        hostRoom.endGame();
        return;
      }
      const playerRoom = roomManager.getRoomForPlayer(socket.id);
      if (playerRoom && playerRoom.isLeader(socket.id)) {
        playerRoom.endGame();
        return;
      }
      if (playerRoom) {
        socket.emit('room:error', { message: 'Only the host or leader can end the game' });
      }
    });

    socket.on('game:play-again', () => {
      // Leader can trigger play again
      const room = roomManager.getRoomForPlayer(socket.id);
      if (!room || !room.isLeader(socket.id)) return;
      room.playAgain();
    });

    socket.on('game:hint', () => {
      // Only players interact with hints (not the host/TV display)
      const room = roomManager.getRoomForPlayer(socket.id);
      if (!room) return;
      const settings = room.getSettings();
      if (settings.hintMode === 'host') {
        // Leader grants hint
        if (room.isLeader(socket.id)) {
          room.approveHint();
        }
      } else if (settings.hintMode === 'vote') {
        room.voteForHint(socket.id);
      }
    });

    socket.on('game:pause', () => {
      // Host (presenter) only
      const room = roomManager.getRoomForHost(socket.id);
      if (!room) return;
      room.pause();
    });

    socket.on('game:resume', () => {
      // Host (presenter) only
      const room = roomManager.getRoomForHost(socket.id);
      if (!room) return;
      room.resume();
    });

    socket.on('phase:hold', () => {
      const room = roomManager.getRoomForHost(socket.id);
      if (!room) return;
      room.holdPhase();
    });

    socket.on('phase:release', () => {
      const room = roomManager.getRoomForHost(socket.id);
      if (!room) return;
      room.releasePhase();
    });

    // 'disconnecting' fires while the socket is still in its rooms — the
    // broadcast actually flushes here, unlike in 'disconnect' where the
    // socket is already closed.
    socket.on('disconnecting', () => {
      const roomCode = socket.data.roomCode;
      if (roomCode) {
        socket.to(roomCode).emit('player:disconnected', {
          playerId: socket.id,
          playerName: socket.data.playerName || 'Unknown',
        });
      }
    });

    socket.on('disconnect', () => {
      console.log(`Client disconnected: ${socket.id}`);
      roomManager.handleDisconnect(socket.id);
    });
  });
}

function findSocketById(io: TypedServer, socketId: string): TypedSocket | undefined {
  return io.sockets.sockets.get(socketId) as TypedSocket | undefined;
}
