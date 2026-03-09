import { useEffect, useRef, useCallback, useState } from 'react';
import { audioManager } from './AudioManager';
import type { TTSSettings } from './AudioManager';
import {
  roundStartAnnouncement,
  roundEndAnnouncement,
  scoreboardAnnouncement,
  gameOverAnnouncement,
  zoneBreakthroughAnnouncement,
  hintRevealAnnouncement,
  winnerAnnouncement,
  playerJoinedAnnouncement,
  playerSubmittedAnnouncement,
} from './announcements';
import { socket } from '../socket';
import { getRankZone, RANK_ZONES } from '@mmw/shared';
import type { GameState } from '@mmw/shared';
import { isNarratorAvailable } from '../narrator/gate';
import type { NarratorEngine } from '../narrator/types';

/** Map zone key to a display label for announcements */
function getZoneLabel(teamBest: number): string {
  if (teamBest <= 1) return RANK_ZONES.WIN.label;
  if (teamBest <= 10) return RANK_ZONES.GREEN_HOT.label;
  if (teamBest <= 50) return RANK_ZONES.GREEN_WARM.label;
  if (teamBest <= 300) return RANK_ZONES.GREEN.label;
  if (teamBest <= 1500) return RANK_ZONES.ORANGE.label;
  return RANK_ZONES.RED.label;
}

