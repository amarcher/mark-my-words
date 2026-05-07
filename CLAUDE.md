# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build & Dev Commands

```bash
# Development (runs server + client concurrently)
npm run dev

# Full build (shared → server → client, order matters)
npm run build

# Build just shared types (required after changing shared/ types)
npm run build:shared
# Or: cd shared && npx tsc --build

# Type-check server or client without emitting
npx tsc --noEmit -p server/tsconfig.json
npx tsc --noEmit -p client/tsconfig.json

# Deploy to Fly.io
fly deploy
```

Tests use Vitest: `npx vitest run` (server + shared tests).

## Architecture

Monorepo with three npm workspaces: `shared/`, `server/`, `client/`.

**shared** (`@mmw/shared`) — TypeScript types and constants used by both server and client. Exports game phase types (discriminated union on `phase`), socket event interfaces, advancement scoring (`calculateAdvancementScore`, `INITIAL_TEAM_BEST`), and rank helpers. Must be rebuilt before server/client can see type changes.

**server** (`@mmw/server`) — Express + Socket.io (ESM, `"type": "module"`). Game logic is a server-authoritative state machine:
- `RoomManager` — room lifecycle, player↔room mapping, host↔room mapping, auto-cleanup of inactive rooms
- `GameRoom` — core phase machine: LOBBY → ROUND_ACTIVE → ROUND_REVEALING → (optional ROUND_HINT_REVEAL) → ROUND_SCOREBOARD → GAME_OVER. Manages timers, scoring, pause/resume. Result phases auto-advance on server timers; GAME_OVER stays until leader acts. Accolades are computed during ROUND_REVEALING (no separate phase). During ROUND_REVEALING, the client drives a per-player sequential reveal with odometer animation — the server holds the phase timer (`phase:hold`/`phase:release`, `MAX_HOLD_MS=90s` safety cap) while the client sequences through each player's card reveal (~2.2s each) then accolades, releasing when done. Each player reveal is a horizontal card (`PlayerRevealStep`); previously revealed players accumulate as static rows above the active card. HINT_REVEAL and SCOREBOARD phases use a persistent "reveal shell" layout.
- `handlers.ts` — socket event registration, delegates to RoomManager
- `WordRanker` — loads word rankings from `server/data/rankings/{word}.json` files. Valid but unranked words get deterministic hash-based ranks (5000–50000)
- `AccoladeEngine` — generates 2-3 fun accolades per round from guess data. "Biggest Leap" requires the guess to beat the team's previous best rank (not just the player's personal best)

**client** (`@mmw/client`) — React + Vite + Tailwind. All socket state lives in `socket.ts` via `useGameState()` hook (singleton socket, auto-reconnect). Routes: `/` (home), `/host` (TV display), `/play` (join form), `/play/:roomCode` (prefilled join). Vite proxies `/socket.io` and `/api` to `:3001` in dev.

## Key Design Decisions

