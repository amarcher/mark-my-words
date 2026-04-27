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
  private tokenToPlayerId: Map<string, string> = new Map();
  private tokenToHostId: Map<string, string> = new Map();
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
      onAfkClose: () => {
        this.closeRoom(roomCode);
      },
      onHintRevealed: (word: string, rank: number) => {
        this.callbacks.broadcastToRoom(roomCode, 'game:hint-revealed', { word, rank });
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

    // Check for duplicate names (only among connected players)
    const existingPlayers = Array.from(room.getState().players);
    const duplicate = existingPlayers.find(p => p.name.toLowerCase() === playerName.toLowerCase());
    if (duplicate) {
      if (duplicate.connected) {
        return { success: false, error: 'Name already taken' };
      }
      // Remove the disconnected ghost so the new player can take the name
      room.removePlayer(duplicate.id);
      this.playerToRoom.delete(duplicate.id);
      this.clearTokenForPlayer(duplicate.id);
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
    this.clearTokenForPlayer(playerId);

    if (room.getPlayerCount() === 0) {
      this.destroyRoom(roomCode, room);
    }
  }

  closeRoom(roomCode: string): void {
    const room = this.rooms.get(roomCode);
    if (!room) return;
    this.destroyRoom(roomCode, room);
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
    this.clearTokenForPlayer(targetId);
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
      // Host presenter disconnected — keep the mapping so reconnect via
      // token can find the room. (Cleared on rekey in handleHostReconnect
      // or in destroyRoom.) Mark the host as offline; auto-resumes if
      // paused outside AFK so pause/resume doesn't strand the room.
      const room = this.rooms.get(hostRoomCode);
      room?.markHostDisconnected();
      return;
    }

    const room = this.getRoomForPlayer(playerId);
    if (!room) return;
    const roomCode = this.playerToRoom.get(playerId);

    if (room.getPhase() === 'LOBBY') {
      // In lobby, just remove the player
      this.leaveRoom(playerId);
      return;
    }

    // During game, mark as disconnected for potential reconnection
    room.setPlayerConnected(playerId, false);
    // Promote a connected leader if the leader just dropped — otherwise
    // leader-only actions (play-again, end-game, hint-approve) are blocked
    // until the original leader reconnects.
    room.promoteNextLeaderIfDisconnected(playerId);

    // If everyone is now disconnected, destroy the room immediately —
    // otherwise phase timers tick on zero sockets until the 30-min
    // inactivity sweep runs.
    if (roomCode && room.getConnectedPlayerCount() === 0) {
      this.destroyRoom(roomCode, room);
    }
  }

  /**
   * Disconnect a player or host based on their reconnect token. Used by the
   * pagehide /api/player/disconnect beacon endpoint, where the socket may
   * already be torn down.
   */
  handleDisconnectByToken(token: string): { roomCode: string; playerId: string; playerName: string } | undefined {
    const playerId = this.tokenToPlayerId.get(token);
    if (playerId) {
      const roomCode = this.playerToRoom.get(playerId);
      const room = roomCode ? this.rooms.get(roomCode) : undefined;
      const player = room?.getPlayer(playerId);
      const playerName = player?.name ?? 'Unknown';
      this.handleDisconnect(playerId);
      if (roomCode) return { roomCode, playerId, playerName };
      return undefined;
    }

    const hostId = this.tokenToHostId.get(token);
    if (hostId) {
      // Host beacon — drop the host mapping just like a socket disconnect would
      this.handleDisconnect(hostId);
    }
    return undefined;
  }

  registerToken(token: string, playerId: string): void {
    this.tokenToPlayerId.set(token, playerId);
  }

  registerHostToken(token: string, hostId: string): void {
    this.tokenToHostId.set(token, hostId);
  }

  /** Returns the socket id currently keyed to this player token, if any. */
  peekTokenPlayerId(token: string): string | undefined {
    return this.tokenToPlayerId.get(token);
  }

  /** Returns the socket id currently keyed to this host token, if any. */
  peekTokenHostId(token: string): string | undefined {
    return this.tokenToHostId.get(token);
  }

  handleReconnect(
    token: string,
    newSocketId: string,
    roomCode: string,
    options: { force?: boolean } = {}
  ): { room: GameRoom; playerName: string } | { error: 'token_in_use'; activeSocketId: string } | undefined {
    const oldPlayerId = this.tokenToPlayerId.get(token);
    if (!oldPlayerId) return undefined;

    const storedRoomCode = this.playerToRoom.get(oldPlayerId);
    if (!storedRoomCode || storedRoomCode !== roomCode.toUpperCase()) return undefined;

    const room = this.rooms.get(storedRoomCode);
    if (!room) return undefined;

    const player = room.getPlayer(oldPlayerId);
    if (!player) return undefined;

    // Multi-tab guard: if another live socket is already keyed to this player
    // (different id, marked connected), refuse the rekey unless the caller
    // explicitly opted to take over. Avoids silently orphaning the first tab.
    if (!options.force && oldPlayerId !== newSocketId && player.connected) {
      return { error: 'token_in_use', activeSocketId: oldPlayerId };
    }

    const playerName = player.name;

    // Re-key if socket ID changed
    if (oldPlayerId !== newSocketId) {
      room.rekeyPlayer(oldPlayerId, newSocketId);
      this.playerToRoom.delete(oldPlayerId);
      this.playerToRoom.set(newSocketId, storedRoomCode);
      this.tokenToPlayerId.set(token, newSocketId);
    }

    room.setPlayerConnected(newSocketId, true);
    return { room, playerName };
  }

  handleHostReconnect(
    token: string,
    newSocketId: string,
    roomCode: string,
    options: { force?: boolean } = {}
  ): GameRoom | { error: 'token_in_use'; activeSocketId: string } | undefined {
    const oldHostId = this.tokenToHostId.get(token);
    if (!oldHostId) return undefined;

    const storedRoomCode = this.hostToRoom.get(oldHostId);
    if (!storedRoomCode || storedRoomCode !== roomCode.toUpperCase()) return undefined;

    const room = this.rooms.get(storedRoomCode);
    if (!room) return undefined;

    if (!options.force && oldHostId !== newSocketId && room.isHostConnected()) {
      return { error: 'token_in_use', activeSocketId: oldHostId };
    }

    // Re-key host
    if (oldHostId !== newSocketId) {
      this.hostToRoom.delete(oldHostId);
      this.hostToRoom.set(newSocketId, storedRoomCode);
      room.setHost(newSocketId);
      this.tokenToHostId.set(token, newSocketId);
    }

    return room;
  }

  private destroyRoom(roomCode: string, room: GameRoom): void {
    // Notify all clients in the room before destroying
    this.callbacks.broadcastToRoom(roomCode, 'room:closed', { message: 'The room was closed' });

    room.destroy();
    this.rooms.delete(roomCode);

    // Clean up player mappings
    for (const [playerId, rc] of this.playerToRoom) {
      if (rc === roomCode) {
        this.playerToRoom.delete(playerId);
        this.clearTokenForPlayer(playerId);
      }
    }
    // Clean up host mappings
    for (const [hostId, rc] of this.hostToRoom) {
      if (rc === roomCode) {
        this.hostToRoom.delete(hostId);
        this.clearTokenForHost(hostId);
      }
    }
  }

  private clearTokenForPlayer(playerId: string): void {
    for (const [token, id] of this.tokenToPlayerId) {
      if (id === playerId) {
        this.tokenToPlayerId.delete(token);
        break;
      }
    }
  }

  private clearTokenForHost(hostId: string): void {
    for (const [token, id] of this.tokenToHostId) {
      if (id === hostId) {
        this.tokenToHostId.delete(token);
        break;
      }
    }
  }

  private cleanupInactiveRooms(): void {
    const now = Date.now();
    for (const [code, room] of this.rooms) {
      if (now - room.lastActivity > ROOM_INACTIVITY_TIMEOUT) {
        console.log(`Cleaning up inactive room: ${code}`);
        this.destroyRoom(code, room);
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
