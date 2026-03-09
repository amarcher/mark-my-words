export type NarratorEngine = 'elevenlabs-agent' | 'openai-agent' | 'claude' | null;

export interface NarratorGameEvent {
  type:
    | 'GAME_STARTED'
    | 'ROUND_STARTED'
    | 'ZONE_BREAKTHROUGH'
    | 'ROUND_ENDED'
    | 'HINT_REVEALED'
    | 'SCOREBOARD'
    | 'GAME_OVER';
  data: Record<string, unknown>;
}

export interface NarratorBackend {
  readonly name: string;
  readonly isConnected: boolean;
  readonly connectionError: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  sendEvent(event: NarratorGameEvent): void;
  setVolume(volume: number): void;
  setOnStateChange(cb: (() => void) | null): void;
  setOnIdle(cb: (() => void) | null): void;
}
