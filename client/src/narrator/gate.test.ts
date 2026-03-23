// @vitest-environment jsdom
import { describe, it, expect } from 'vitest';
import { isNarratorAvailable, ELEVENLABS_VOICES } from './gate';

describe('Narrator Gate', () => {
  describe('isNarratorAvailable', () => {
    it('always returns true (narrator is a free feature)', () => {
      expect(isNarratorAvailable()).toBe(true);
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
