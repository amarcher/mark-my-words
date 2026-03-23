export type { NarratorBackend, NarratorEngine, NarratorGameEvent } from './types';
export {
  formatEvent,
  buildGameStartedEvent,
  buildRoundStartedEvent,
  buildZoneBreakthroughEvent,
  buildRoundEndedEvent,
  buildHintRevealedEvent,
  buildScoreboardEvent,
  buildGameOverEvent,
} from './events';
export { ElevenLabsAgentBackend } from './elevenLabsAgent';
export { OpenAIRealtimeBackend } from './openaiRealtime';
export { ClaudeNarratorBackend } from './claudeNarrator';
export { createNarratorBackend } from './factory';
export type { NarratorBackendOptions } from './factory';
export { isNarratorAvailable, ELEVENLABS_VOICES } from './gate';
export type { ElevenLabsVoice } from './gate';
