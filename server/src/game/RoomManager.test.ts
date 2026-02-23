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

    it('cleans up host mapping on host disconnect', () => {
      const code = manager.createRoom('host-1');
      manager.handleDisconnect('host-1');
      expect(manager.getRoomCodeForHost('host-1')).toBeUndefined();
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

      const result = manager.handleReconnect('my-token', 'new-socket', code);
      expect(result).toBeDefined();
      expect(result?.playerName).toBe('Alice');
    });

    it('updates player-to-room mapping on reconnect', () => {
      const code = manager.createRoom('host-1');
      manager.joinRoom(code, 'old-socket', 'Alice');
      manager.joinRoom(code, 'p2', 'Bob');
      manager.registerToken('my-token', 'old-socket');

      manager.handleReconnect('my-token', 'new-socket', code);
      expect(manager.getRoomCodeForPlayer('new-socket')).toBe(code);
      expect(manager.getRoomCodeForPlayer('old-socket')).toBeUndefined();
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

      const room = manager.handleHostReconnect('host-token', 'new-host', code);
      expect(room).toBeDefined();
      expect(room?.getHostSocketId()).toBe('new-host');
    });

    it('handleHostReconnect updates host-to-room mapping', () => {
      const code = manager.createRoom('old-host');
      manager.registerHostToken('host-token', 'old-host');

      manager.handleHostReconnect('host-token', 'new-host', code);
      expect(manager.getRoomCodeForHost('new-host')).toBe(code);
      expect(manager.getRoomCodeForHost('old-host')).toBeUndefined();
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