- **Host ≠ player**: The `/host` screen is a passive TV display. It cannot submit guesses or have a name. It controls pause/resume/end game/settings only.
- **Leader model**: First player to join becomes "leader" (tracked via `leaderId`, not a field on `Player`). Leader can start game, kick players, end game early, close the room, and trigger play again.
- **Advancement scoring**: Points are based on how much a guess advances the team toward the secret word. Formula: `score = round(100 * ln(teamBest / guessRank))`. `teamBest` starts at 50,000 and tracks the lowest rank seen across all rounds. Only guesses that beat `teamBest` earn points; non-advancing guesses score 0. Equal proportional improvements (e.g. 10x closer) always yield equal points (~230). `teamBest` is part of `BaseState` so all phases can display it.
- **AFK detection**: If no guesses are submitted during a round, the game auto-pauses with a 60-second countdown (`AFK_CLOSE_TIMEOUT`) instead of cycling through empty result phases. If nobody resumes, the room closes. Resuming rewinds the empty round and starts a fresh one. `afkCountdown` (number | null) is part of `BaseState`.
- **Hint system**: Configurable hints to nudge games forward when stuck. Three modes: `none` (disabled), `host` (leader grants, default), `vote` (players vote, strict majority >50%). Hints reveal a word one rank-zone closer than `teamBest` (e.g. RED→ORANGE). Hints are always granted at round end (reveal phase), never mid-round. The host/TV display has no hint buttons — only the leader (in `host` mode) or players (in `vote` mode) interact with hints. `HintMode` is part of `RoomSettings`. Hint entries use `HINT_PLAYER_ID` (`__hint__`), score 0 points, and don't block `noRepeatWords`. `WordRanker.getWordInRange()` finds candidates. Client shows hints with golden shimmer styling (`.hint-glow` animation).
- **End Game**: Both the host and the leader can end a game early via `game:end` socket event. Transitions any active phase to GAME_OVER, revealing the secret word. Collects in-progress round data before transitioning.
- **Production serving**: In `NODE_ENV=production`, Express serves `client/dist` as static files with SPA catch-all. No CORS needed (same origin). Uses `import.meta.url` for path resolution (ESM — no `__dirname`).
- **Docker build quirk**: shared package must be built with `--composite false` in Docker to avoid a TypeScript incremental emit bug that skips `.d.ts` files.
- **AI Narrator system**: Optional AI gameshow host that replaces canned TTS with dynamic commentary. Gated behind a localStorage token (`contexto-elevenlabs` key, `{enabled: true, token: "..."}` value). Three backends: ElevenLabs Conversational Agent (WebSocket streaming), OpenAI Realtime (WebSocket + PCM16 audio), Claude + TTS (Anthropic API for text + ElevenLabs or browser for speech). Server provides 4 proxy routes under `/api/narrator/` (claude, tts, agent-auth, openai-agent-auth) protected by `x-gate-token` header matched against `NARRATOR_GATE_TOKEN` env var. Client architecture: `narrator/` module (gate, types, events, 3 backends, factory), `useNarrator` hook watches game phase transitions and sends narrator events, `useHostAudio` suppresses canned TTS when narrator is active (music continues). Settings stored in `TTSSettings` with `narratorEngine` and `elevenLabsVoiceId` fields. Env vars: `NARRATOR_GATE_TOKEN`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `ELEVENLABS_AGENT_ID`, `OPENAI_API_KEY` (all optional).

## Data

`server/data/` contains word ranking data. Three ranking sources coexist; `WordRanker.loadRankings()` tries them in order and uses the first match: `rankings-hybrid/` → `rankings-ollama/` → `rankings/`. `getAvailableSecretWords()` unions across all three.

- `vocabulary.txt` — ~45.7k valid English words (canonical word universe across all pipelines)
- `secret-words.json` — secret words eligible for random selection
- `rankings/` (~70 MB, legacy) — GloVe 6B 100d cosine, generated by `scripts/precompute-rankings.py`. Kept as fallback. Signal collapses past rank ~200.
- `rankings-ollama/` (~70 MB) — `mxbai-embed-large` (1024d) cosine via local Ollama, generated by `scripts/precompute-rankings-ollama.py`. Stronger mid-range signal than GloVe but biases toward dominant brand/contextual meaning (e.g. apple → Apple Inc).
- `rankings-hybrid/` (~70 MB, primary) — LLM-tiered (gemma3:27b via Ollama) for ranks 2–251 + embedding fall-through, generated by `scripts/precompute-rankings-hybrid.py`. 4 graded tiers (synonyms / strong / moderate / loose), dedup'd, vocab-filtered, intra-tier sorted by mxbai cosine. Resolves brand-vs-fruit-style disambiguation; mid-tail (ranks ~250–1000) remains a known weak spot.
- `embeddings/` (gitignored) — cached vocab embedding matrix (`{model}.npy` + `vocab-order.txt`). Regenerable via `precompute-rankings-ollama.py`; not shipped in the Docker image.

### Regenerating rankings

All ranking scripts run via `uv run` with PEP 723 inline deps — no virtualenv setup needed.

```bash
# Ollama daemon must be running on localhost:11434
ollama pull mxbai-embed-large
ollama pull gemma3:27b

./scripts/precompute-rankings-ollama.py                   # ~3 min, builds embeddings cache
./scripts/precompute-rankings-hybrid.py --skip-existing   # ~90 min for 89 words on M5 Max
./scripts/compare-rankings.py dog --probe leash bone bark # A/B inspect a secret word
./scripts/expand-secret-words.py --auto                   # grow secret-words.json via gemma3:27b
```
