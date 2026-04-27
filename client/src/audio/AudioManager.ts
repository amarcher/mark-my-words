/**
 * AudioManager — Singleton managing all host audio: music playback, TTS speech queue,
 * mute/volume, and ducking. Designed for easy ElevenLabs swap (check for mp3 first).
 */

export interface AnnouncementEntry {
  id: string;
  text: string;
  priority: number; // 1-3, lower = higher priority
  phase: string;
}

const STORAGE_KEY = 'mmw-audio-muted';
const TTS_SETTINGS_KEY = 'mmw-tts-settings';
const DUCK_VOLUME = 0.15;
const DUCK_IN_MS = 300;
const DUCK_OUT_MS = 500;
const TTS_TIMEOUT_MS = 8000; // Safety timeout if onend/onerror never fire

import type { NarratorEngine } from '../narrator/types';

export interface TTSSettings {
  voiceName: string | null; // null = browser default
  rate: number; // 0.5–2.0
  pitch: number; // 0.5–2.0
  narratorEngine: NarratorEngine;
  elevenLabsVoiceId: string | null;
}

const DEFAULT_TTS: TTSSettings = {
  voiceName: null, rate: 1.0, pitch: 1.0,
  narratorEngine: null, elevenLabsVoiceId: null,
};

function clamp(v: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, v));
}

function loadTTSSettings(): TTSSettings {
  try {
    const raw = localStorage.getItem(TTS_SETTINGS_KEY);
    if (!raw) return { ...DEFAULT_TTS };
    const p = JSON.parse(raw);
    const validEngines = ['elevenlabs-agent', 'openai-agent', 'claude'];
    return {
      voiceName: typeof p.voiceName === 'string' ? p.voiceName : null,
      rate: typeof p.rate === 'number' ? clamp(p.rate, 0.5, 2.0) : 1.0,
      pitch: typeof p.pitch === 'number' ? clamp(p.pitch, 0.5, 2.0) : 1.0,
      narratorEngine: validEngines.includes(p.narratorEngine) ? p.narratorEngine : null,
      elevenLabsVoiceId: typeof p.elevenLabsVoiceId === 'string' ? p.elevenLabsVoiceId : null,
    };
  } catch {
    return { ...DEFAULT_TTS };
  }
}

class AudioManager {
  private ctx: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private musicGain: GainNode | null = null;
  private currentMusic: HTMLAudioElement | null = null;
  private currentMusicSource: MediaElementAudioSourceNode | null = null;
  private muted: boolean;
  private paused = false;
  private queue: AnnouncementEntry[] = [];
  private speaking = false;
  private mp3Cache = new Map<string, boolean>(); // id → exists
  private voicesReady = false;
  private tts: TTSSettings;
  onQueueDrained: (() => void) | null = null;

  constructor() {
    this.muted = localStorage.getItem(STORAGE_KEY) === 'true';
    this.tts = loadTTSSettings();
    // Pre-load voices — Chrome loads them async
    this.warmUpVoices();
  }

  private warmUpVoices(): void {
    const voices = speechSynthesis.getVoices();
    if (voices.length > 0) {
      this.voicesReady = true;
      return;
    }
    speechSynthesis.addEventListener('voiceschanged', () => {
      this.voicesReady = true;
    }, { once: true });
  }

  /** Create AudioContext on user gesture (required by browser autoplay policy) */
  unlock(): void {
    if (this.ctx) return;
    this.ctx = new AudioContext();

    this.masterGain = this.ctx.createGain();
    this.masterGain.gain.value = this.muted ? 0 : 1;
    this.masterGain.connect(this.ctx.destination);

    this.musicGain = this.ctx.createGain();
    this.musicGain.gain.value = 1.0;
    this.musicGain.connect(this.masterGain);

    // Resume if suspended (Chrome requires this)
    if (this.ctx.state === 'suspended') {
      this.ctx.resume();
    }

    // Warm up speechSynthesis with a silent utterance on user gesture
    const warmup = new SpeechSynthesisUtterance('');
    warmup.volume = 0;
    speechSynthesis.speak(warmup);
  }

  isMuted(): boolean {
    return this.muted;
  }

