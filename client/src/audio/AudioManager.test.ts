// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock speechSynthesis before importing AudioManager
const mockSpeak = vi.fn();
const mockCancel = vi.fn();
const mockGetVoices = vi.fn<() => SpeechSynthesisVoice[]>().mockReturnValue([]);
const mockAddEventListener = vi.fn();

Object.defineProperty(globalThis, 'speechSynthesis', {
  value: {
    speak: mockSpeak,
    cancel: mockCancel,
    getVoices: mockGetVoices,
    addEventListener: mockAddEventListener,
    speaking: false,
    pending: false,
  },
  writable: true,
});

// SpeechSynthesisUtterance mock
const utteranceInstances: Array<{ text: string; rate: number; pitch: number; voice: SpeechSynthesisVoice | null }> = [];
class MockUtterance {
  text: string;
  rate = 1;
  pitch = 1;
  volume = 1;
  voice: SpeechSynthesisVoice | null = null;
  onend: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(text: string) {
    this.text = text;
    utteranceInstances.push(this);
  }
}
Object.defineProperty(globalThis, 'SpeechSynthesisUtterance', { value: MockUtterance, writable: true });

// Stub AudioContext (not needed for TTS tests, just prevent constructor crash)
Object.defineProperty(globalThis, 'AudioContext', {
  value: class {
    state = 'running';
    currentTime = 0;
    destination = {};
    resume() { return Promise.resolve(); }
    createGain() {
      return { gain: { value: 1, linearRampToValueAtTime: vi.fn() }, connect: vi.fn(), disconnect: vi.fn() };
    }
    createMediaElementSource() {
      return { connect: vi.fn(), disconnect: vi.fn() };
    }
  },
  writable: true,
});

