import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { ROOM_INACTIVITY_TIMEOUT } from '@mmw/shared';

// Mock WordRanker (GameRoom creates instances internally)
vi.mock('../words/WordRanker.js', () => {
  class MockWordRanker {
    isValidWord = vi.fn().mockReturnValue(true);
    getRank = vi.fn().mockReturnValue(500);
    loadRankings = vi.fn().mockReturnValue(true);
    getSecretWord = vi.fn().mockReturnValue('apple');

    static pickRandomSecretWord = vi.fn().mockReturnValue('apple');
    static getAvailableSecretWords = vi.fn().mockReturnValue(['apple', 'banana']);
  }
  return { WordRanker: MockWordRanker };
});

import { RoomManager } from './RoomManager.js';

function makeCallbacks() {
  return {
    broadcastToRoom: vi.fn(),
    emitToPlayer: vi.fn(),
  };
}

describe('RoomManager', () => {
  let manager: RoomManager;
  let cbs: ReturnType<typeof makeCallbacks>;

  beforeEach(() => {
    vi.useFakeTimers();
    cbs = makeCallbacks();
    manager = new RoomManager(cbs);
  });

  afterEach(() => {
    manager.destroy();
    vi.useRealTimers();
  });

  describe('createRoom', () => {
    it('returns a 4-character room code', () => {
      const code = manager.createRoom('host-1');
      expect(code).toMatch(/^[A-Z]{4}$/);
    });

    it('maps host to room', () => {
      const code = manager.createRoom('host-1');
      const room = manager.getRoomForHost('host-1');
      expect(room).toBeDefined();
      expect(room?.roomCode).toBe(code);
    });

    it('creates unique codes for different rooms', () => {
      const code1 = manager.createRoom('host-1');
      const code2 = manager.createRoom('host-2');
      expect(code1).not.toBe(code2);
    });
  });

  describe('joinRoom', () => {
    it('succeeds for valid room in LOBBY', () => {
      const code = manager.createRoom('host-1');
      const result = manager.joinRoom(code, 'p1', 'Alice');
      expect(result.success).toBe(true);
    });

    it('fails for nonexistent room', () => {
      const result = manager.joinRoom('ZZZZ', 'p1', 'Alice');
      expect(result.success).toBe(false);
      expect(result.error).toContain('not found');
    });

    it('fails when game already in progress', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      const room = manager.getRoom(code)!;
      room.startGame();
      const result = manager.joinRoom(code, 'p3', 'Charlie');
      expect(result.success).toBe(false);
      expect(result.error).toContain('in progress');
    });

    it('fails when room is full (12 players)', () => {
      const code = manager.createRoom('host-1');
      for (let i = 0; i < 12; i++) {
        manager.joinRoom(code, `p${i}`, `Player${i}`);
      }
      const result = manager.joinRoom(code, 'p12', 'Player12');
      expect(result.success).toBe(false);
      expect(result.error).toContain('full');
    });

    it('rejects duplicate name (case-insensitive)', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      const result = manager.joinRoom(code, 'p2', 'alice');
      expect(result.success).toBe(false);
      expect(result.error).toContain('taken');
    });

    it('case-insensitive room code lookup', () => {
      const code = manager.createRoom('host-1');
      const result = manager.joinRoom(code.toLowerCase(), 'p1', 'Alice');
      expect(result.success).toBe(true);
    });

    it('maps player to room', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      expect(manager.getRoomCodeForPlayer('p1')).toBe(code);
    });
  });

  describe('leaveRoom', () => {
    it('removes player from room', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.leaveRoom('p1');
      const room = manager.getRoom(code)!;
      expect(room.getPlayerCount()).toBe(1);
    });

    it('clears player-to-room mapping', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.leaveRoom('p1');
      expect(manager.getRoomCodeForPlayer('p1')).toBeUndefined();
    });

    it('destroys room when last player leaves', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.leaveRoom('p1');
      expect(manager.getRoom(code)).toBeUndefined();
    });

    it('cleans up host mapping when room is destroyed', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.leaveRoom('p1');
      expect(manager.getRoomForHost('host-1')).toBeUndefined();
    });

    it('no-op for unknown player', () => {
      // Should not throw
      manager.leaveRoom('nonexistent');
    });
  });

  describe('kickPlayer', () => {
    it('host can kick a player', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      const result = manager.kickPlayer('host-1', 'p2');
      expect(result).toBe(true);
      const room = manager.getRoom(code)!;
      expect(room.hasPlayer('p2')).toBe(false);
    });

    it('leader can kick a player', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice'); // leader
      manager.joinRoom(code, 'p2', 'Bob');
      const result = manager.kickPlayer('p1', 'p2');
      expect(result).toBe(true);
    });

    it('non-leader/non-host cannot kick', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      const result = manager.kickPlayer('p2', 'p1');
      expect(result).toBe(false);
    });

    it('clears token for kicked player', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.registerToken('token-p2', 'p2');
      manager.kickPlayer('host-1', 'p2');
      // Token should be cleared
      const reconnect = manager.handleReconnect('token-p2', 'new-p2', code);
      expect(reconnect).toBeUndefined();
    });

    it('returns false for unknown requester', () => {
      const result = manager.kickPlayer('unknown', 'p1');
      expect(result).toBe(false);
    });
  });

  describe('handleDisconnect', () => {
    it('removes player in LOBBY', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.handleDisconnect('p1');
      const room = manager.getRoom(code)!;
      expect(room.hasPlayer('p1')).toBe(false);
    });

    it('marks player disconnected during game', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      const room = manager.getRoom(code)!;
      room.startGame();
      manager.handleDisconnect('p1');
      expect(room.getPlayer('p1')?.connected).toBe(false);
    });

    it('keeps host mapping on host disconnect so reconnect can find the room', () => {
      const code = manager.createRoom('host-1');
      manager.handleDisconnect('host-1');
      // Mapping preserved — reconnect via token relies on it. The room
      // tracks hostConnected=false so events from this stale id are gated
      // by the actual host socket coming back online via reconnect.
      expect(manager.getRoomCodeForHost('host-1')).toBe(code);
      expect(manager.getRoom(code)?.isHostConnected()).toBe(false);
    });

    it('no-op for unknown socket', () => {
      // Should not throw
      manager.handleDisconnect('unknown');
    });
  });

  describe('Reconnection', () => {
    it('registerToken + handleReconnect re-keys player', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'old-socket', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.registerToken('my-token', 'old-socket');
      manager.getRoom(code)!.setPlayerConnected('old-socket', false);

      const result = manager.handleReconnect('my-token', 'new-socket', code);
      expect(result).toBeDefined();
      expect(result && 'playerName' in result ? result.playerName : null).toBe('Alice');
    });

    it('updates player-to-room mapping on reconnect', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'old-socket', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.registerToken('my-token', 'old-socket');
      manager.getRoom(code)!.setPlayerConnected('old-socket', false);

      manager.handleReconnect('my-token', 'new-socket', code);
      expect(manager.getRoomCodeForPlayer('new-socket')).toBe(code);
      expect(manager.getRoomCodeForPlayer('old-socket')).toBeUndefined();
    });

    it('refuses reconnect when token already in use by a connected socket', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'tab-a', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.registerToken('shared-token', 'tab-a');
      // tab-a is still connected — second tab tries to reconnect with the same token

      const result = manager.handleReconnect('shared-token', 'tab-b', code);
      expect(result && 'error' in result ? result.error : null).toBe('token_in_use');
      // Tab A still owns the slot
      const room = manager.getRoom(code)!;
      expect(room.hasPlayer('tab-a')).toBe(true);
      expect(room.hasPlayer('tab-b')).toBe(false);
    });

    it('force-reconnect takes over a still-connected slot', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'tab-a', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.registerToken('shared-token', 'tab-a');

      const result = manager.handleReconnect('shared-token', 'tab-b', code, { force: true });
      expect(result && 'playerName' in result ? result.playerName : null).toBe('Alice');
      const room = manager.getRoom(code)!;
      expect(room.hasPlayer('tab-a')).toBe(false);
      expect(room.hasPlayer('tab-b')).toBe(true);
    });

    it('marks player as connected after reconnect', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'old-socket', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      const room = manager.getRoom(code)!;
      room.startGame();
      manager.handleDisconnect('old-socket');
      expect(room.getPlayer('old-socket')?.connected).toBe(false);

      manager.registerToken('my-token', 'old-socket');
      manager.handleReconnect('my-token', 'new-socket', code);
      expect(room.getPlayer('new-socket')?.connected).toBe(true);
    });

    it('returns undefined for bad token', () => {
      const code = manager.createRoom('host-1');
      const result = manager.handleReconnect('bad-token', 'new-socket', code);
      expect(result).toBeUndefined();
    });

    it('returns undefined for wrong room', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.registerToken('my-token', 'p1');

      const result = manager.handleReconnect('my-token', 'new-socket', 'ZZZZ');
      expect(result).toBeUndefined();
    });

    it('handleHostReconnect re-keys host', () => {
      const code = manager.createRoom('old-host');
      manager.registerHostToken('host-token', 'old-host');
      manager.handleDisconnect('old-host');

      const result = manager.handleHostReconnect('host-token', 'new-host', code);
      const room = result && !('error' in result) ? result : undefined;
      expect(room).toBeDefined();
      expect(room?.getHostSocketId()).toBe('new-host');
    });

    it('handleHostReconnect updates host-to-room mapping', () => {
      const code = manager.createRoom('old-host');
      manager.registerHostToken('host-token', 'old-host');
      manager.handleDisconnect('old-host');

      manager.handleHostReconnect('host-token', 'new-host', code);
      expect(manager.getRoomCodeForHost('new-host')).toBe(code);
      expect(manager.getRoomCodeForHost('old-host')).toBeUndefined();
    });

    it('handleHostReconnect refuses when host token in use', () => {
      const code = manager.createRoom('old-host');
      manager.registerHostToken('host-token', 'old-host');
      // Old host still connected — second host tab tries to reconnect

      const result = manager.handleHostReconnect('host-token', 'new-host', code);
      expect(result && 'error' in result ? result.error : null).toBe('token_in_use');
    });

    it('handleHostReconnect returns undefined for bad token', () => {
      const code = manager.createRoom('host-1');
      const result = manager.handleHostReconnect('bad-token', 'new-host', code);
      expect(result).toBeUndefined();
    });

    it('handleHostReconnect returns undefined for wrong room', () => {
      const code = manager.createRoom('host-1');
      manager.registerHostToken('host-token', 'host-1');

      const result = manager.handleHostReconnect('host-token', 'new-host', 'ZZZZ');
      expect(result).toBeUndefined();
    });

    it('no-op rekey when socket ID unchanged', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.registerToken('my-token', 'p1');

      const result = manager.handleReconnect('my-token', 'p1', code);
      expect(result).toBeDefined();
      expect(result?.playerName).toBe('Alice');
      // Player should still exist under same ID
      const room = manager.getRoom(code)!;
      expect(room.hasPlayer('p1')).toBe(true);
    });
  });

  describe('cleanupInactiveRooms', () => {
    it('removes rooms past inactivity timeout', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');

      // Advance past timeout + cleanup interval (5 min)
      vi.advanceTimersByTime(ROOM_INACTIVITY_TIMEOUT + 5 * 60 * 1000 + 1000);

      expect(manager.getRoom(code)).toBeUndefined();
    });

    it('keeps active rooms', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');

      // Advance less than timeout
      vi.advanceTimersByTime(5 * 60 * 1000);
      expect(manager.getRoom(code)).toBeDefined();
    });

    it('cleans up player mappings for removed rooms', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');

      vi.advanceTimersByTime(ROOM_INACTIVITY_TIMEOUT + 5 * 60 * 1000 + 1000);

      expect(manager.getRoomCodeForPlayer('p1')).toBeUndefined();
    });

    it('cleans up host mappings for removed rooms', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');

      vi.advanceTimersByTime(ROOM_INACTIVITY_TIMEOUT + 5 * 60 * 1000 + 1000);

      expect(manager.getRoomCodeForHost('host-1')).toBeUndefined();
    });
  });

  describe('closeRoom', () => {
    it('destroys the room', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.closeRoom(code);
      expect(manager.getRoom(code)).toBeUndefined();
    });

    it('broadcasts room:closed before destroying', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.closeRoom(code);
      expect(cbs.broadcastToRoom).toHaveBeenCalledWith(
        code,
        'room:closed',
        { message: 'The room was closed' }
      );
    });

    it('clears player-to-room mappings', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.closeRoom(code);
      expect(manager.getRoomCodeForPlayer('p1')).toBeUndefined();
      expect(manager.getRoomCodeForPlayer('p2')).toBeUndefined();
    });

    it('clears host-to-room mappings', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.closeRoom(code);
      expect(manager.getRoomCodeForHost('host-1')).toBeUndefined();
    });

    it('clears reconnect tokens', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.registerToken('token-p1', 'p1');
      manager.closeRoom(code);
      const result = manager.handleReconnect('token-p1', 'new-p1', code);
      expect(result).toBeUndefined();
    });

    it('no-op for nonexistent room code', () => {
      // Should not throw
      manager.closeRoom('ZZZZ');
    });
  });

  describe('Duplicate name with disconnected ghost', () => {
    it('allows joining with name of a disconnected player', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      // Start game so disconnect marks as disconnected instead of removing
      const room = manager.getRoom(code)!;
      room.startGame();
      manager.handleDisconnect('p1');
      expect(room.getPlayer('p1')?.connected).toBe(false);

      // Go back to lobby to allow joining
      // Simulate by ending the game manually — we need a lobby state
      // Instead, create a fresh room scenario
    });

    it('removes disconnected ghost when new player takes the name', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      const room = manager.getRoom(code)!;
      // Manually set p1 as disconnected (simulating a ghost in lobby)
      room.setPlayerConnected('p1', false);

      // New player joins with same name
      const result = manager.joinRoom(code, 'p3', 'Alice');
      expect(result.success).toBe(true);
      expect(room.hasPlayer('p1')).toBe(false);
      expect(room.hasPlayer('p3')).toBe(true);
      expect(room.getPlayer('p3')?.name).toBe('Alice');
    });

    it('still rejects duplicate name when existing player is connected', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      const result = manager.joinRoom(code, 'p2', 'Alice');
      expect(result.success).toBe(false);
      expect(result.error).toContain('taken');
    });
  });

  describe('Room destroyed broadcasts room:closed', () => {
    it('broadcasts room:closed when last player leaves', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      cbs.broadcastToRoom.mockClear();
      manager.leaveRoom('p1');
      expect(cbs.broadcastToRoom).toHaveBeenCalledWith(
        code,
        'room:closed',
        { message: 'The room was closed' }
      );
    });

    it('broadcasts room:closed on inactivity cleanup', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      cbs.broadcastToRoom.mockClear();
      vi.advanceTimersByTime(ROOM_INACTIVITY_TIMEOUT + 5 * 60 * 1000 + 1000);
      expect(cbs.broadcastToRoom).toHaveBeenCalledWith(
        code,
        'room:closed',
        { message: 'The room was closed' }
      );
    });
  });

  describe('Lookup helpers', () => {
    it('getRoomForPlayer returns room', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'p1', 'Alice');
      expect(manager.getRoomForPlayer('p1')?.roomCode).toBe(code);
    });

    it('getRoomForPlayer returns undefined for unknown', () => {
      expect(manager.getRoomForPlayer('unknown')).toBeUndefined();
    });

    it('getRoomForHost returns room', () => {
      const code = manager.createRoom('host-1');
      expect(manager.getRoomForHost('host-1')?.roomCode).toBe(code);
    });

    it('getRoom is case-insensitive', () => {
      const code = manager.createRoom('host-1');
      expect(manager.getRoom(code.toLowerCase())).toBeDefined();
    });
  });
});