  setMuted(muted: boolean): void {
    this.muted = muted;
    localStorage.setItem(STORAGE_KEY, String(muted));

    if (this.masterGain) {
      this.masterGain.gain.value = muted ? 0 : 1;
    }

    if (muted) {
      speechSynthesis.cancel();
      this.speaking = false;
      this.queue = [];
    }
  }

  getTTSSettings(): TTSSettings {
    return { ...this.tts };
  }

  setTTSSettings(settings: Partial<TTSSettings>): void {
    Object.assign(this.tts, settings);
    localStorage.setItem(TTS_SETTINGS_KEY, JSON.stringify(this.tts));
  }

  /** Get available speech synthesis voices */
  getVoices(): SpeechSynthesisVoice[] {
    return speechSynthesis.getVoices();
  }

  /** Speak text directly using current TTS settings (for test button) */
  speakDirect(text: string): void {
    speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.rate = this.tts.rate;
    utterance.pitch = this.tts.pitch;
    if (this.tts.voiceName) {
      const voice = speechSynthesis.getVoices().find(v => v.name === this.tts.voiceName);
      if (voice) utterance.voice = voice;
    }
    speechSynthesis.speak(utterance);
  }

  setPaused(paused: boolean): void {
    this.paused = paused;

    if (paused) {
      this.currentMusic?.pause();
      speechSynthesis.cancel();
      this.speaking = false;
      this.queue = [];
    } else {
      this.currentMusic?.play().catch(() => {});
    }
  }

  /**
   * Tab visibility hooks. Unlike setPaused, these don't cancel speech or clear
   * the queue — backgrounding shouldn't be observable on resume. Browsers
   * already throttle most audio when hidden; we just stop the music element
   * so it doesn't keep pulling network/cpu in the background.
   */
  pauseMusicForBackground(): void {
    this.currentMusic?.pause();
  }

  resumeMusicFromBackground(): void {
    if (this.muted || this.paused) return;
    this.currentMusic?.play().catch(() => {});
  }

  /** Load and loop a music track. Gracefully no-ops if file doesn't exist. */
  async playMusic(src: string, crossfadeDuration = 1000): Promise<void> {
    if (!this.ctx || !this.musicGain) return;

    const audio = new Audio(src);
    audio.loop = true;
    audio.crossOrigin = 'anonymous';

    try {
      // Test if the file exists by trying to load it
      await new Promise<void>((resolve, reject) => {
        audio.addEventListener('canplaythrough', () => resolve(), { once: true });
        audio.addEventListener('error', () => reject(), { once: true });
        audio.load();
      });
    } catch {
      // File doesn't exist — no-op
      return;
    }

    // Fade out old music
    if (this.currentMusic && this.currentMusicSource) {
      const oldMusic = this.currentMusic;
      const oldSource = this.currentMusicSource;
      const fadeGain = this.ctx.createGain();
      fadeGain.gain.value = 1.0;
      fadeGain.connect(this.musicGain);
      oldSource.disconnect();
      oldSource.connect(fadeGain);
      fadeGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + crossfadeDuration / 1000);
      setTimeout(() => {
        oldMusic.pause();
        oldSource.disconnect();
        fadeGain.disconnect();
      }, crossfadeDuration);
    }

    // Connect new music
    const source = this.ctx.createMediaElementSource(audio);
    source.connect(this.musicGain);
    this.currentMusic = audio;
    this.currentMusicSource = source;