describe('AudioManager TTS Settings', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
    utteranceInstances.length = 0;
  });

  // Fresh import each test to get a new singleton with clean localStorage
  async function freshManager() {
    vi.resetModules();
    const mod = await import('./AudioManager.js');
    return mod.audioManager;
  }

  describe('loadTTSSettings (via constructor)', () => {
    it('returns defaults when localStorage is empty', async () => {
      const mgr = await freshManager();
      const settings = mgr.getTTSSettings();
      expect(settings).toEqual({ voiceName: null, rate: 1.0, pitch: 1.0, narratorEngine: null, elevenLabsVoiceId: null });
    });

    it('loads saved settings from localStorage', async () => {
      localStorage.setItem('mmw-tts-settings', JSON.stringify({
        voiceName: 'Google UK English Male',
        rate: 1.5,
        pitch: 0.8,
      }));
      const mgr = await freshManager();
      const settings = mgr.getTTSSettings();
      expect(settings).toEqual({ voiceName: 'Google UK English Male', rate: 1.5, pitch: 0.8, narratorEngine: null, elevenLabsVoiceId: null });
    });

    it('clamps out-of-range rate and pitch', async () => {
      localStorage.setItem('mmw-tts-settings', JSON.stringify({
        voiceName: null,
        rate: 5.0,
        pitch: -1.0,
      }));
      const mgr = await freshManager();
      const settings = mgr.getTTSSettings();
      expect(settings.rate).toBe(2.0);
      expect(settings.pitch).toBe(0.5);
    });

    it('handles corrupted JSON gracefully', async () => {
      localStorage.setItem('mmw-tts-settings', 'not json!!!');
      const mgr = await freshManager();
      const settings = mgr.getTTSSettings();
      expect(settings).toEqual({ voiceName: null, rate: 1.0, pitch: 1.0, narratorEngine: null, elevenLabsVoiceId: null });
    });

    it('handles missing fields gracefully', async () => {
      localStorage.setItem('mmw-tts-settings', JSON.stringify({ voiceName: 'Foo' }));
      const mgr = await freshManager();
      const settings = mgr.getTTSSettings();
      expect(settings.voiceName).toBe('Foo');
      expect(settings.rate).toBe(1.0);
      expect(settings.pitch).toBe(1.0);
      expect(settings.narratorEngine).toBeNull();
      expect(settings.elevenLabsVoiceId).toBeNull();
    });

    it('treats non-string voiceName as null', async () => {
      localStorage.setItem('mmw-tts-settings', JSON.stringify({ voiceName: 42, rate: 1.0, pitch: 1.0 }));
      const mgr = await freshManager();
      expect(mgr.getTTSSettings().voiceName).toBeNull();
    });

    it('loads valid narratorEngine from localStorage', async () => {
      localStorage.setItem('mmw-tts-settings', JSON.stringify({
        voiceName: null, rate: 1.0, pitch: 1.0,
        narratorEngine: 'claude', elevenLabsVoiceId: 'voice123',
      }));
      const mgr = await freshManager();
      const settings = mgr.getTTSSettings();
      expect(settings.narratorEngine).toBe('claude');
      expect(settings.elevenLabsVoiceId).toBe('voice123');
    });

    it('rejects invalid narratorEngine values', async () => {
      localStorage.setItem('mmw-tts-settings', JSON.stringify({
        voiceName: null, rate: 1.0, pitch: 1.0,
        narratorEngine: 'invalid-engine',
      }));
      const mgr = await freshManager();
      expect(mgr.getTTSSettings().narratorEngine).toBeNull();
    });

    it('accepts all valid narratorEngine values', async () => {
      for (const engine of ['elevenlabs-agent', 'openai-agent', 'claude']) {
        localStorage.setItem('mmw-tts-settings', JSON.stringify({ narratorEngine: engine }));
        vi.resetModules();
        const mod = await import('./AudioManager.js');
        expect(mod.audioManager.getTTSSettings().narratorEngine).toBe(engine);
      }
    });

    it('treats non-string elevenLabsVoiceId as null', async () => {
      localStorage.setItem('mmw-tts-settings', JSON.stringify({
        voiceName: null, rate: 1.0, pitch: 1.0,
        elevenLabsVoiceId: 42,
      }));
      const mgr = await freshManager();
      expect(mgr.getTTSSettings().elevenLabsVoiceId).toBeNull();
    });
  });

  describe('setTTSSettings', () => {
    it('persists partial updates to localStorage', async () => {
      const mgr = await freshManager();
      mgr.setTTSSettings({ voiceName: 'Alex' });
      const stored = JSON.parse(localStorage.getItem('mmw-tts-settings')!);
      expect(stored.voiceName).toBe('Alex');
      expect(stored.rate).toBe(1.0);
      expect(stored.pitch).toBe(1.0);
    });

    it('merges multiple partial updates', async () => {
      const mgr = await freshManager();
      mgr.setTTSSettings({ rate: 1.3 });
      mgr.setTTSSettings({ pitch: 0.7 });
      const settings = mgr.getTTSSettings();
      expect(settings.rate).toBe(1.3);
      expect(settings.pitch).toBe(0.7);
      expect(settings.voiceName).toBeNull();
    });

    it('getTTSSettings returns a copy (not a reference)', async () => {
      const mgr = await freshManager();
      const a = mgr.getTTSSettings();
      a.rate = 999;
      expect(mgr.getTTSSettings().rate).toBe(1.0);
    });
  });

  describe('speakDirect', () => {
    it('applies current rate and pitch to utterance', async () => {
      const mgr = await freshManager();
      mgr.setTTSSettings({ rate: 1.5, pitch: 0.8 });
      mgr.speakDirect('Hello');
      expect(mockCancel).toHaveBeenCalled();
      expect(mockSpeak).toHaveBeenCalled();
      const utt = utteranceInstances[utteranceInstances.length - 1];
      expect(utt.text).toBe('Hello');
      expect(utt.rate).toBe(1.5);
      expect(utt.pitch).toBe(0.8);
    });

    it('sets voice when voiceName matches an available voice', async () => {
      const mockVoice = { name: 'Alex', lang: 'en-US' } as SpeechSynthesisVoice;
      mockGetVoices.mockReturnValue([mockVoice]);

      const mgr = await freshManager();
      mgr.setTTSSettings({ voiceName: 'Alex' });
      mgr.speakDirect('Test');

      const utt = utteranceInstances[utteranceInstances.length - 1];
      expect(utt.voice).toBe(mockVoice);
    });

    it('leaves voice unset when voiceName is null', async () => {
      const mgr = await freshManager();
      mgr.setTTSSettings({ voiceName: null });
      mgr.speakDirect('Test');

      const utt = utteranceInstances[utteranceInstances.length - 1];
      expect(utt.voice).toBeNull();
    });

    it('leaves voice unset when voiceName does not match any available voice', async () => {
      mockGetVoices.mockReturnValue([{ name: 'Alex', lang: 'en-US' } as SpeechSynthesisVoice]);

      const mgr = await freshManager();
      mgr.setTTSSettings({ voiceName: 'NonExistent' });
      mgr.speakDirect('Test');

      const utt = utteranceInstances[utteranceInstances.length - 1];
      expect(utt.voice).toBeNull();
    });
  });

  describe('mute state persistence', () => {
    it('defaults to unmuted', async () => {
      const mgr = await freshManager();
      expect(mgr.isMuted()).toBe(false);
    });

    it('loads muted state from localStorage', async () => {
      localStorage.setItem('mmw-audio-muted', 'true');
      const mgr = await freshManager();
      expect(mgr.isMuted()).toBe(true);
    });

    it('persists mute toggle to localStorage', async () => {
      const mgr = await freshManager();
      mgr.setMuted(true);
      expect(localStorage.getItem('mmw-audio-muted')).toBe('true');
      mgr.setMuted(false);
      expect(localStorage.getItem('mmw-audio-muted')).toBe('false');
    });
  });
});
