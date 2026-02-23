import { ROOM_CODE_CHARS, ROOM_CODE_LENGTH, ROOM_INACTIVITY_TIMEOUT } from '@mmw/shared';
import type { GameState, GuessResult } from '@mmw/shared';
import { GameRoom } from './GameRoom.js';

interface RoomCallbacks {
  broadcastToRoom: (roomCode: string, event: string, data: unknown) => void;
  emitToPlayer: (playerId: string, event: string, data: unknown) => void;
}

export class RoomManager {
  private rooms: Map<string, GameRoom> = new Map();
  private playerToRoom: Map<string, string> = new Map();
  private hostToRoom: Map<string, string> = new Map();
  private callbacks: RoomCallbacks;
  private cleanupInterval: ReturnType<typeof setInterval>;

  constructor(callbacks: RoomCallbacks) {
    this.callbacks = callbacks;

    // Clean up inactive rooms every 5 minutes
    this.cleanupInterval = setInterval(() => this.cleanupInactiveRooms(), 5 * 60 * 1000);
  }

  private generateRoomCode(): string {
    let code: string;
    do {
      code = '';
      for (let i = 0; i < ROOM_CODE_LENGTH; i++) {
        code += ROOM_CODE_CHARS[Math.floor(Math.random() * ROOM_CODE_CHARS.length)];
      }
    } while (this.rooms.has(code));
    return code;
  }

  createRoom(hostSocketId: string): string {
    const roomCode = this.generateRoomCode();

    const room = new GameRoom(roomCode, {
      onStateChange: (state: GameState) => {
        this.callbacks.broadcastToRoom(roomCode, 'game:state', state);
      },
      onTimerTick: (timeRemaining: number) => {
        this.callbacks.broadcastToRoom(roomCode, 'round:timer', { timeRemaining });
      },
      onGuessResult: (playerId: string, result: GuessResult) => {
        this.callbacks.emitToPlayer(playerId, 'round:guess-result', result);
      },
      onPlayerSubmitted: (playerId: string, playerName: string) => {
        this.callbacks.broadcastToRoom(roomCode, 'round:player-submitted', { playerId, playerName });
      },
    });

    room.setHost(hostSocketId);
    this.rooms.set(roomCode, room);
    this.hostToRoom.set(hostSocketId, roomCode);

    return roomCode;
  }

  joinRoom(roomCode: string, playerId: string, playerName: string): { success: boolean; error?: string } {
    const room = this.rooms.get(roomCode.toUpperCase());
    if (!room) return { success: false, error: 'Room not found' };
    if (room.getPhase() !== 'LOBBY') return { success: false, error: 'Game already in progress' };
    if (room.getPlayerCount() >= 12) return { success: false, error: 'Room is full' };

    // Check for duplicate names
    const existingPlayers = Array.from(room.getState().players);
    if (existingPlayers.some(p => p.name.toLowerCase() === playerName.toLowerCase())) {
      return { success: false, error: 'Name already taken' };
    }

    room.addPlayer(playerId, playerName);
    this.playerToRoom.set(playerId, roomCode.toUpperCase());
    return { success: true };
  }

  leaveRoom(playerId: string): void {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return;

    const room = this.rooms.get(roomCode);
    if (!room) return;

    room.removePlayer(playerId);
    this.playerToRoom.delete(playerId);

    if (room.getPlayerCount() === 0) {
      room.destroy();
      this.rooms.delete(roomCode);
      // Clean up host mapping
      for (const [hostId, rc] of this.hostToRoom) {
        if (rc === roomCode) this.hostToRoom.delete(hostId);
      }
    }
  }

  kickPlayer(requesterId: string, targetId: string): boolean {
    // Allow either host or leader to kick
    const roomCode = this.hostToRoom.get(requesterId) || this.playerToRoom.get(requesterId);
    if (!roomCode) return false;

    const room = this.rooms.get(roomCode);
    if (!room) return false;
    if (!room.isHost(requesterId) && !room.isLeader(requesterId)) return false;

    room.removePlayer(targetId);
    this.playerToRoom.delete(targetId);
    return true;
  }

  getRoom(roomCode: string): GameRoom | undefined {
    return this.rooms.get(roomCode.toUpperCase());
  }

  getRoomForPlayer(playerId: string): GameRoom | undefined {
    const roomCode = this.playerToRoom.get(playerId);
    if (!roomCode) return undefined;
    return this.rooms.get(roomCode);
  }

  getRoomForHost(hostSocketId: string): GameRoom | undefined {
    const roomCode = this.hostToRoom.get(hostSocketId);
    if (!roomCode) return undefined;
    return this.rooms.get(roomCode);
  }

  getRoomCodeForPlayer(playerId: string): string | undefined {
    return this.playerToRoom.get(playerId);
  }

  getRoomCodeForHost(hostSocketId: string): string | undefined {
    return this.hostToRoom.get(hostSocketId);
  }

  handleDisconnect(playerId: string): void {
    // Check if it's a host disconnecting
    const hostRoomCode = this.hostToRoom.get(playerId);
    if (hostRoomCode) {
      // Host presenter disconnected — don't remove the room yet,
      // just clean up the host mapping
      this.hostToRoom.delete(playerId);
      return;
    }

    const room = this.getRoomForPlayer(playerId);
    if (!room) return;

    if (room.getPhase() === 'LOBBY') {
      // In lobby, just remove the player
      this.leaveRoom(playerId);
    } else {
      // During game, mark as disconnected for potential reconnection
      room.setPlayerConnected(playerId, false);
    }
  }

  handleReconnect(playerId: string, socketId: string): GameRoom | undefined {
    const room = this.getRoomForPlayer(playerId);
    if (!room) return undefined;

    room.setPlayerConnected(playerId, true);
    return room;
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > ROOM_INACTIVITY_TIMEOUT) {
        console.log(`Cleaning up inactive room: ${code}`);
        room.destroy();
        this.rooms.delete(code);

        // Clean up player mappings
        for (const [playerId, roomCode] of this.playerToRoom) {
          if (roomCode === code) this.playerToRoom.delete(playerId);
        }
        // Clean up host mappings
        for (const [hostId, roomCode] of this.hostToRoom) {
          if (roomCode === code) this.hostToRoom.delete(hostId);
        }
      }
    }
  }

  destroy(): void {
    clearInterval(this.cleanupInterval);
    for (const room of this.rooms.values()) {
      room.destroy();
    }
  }
}
