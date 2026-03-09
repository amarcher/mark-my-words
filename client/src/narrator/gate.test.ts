// @vitest-environment jsdom
import { describe, it, expect, beforeEach } from 'vitest';
import { loadNarratorGate, isNarratorAvailable, ELEVENLABS_VOICES } from './gate';

describe('Narrator Gate', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  describe('loadNarratorGate', () => {
    it('returns null when localStorage is empty', () => {
      expect(loadNarratorGate()).toBeNull();
    });

    it('returns gate when valid JSON with enabled=true and token', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: true, token: 'abc123' }));
      expect(loadNarratorGate()).toEqual({ enabled: true, token: 'abc123' });
    });

    it('returns null when enabled is false', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: false, token: 'abc123' }));
      expect(loadNarratorGate()).toBeNull();
    });

    it('returns null when token is empty string', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: true, token: '' }));
      expect(loadNarratorGate()).toBeNull();
    });

    it('returns null when token is missing', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: true }));
      expect(loadNarratorGate()).toBeNull();
    });

    it('returns null when enabled is missing', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ token: 'abc' }));
      expect(loadNarratorGate()).toBeNull();
    });

    it('returns null when enabled is not boolean', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: 'yes', token: 'abc' }));
      expect(loadNarratorGate()).toBeNull();
    });

    it('returns null when token is not string', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: true, token: 42 }));
      expect(loadNarratorGate()).toBeNull();
    });

    it('handles corrupted JSON gracefully', () => {
      localStorage.setItem('contexto-elevenlabs', 'not json!!!');
      expect(loadNarratorGate()).toBeNull();
    });
  });

  describe('isNarratorAvailable', () => {
    it('returns false when gate is not set', () => {
      expect(isNarratorAvailable()).toBe(false);
    });

    it('returns true when gate is valid', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: true, token: 'test' }));
      expect(isNarratorAvailable()).toBe(true);
    });

    it('returns false when gate is disabled', () => {
      localStorage.setItem('contexto-elevenlabs', JSON.stringify({ enabled: false, token: 'test' }));
      expect(isNarratorAvailable()).toBe(false);
    });
  });

  describe('ELEVENLABS_VOICES', () => {
    it('contains 7 voices', () => {
      expect(ELEVENLABS_VOICES).toHaveLength(7);
    });

    it('each voice has id, name, and description', () => {
      for (const voice of ELEVENLABS_VOICES) {
        expect(typeof voice.id).toBe('string');
        expect(typeof voice.name).toBe('string');
        expect(typeof voice.description).toBe('string');
        expect(voice.id.length).toBeGreaterThan(0);
        expect(voice.name.length).toBeGreaterThan(0);
      }
    });
  });
});
