import { useMemo } from 'react';
import { audioManager } from './AudioManager';
import type { TTSSettings } from './AudioManager';
import type { NarratorEngine } from '../narrator/types';
import { ELEVENLABS_VOICES } from '../narrator/gate';

interface Props {
  open: boolean;
  onClose: () => void;
  voices: SpeechSynthesisVoice[];
  settings: TTSSettings;
  onSettingsChange: (settings: Partial<TTSSettings>) => void;
  narratorAvailable?: boolean;
  narratorConnected?: boolean;
  narratorError?: string | null;
}

const NARRATOR_OPTIONS: { value: NarratorEngine; label: string }[] = [
  { value: null, label: 'None (Browser TTS)' },
  { value: 'elevenlabs-agent', label: 'ElevenLabs Agent' },
  { value: 'openai-agent', label: 'OpenAI Realtime' },
  { value: 'claude', label: 'Claude + TTS' },
];

export default function TTSSettingsModal({
  open, onClose, voices, settings, onSettingsChange,
  narratorAvailable = false, narratorConnected = false, narratorError = null,
}: Props) {
  const groupedVoices = useMemo(() => {
    const groups = new Map<string, SpeechSynthesisVoice[]>();
    for (const voice of voices) {
      const lang = voice.lang;
      if (!groups.has(lang)) groups.set(lang, []);
      groups.get(lang)!.push(voice);
    }
    return groups;
  }, [voices]);

  if (!open) return null;

  const isAgentEngine = settings.narratorEngine === 'elevenlabs-agent' || settings.narratorEngine === 'openai-agent';
  const isClaude = settings.narratorEngine === 'claude';
  const showBrowserTTS = !settings.narratorEngine;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

      <div
        className="relative z-20 w-full max-w-sm rounded-2xl bg-bg-card shadow-2xl border border-white/10 p-6 max-h-[80vh] overflow-y-auto"
        role="dialog"
        aria-label="Voice Settings"
      >
        <h2 className="text-lg font-bold text-white mb-4">Voice Settings</h2>

        {/* AI Narrator selector */}
        {narratorAvailable && (
          <label className="block mb-4">
            <span className="text-sm text-white/50 block mb-1">AI Narrator</span>
            <select
              value={settings.narratorEngine ?? ''}
              onChange={(e) => onSettingsChange({
                narratorEngine: (e.target.value || null) as NarratorEngine,
              })}
              className="w-full rounded-lg bg-bg-light text-white/90 text-sm px-3 py-2 border border-white/10 focus:outline-none focus:border-accent"
            >
              {NARRATOR_OPTIONS.map(opt => (
                <option key={opt.value ?? ''} value={opt.value ?? ''}>
                  {opt.label}
                </option>
              ))}
            </select>

            {/* Connection status */}
            {settings.narratorEngine && (
              <div className="mt-1 text-xs">
                {narratorError ? (
                  <span className="text-rank-red">{narratorError}</span>
                ) : narratorConnected ? (
                  <span className="text-rank-green">Connected</span>
                ) : (
                  <span className="text-white/30">Connects when game starts</span>
                )}
              </div>
            )}
          </label>
        )}

        {/* Agent engines handle their own audio — hide TTS controls */}
        {isAgentEngine && (
          <p className="text-sm text-white/40 mb-4">
            Voice is managed by the {settings.narratorEngine === 'elevenlabs-agent' ? 'ElevenLabs' : 'OpenAI'} agent.
          </p>
        )}

        {/* Claude narrator: show ElevenLabs voice selector */}
        {isClaude && (
          <label className="block mb-4">
            <span className="text-sm text-white/50 block mb-1">ElevenLabs Voice</span>
            <select
              value={settings.elevenLabsVoiceId ?? ''}
              onChange={(e) => onSettingsChange({ elevenLabsVoiceId: e.target.value || null })}
              className="w-full rounded-lg bg-bg-light text-white/90 text-sm px-3 py-2 border border-white/10 focus:outline-none focus:border-accent"
            >
              <option value="">Default (Josh)</option>
              {ELEVENLABS_VOICES.map(v => (
                <option key={v.id} value={v.id}>
                  {v.name} — {v.description}
                </option>
              ))}
            </select>
          </label>
        )}

        {/* Browser TTS controls: shown when no narrator or when Claude is using browser TTS */}
        {showBrowserTTS && (
          <>
            {/* Voice select */}
            <label className="block mb-4">
              <span className="text-sm text-white/50 block mb-1">Voice</span>
              <select
                value={settings.voiceName ?? ''}
                onChange={(e) => onSettingsChange({ voiceName: e.target.value || null })}
                className="w-full rounded-lg bg-bg-light text-white/90 text-sm px-3 py-2 border border-white/10 focus:outline-none focus:border-accent"
              >
                <option value="">System Default</option>
                {[...groupedVoices.entries()].map(([lang, langVoices]) => (
                  <optgroup key={lang} label={lang}>
                    {langVoices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>

            {/* Rate slider */}
            <label className="block mb-4">
              <span className="text-sm text-white/50 block mb-1">Rate: {settings.rate.toFixed(1)}</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={settings.rate}
                onChange={(e) => onSettingsChange({ rate: parseFloat(e.target.value) })}
                className="w-full accent-accent"
              />
            </label>

            {/* Pitch slider */}
            <label className="block mb-4">
              <span className="text-sm text-white/50 block mb-1">Pitch: {settings.pitch.toFixed(1)}</span>
              <input
                type="range"
                min={0.5}
                max={2.0}
                step={0.1}
                value={settings.pitch}
                onChange={(e) => onSettingsChange({ pitch: parseFloat(e.target.value) })}
                className="w-full accent-accent"
              />
            </label>
          </>
        )}

        {/* Buttons */}
        <div className="flex gap-2">
          {showBrowserTTS && (
            <button
              onClick={() => audioManager.speakDirect('Testing voice settings')}
              className="flex-1 text-sm px-3 py-2 rounded-lg text-white/70 border border-white/10 hover:bg-white/5 transition-colors"
            >
              Test Voice
            </button>
          )}
          <button
            onClick={onClose}
            className="flex-1 text-sm px-3 py-2 rounded-lg font-semibold text-white bg-accent hover:bg-accent/80 transition-colors"
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
