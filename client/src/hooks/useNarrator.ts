import { useEffect, useRef, useCallback, useState } from 'react';
import type { GameState } from '@mmw/shared';
import { getRankZone, RANK_ZONES } from '@mmw/shared';
import type { NarratorBackend, NarratorEngine } from '../narrator/types';
import { createNarratorBackend } from '../narrator/factory';
import {
  buildGameStartedEvent,
  buildRoundStartedEvent,
  buildZoneBreakthroughEvent,
  buildRoundEndedEvent,
  buildHintRevealedEvent,
  buildScoreboardEvent,
  buildGameOverEvent,
} from '../narrator/events';
import type { ClaudeNarratorBackend } from '../narrator/claudeNarrator';
import { usePageVisibility } from './usePageVisibility';

function getZoneLabel(teamBest: number): string {
  if (teamBest <= 1) return RANK_ZONES.WIN.label;
  if (teamBest <= 10) return RANK_ZONES.GREEN_HOT.label;
  if (teamBest <= 50) return RANK_ZONES.GREEN_WARM.label;
  if (teamBest <= 300) return RANK_ZONES.GREEN.label;
  if (teamBest <= 1500) return RANK_ZONES.ORANGE.label;
  return RANK_ZONES.RED.label;
}

interface UseNarratorOptions {
  narratorEngine: NarratorEngine;
  muted: boolean;
  voiceName?: string | null;
  rate?: number;
  pitch?: number;
  elevenLabsVoiceId?: string | null;
}

interface UseNarratorReturn {
  narratorConnected: boolean;
  narratorError: string | null;
}