    if (!this.paused) {
      audio.play().catch(() => {});
    }
  }

  /** Fade out and stop current music */
  stopMusic(fadeOutDuration = 1000): void {
    if (!this.ctx || !this.currentMusic || !this.currentMusicSource) return;

    const music = this.currentMusic;
    const source = this.currentMusicSource;
    const fadeGain = this.ctx.createGain();
    fadeGain.gain.value = 1.0;
    fadeGain.connect(this.musicGain!);
    source.disconnect();
    source.connect(fadeGain);
    fadeGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeOutDuration / 1000);

    setTimeout(() => {
      music.pause();
      source.disconnect();
      fadeGain.disconnect();
    }, fadeOutDuration);

    this.currentMusic = null;
    this.currentMusicSource = null;
  }

  /** Add an announcement to the speech queue */
  enqueue(entry: AnnouncementEntry): void {
    if (this.muted || this.paused) return;

    // Insert sorted by priority (lower number = higher priority)
    const idx = this.queue.findIndex(e => e.priority > entry.priority);
    if (idx === -1) {
      this.queue.push(entry);
    } else {
      this.queue.splice(idx, 0, entry);
    }

    if (!this.speaking) {
      this.processQueue();
    }
  }

  /** Clear the speech queue, optionally preserving entries from a specific phase */
  clearQueue(exceptPhase?: string): void {
    if (this.speaking) {
      speechSynthesis.cancel();
      this.speaking = false;
    }
    if (exceptPhase) {
      this.queue = this.queue.filter(e => e.phase === exceptPhase);
    } else {
      this.queue = [];
    }
  }

  private async processQueue(): Promise<void> {
    if (this.speaking || this.queue.length === 0 || this.muted || this.paused) return;

    this.speaking = true;
    const entry = this.queue.shift()!;

    try {
      // Try mp3 first (ElevenLabs swap point)
      const hasMP3 = await this.checkMP3Exists(entry.id);
      if (hasMP3) {
        await this.playMP3(entry.id);
      } else if (entry.text) {
        await this.speakTTS(entry.text);
      }
    } catch {
      // Speech interrupted or failed — continue
    }

    this.speaking = false;

    if (this.queue.length === 0) {
      this.onQueueDrained?.();
    }

    setTimeout(() => this.processQueue(), 200);
  }

  private async checkMP3Exists(id: string): Promise<boolean> {
    if (this.mp3Cache.has(id)) return this.mp3Cache.get(id)!;

    try {
      const res = await fetch(`/audio/announcements/${id}.mp3`, { method: 'HEAD' });
      const contentType = res.headers.get('content-type') || '';
      const exists = res.ok && contentType.includes('audio');
      this.mp3Cache.set(id, exists);
      return exists;
    } catch {
      this.mp3Cache.set(id, false);
      return false;
    }
  }

  private playMP3(id: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(`/audio/announcements/${id}.mp3`);

      this.duckMusic();

      audio.addEventListener('ended', () => {
        this.unduckMusic();
        resolve();
      }, { once: true });

      audio.addEventListener('error', () => {
        this.unduckMusic();
        reject(new Error('MP3 playback failed'));
      }, { once: true });

      audio.play().catch(err => {
        this.unduckMusic();
        reject(err);
      });
    });
  }

  private speakTTS(text: string): Promise<void> {
    return new Promise((resolve) => {
      // Chrome bug: speaking can get stuck. Cancel any stale state first.
      if (speechSynthesis.speaking || speechSynthesis.pending) {
        speechSynthesis.cancel();
      }

      const utterance = new SpeechSynthesisUtterance(text);
      utterance.rate = this.tts.rate;
      utterance.pitch = this.tts.pitch;

      // Use user-selected voice, falling back to an English voice
      const voices = speechSynthesis.getVoices();
      if (this.tts.voiceName) {
        const selected = voices.find(v => v.name === this.tts.voiceName);
        if (selected) {
          utterance.voice = selected;
        }
      } else {
        const english = voices.find(v => v.lang.startsWith('en') && v.default)
          || voices.find(v => v.lang.startsWith('en'));
        if (english) utterance.voice = english;
      }

      let settled = false;
      const settle = () => {
        if (settled) return;
        settled = true;
        resolve();
      };

      utterance.onend = settle;
      utterance.onerror = () => settle();

      // Safety timeout
      setTimeout(settle, TTS_TIMEOUT_MS);

      // Small delay after cancel to avoid Chrome's cancel-then-speak bug
      setTimeout(() => {
        speechSynthesis.speak(utterance);
      }, 50);
    });
  }

  private duckMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.linearRampToValueAtTime(
      DUCK_VOLUME,
      this.ctx.currentTime + DUCK_IN_MS / 1000,
    );
  }

  private unduckMusic(): void {
    if (!this.ctx || !this.musicGain) return;
    this.musicGain.gain.linearRampToValueAtTime(
      1.0,
      this.ctx.currentTime + DUCK_OUT_MS / 1000,
    );
  }
}

// Singleton
export const audioManager = new AudioManager();