export function useHostAudio(gameState: GameState | null) {
  const [muted, setMuted] = useState(audioManager.isMuted());
  const [ttsSettings, setTtsSettings] = useState<TTSSettings>(audioManager.getTTSSettings());
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>(() => speechSynthesis.getVoices());
  const [settingsOpen, setSettingsOpen] = useState(false);
  const prevPhaseRef = useRef<string | null>(null);
  const prevTeamBestZoneRef = useRef<string | null>(null);
  const winnerTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [narratorAvailable] = useState(() => isNarratorAvailable());
  const narratorActive = ttsSettings.narratorEngine !== null && !muted;

  // Load voices (Chrome fires voiceschanged async)
  useEffect(() => {
    const update = () => setVoices(speechSynthesis.getVoices());
    speechSynthesis.addEventListener('voiceschanged', update);
    update();
    return () => speechSynthesis.removeEventListener('voiceschanged', update);
  }, []);

  const toggleMute = useCallback(() => {
    const next = !muted;
    setMuted(next);
    audioManager.setMuted(next);
  }, [muted]);

  const unlockAudio = useCallback(() => {
    audioManager.unlock();
  }, []);

  const updateTTSSettings = useCallback((partial: Partial<TTSSettings>) => {
    audioManager.setTTSSettings(partial);
    setTtsSettings(audioManager.getTTSSettings());
  }, []);

  const openSettings = useCallback(() => setSettingsOpen(true), []);
  const closeSettings = useCallback(() => setSettingsOpen(false), []);

  // Phase transition logic
  useEffect(() => {
    if (!gameState) {
      prevPhaseRef.current = null;
      prevTeamBestZoneRef.current = null;
      audioManager.stopMusic();
      audioManager.clearQueue();
      return;
    }

    const currentPhase = gameState.phase;
    const prevPhase = prevPhaseRef.current;

    if (currentPhase !== prevPhase) {
      // Clear queue on phase change (except REVEALING→HINT_REVEAL: let TTS finish)
      if (!(prevPhase === 'ROUND_REVEALING' && currentPhase === 'ROUND_HINT_REVEAL')) {
        audioManager.clearQueue();
      }

      // Hold phase timer for ROUND_REVEALING — HostRoundResults manages the release
      // after the sequential per-player reveal sequence completes
      if (currentPhase === 'ROUND_REVEALING') {
        socket.emit('phase:hold');
      }

      // Phase-specific announcements (skip when narrator is active)
      if (!narratorActive) {
        switch (currentPhase) {
          case 'ROUND_ACTIVE':
            audioManager.enqueue(roundStartAnnouncement(gameState.round.roundNumber, gameState.guessHistory));
            break;

          case 'ROUND_REVEALING':
            audioManager.enqueue(roundEndAnnouncement());
            break;

          case 'ROUND_HINT_REVEAL': {
            const hint = hintRevealAnnouncement(gameState);
            if (hint) audioManager.enqueue(hint);
            break;
          }

          case 'ROUND_SCOREBOARD':
            audioManager.enqueue(scoreboardAnnouncement(gameState.scoreboard));
            break;

          case 'GAME_OVER':
            audioManager.enqueue(gameOverAnnouncement(gameState.secretWord));
            // Delayed winner announcement
            if (gameState.scoreboard.length > 0) {
              const winner = gameState.scoreboard[0];
              winnerTimeoutRef.current = setTimeout(() => {
                audioManager.enqueue(winnerAnnouncement(winner.playerName, winner.totalScore));
              }, 3000);
            }
            break;
        }
      }

      // Reset zone tracking for new round (always, regardless of narrator)
      if (currentPhase === 'ROUND_ACTIVE') {
        prevTeamBestZoneRef.current = getRankZone(gameState.teamBest);
      }

      // Music: ambient.mp3 plays during LOBBY and ROUND_ACTIVE, stops otherwise.
      // Phase-specific tracks can override if they exist (graceful no-op if missing).
      switch (currentPhase) {
        case 'LOBBY':
          audioManager.playMusic('/audio/music/ambient.mp3');
          break;
        case 'ROUND_ACTIVE':
          // Continue ambient if already playing from lobby, otherwise start it
          if (prevPhase !== 'LOBBY') {
            audioManager.playMusic('/audio/music/ambient.mp3');
          }
          break;
        case 'ROUND_REVEALING':
        case 'ROUND_HINT_REVEAL':
          // Stop music during results (or play a reveal-specific track if one exists)
          if (prevPhase !== 'ROUND_REVEALING' && prevPhase !== 'ROUND_HINT_REVEAL') {
            audioManager.stopMusic();
            audioManager.playMusic('/audio/music/reveal.mp3');
          }
          break;
        case 'ROUND_SCOREBOARD':
          audioManager.stopMusic();
          audioManager.playMusic('/audio/music/scoreboard.mp3');
          break;
        case 'GAME_OVER':
          audioManager.stopMusic();
          audioManager.playMusic('/audio/music/game-over.mp3');
          break;
      }

      prevPhaseRef.current = currentPhase;
    }

    // Guess reveal and accolade TTS are now driven per-step by HostRoundResults

    // Zone breakthrough detection during ROUND_ACTIVE (skip when narrator active)
    if (currentPhase === 'ROUND_ACTIVE' && !narratorActive) {
      const currentZone = getRankZone(gameState.teamBest);
      if (prevTeamBestZoneRef.current && currentZone !== prevTeamBestZoneRef.current) {
        audioManager.enqueue(zoneBreakthroughAnnouncement(getZoneLabel(gameState.teamBest)));
      }
      prevTeamBestZoneRef.current = currentZone;
    }
  }, [gameState, narratorActive]);

  // Pause handling
  useEffect(() => {
    if (!gameState) return;
    audioManager.setPaused(gameState.paused);
  }, [gameState?.paused]);

  // Socket event listeners for real-time events (skip when narrator active)
  useEffect(() => {
    const onPlayerJoined = (data: { playerId: string; playerName: string }) => {
      if (prevPhaseRef.current === 'LOBBY' && !narratorActive) {
        audioManager.enqueue(playerJoinedAnnouncement(data.playerName));
      }
    };

    const onPlayerSubmitted = (data: { playerId: string; playerName: string }) => {
      if (!narratorActive) {
        audioManager.enqueue(playerSubmittedAnnouncement(data.playerName));
      }
    };

    socket.on('player:joined', onPlayerJoined);
    socket.on('round:player-submitted', onPlayerSubmitted);

    return () => {
      socket.off('player:joined', onPlayerJoined);
      socket.off('round:player-submitted', onPlayerSubmitted);
      if (winnerTimeoutRef.current) clearTimeout(winnerTimeoutRef.current);
    };
  }, [narratorActive]);

  return {
    muted, toggleMute, unlockAudio,
    ttsSettings, updateTTSSettings, voices,
    settingsOpen, openSettings, closeSettings,
    narratorAvailable, narratorActive,
  };
}