export function useNarrator(
  gameState: GameState | null,
  options: UseNarratorOptions,
): UseNarratorReturn {
  const { narratorEngine, muted, voiceName, rate, pitch, elevenLabsVoiceId } = options;
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const backendRef = useRef<NarratorBackend | null>(null);
  const prevPhaseRef = useRef<string | null>(null);
  const prevTeamBestZoneRef = useRef<string | null>(null);
  const prevEngineRef = useRef<NarratorEngine>(null);
  const gameOverSentRef = useRef(false);
  const isVisible = usePageVisibility();

  // When the tab is backgrounded, suspend the AudioContext, drop pending audio,
  // and clear the 30s wall-clock idle timer so the WS doesn't silently drop.
  useEffect(() => {
    const backend = backendRef.current;
    if (!backend) return;
    if (isVisible) backend.resumeFromBackground();
    else backend.pauseForBackground();
  }, [isVisible]);

  const updateState = useCallback(() => {
    const backend = backendRef.current;
    setConnected(backend?.isConnected ?? false);
    setError(backend?.connectionError ?? null);
  }, []);

  // Manage backend lifecycle based on engine + muted
  useEffect(() => {
    const engineChanged = narratorEngine !== prevEngineRef.current;
    prevEngineRef.current = narratorEngine;

    const shouldBeActive = narratorEngine !== null && !muted;

    if (!shouldBeActive || engineChanged) {
      // Tear down existing backend
      if (backendRef.current) {
        backendRef.current.disconnect();
        backendRef.current.setOnStateChange(null);
        backendRef.current.setOnIdle(null);
        backendRef.current = null;
        updateState();
      }
    }

    if (!shouldBeActive) return;

    if (!backendRef.current) {
      const backend = createNarratorBackend(narratorEngine, {
        voiceName, rate, pitch, elevenLabsVoiceId,
      });
      if (!backend) return;

      backend.setOnStateChange(updateState);
      backend.setOnIdle(() => {
        // On GAME_OVER idle, disconnect
        if (gameOverSentRef.current) {
          backend.disconnect();
          updateState();
        }
      });
      backendRef.current = backend;
    }

    return () => {
      if (backendRef.current) {
        backendRef.current.disconnect();
        backendRef.current.setOnStateChange(null);
        backendRef.current.setOnIdle(null);
        backendRef.current = null;
      }
    };
  }, [narratorEngine, muted]); // eslint-disable-line react-hooks/exhaustive-deps

  // Sync voice settings for Claude backend without reconnection
  useEffect(() => {
    const backend = backendRef.current;
    if (backend && backend.name === 'claude') {
      (backend as ClaudeNarratorBackend).setVoiceSettings({
        voiceName, rate, pitch, elevenLabsVoiceId,
      });
    }
  }, [voiceName, rate, pitch, elevenLabsVoiceId]);

  // Phase transition → narrator events
  useEffect(() => {
    const backend = backendRef.current;
    if (!gameState || !backend) {
      prevPhaseRef.current = null;
      prevTeamBestZoneRef.current = null;
      gameOverSentRef.current = false;
      return;
    }

    const currentPhase = gameState.phase;
    const prevPhase = prevPhaseRef.current;

    if (currentPhase !== prevPhase) {
      // Connect on first ROUND_ACTIVE (game start)
      if (currentPhase === 'ROUND_ACTIVE' && (prevPhase === null || prevPhase === 'LOBBY')) {
        gameOverSentRef.current = false;
        backend.connect().then(() => {
          updateState();
          backend.sendEvent(buildGameStartedEvent(
            gameState.players,
            gameState.round.totalRounds,
            gameState.teamBest,
          ));
          backend.sendEvent(buildRoundStartedEvent(
            gameState.round.roundNumber,
            gameState.round.totalRounds,
            gameState.teamBest,
          ));
        });
        prevTeamBestZoneRef.current = getRankZone(gameState.teamBest);
        prevPhaseRef.current = currentPhase;
        return;
      }

      // Subsequent ROUND_ACTIVE (new round)
      if (currentPhase === 'ROUND_ACTIVE' && prevPhase !== 'LOBBY') {
        const topGuesses = gameState.guessHistory.filter(g => !g.isHint);
        backend.sendEvent(buildRoundStartedEvent(
          gameState.round.roundNumber,
          gameState.round.totalRounds,
          gameState.teamBest,
          topGuesses.length > 0 ? topGuesses : undefined,
        ));
        prevTeamBestZoneRef.current = getRankZone(gameState.teamBest);
      }

      if (currentPhase === 'ROUND_REVEALING') {
        backend.sendEvent(buildRoundEndedEvent(
          gameState.round.roundNumber,
          gameState.revealedGuesses,
        ));
      }

      if (currentPhase === 'ROUND_HINT_REVEAL') {
        backend.sendEvent(buildHintRevealedEvent(
          gameState.hintWord,
          gameState.hintRank,
        ));
      }

      if (currentPhase === 'ROUND_SCOREBOARD') {
        backend.sendEvent(buildScoreboardEvent(
          gameState.scoreboard,
          gameState.round.roundNumber,
        ));
      }

      if (currentPhase === 'GAME_OVER') {
        gameOverSentRef.current = true;
        backend.sendEvent(buildGameOverEvent(
          gameState.secretWord,
          gameState.scoreboard,
        ));
      }

      // Disconnect on return to LOBBY
      if (currentPhase === 'LOBBY') {
        backend.disconnect();
        updateState();
        gameOverSentRef.current = false;
      }

      prevPhaseRef.current = currentPhase;
    }

    // Zone breakthrough during ROUND_ACTIVE
    if (currentPhase === 'ROUND_ACTIVE') {
      const currentZone = getRankZone(gameState.teamBest);
      if (prevTeamBestZoneRef.current && currentZone !== prevTeamBestZoneRef.current) {
        // Find the player who triggered it (most recent guess with best rank)
        const roundGuesses = gameState.round.guesses;
        const bestGuess = roundGuesses.length > 0
          ? roundGuesses.reduce((best, g) => g.rank < best.rank ? g : best, roundGuesses[0])
          : null;
        const playerName = bestGuess?.playerName ?? 'Someone';

        backend.sendEvent(buildZoneBreakthroughEvent(
          playerName,
          getZoneLabel(gameState.teamBest),
          gameState.teamBest,
        ));
      }
      prevTeamBestZoneRef.current = currentZone;
    }
  }, [gameState, updateState]);

  return { narratorConnected: connected, narratorError: error };
}
