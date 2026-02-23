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
- `GameRoom` — core phase machine: LOBBY → ROUND_ACTIVE → ROUND_REVEALING → ROUND_ACCOLADES → ROUND_SCOREBOARD → GAME_OVER. Manages timers, scoring, pause/resume. Result phases auto-advance on server timers; GAME_OVER stays until leader acts
- `handlers.ts` — socket event registration, delegates to RoomManager
- `WordRanker` — loads word rankings from `server/data/rankings/{word}.json` files. Valid but unranked words get deterministic hash-based ranks (5000–50000)
- `AccoladeEngine` — generates 2-3 fun accolades per round from guess data

**client** (`@mmw/client`) — React + Vite + Tailwind. All socket state lives in `socket.ts` via `useGameState()` hook (singleton socket, auto-reconnect). Routes: `/` (home), `/host` (TV display), `/play` (join form), `/play/:roomCode` (prefilled join). Vite proxies `/socket.io` to `:3001` in dev.

## Key Design Decisions

- **Host ≠ player**: The `/host` screen is a passive TV display. It cannot submit guesses or have a name. It controls pause/resume/end game/settings only.
- **Leader model**: First player to join becomes "leader" (tracked via `leaderId`, not a field on `Player`). Leader can start game, kick players, end game early, trigger play again.
- **Advancement scoring**: Points are based on how much a guess advances the team toward the secret word. Formula: `score = round(100 * ln(teamBest / guessRank))`. `teamBest` starts at 50,000 and tracks the lowest rank seen across all rounds. Only guesses that beat `teamBest` earn points; non-advancing guesses score 0. Equal proportional improvements (e.g. 10x closer) always yield equal points (~230). `teamBest` is part of `BaseState` so all phases can display it.
- **End Game**: Both the host and the leader can end a game early via `game:end` socket event. Transitions any active phase to GAME_OVER, revealing the secret word. Collects in-progress round data before transitioning.
- **Production serving**: In `NODE_ENV=production`, Express serves `client/dist` as static files with SPA catch-all. No CORS needed (same origin). Uses `import.meta.url` for path resolution (ESM — no `__dirname`).
- **Docker build quirk**: shared package must be built with `--composite false` in Docker to avoid a TypeScript incremental emit bug that skips `.d.ts` files.

## Data

`server/data/` (~405MB) contains word ranking data:
- `vocabulary.txt` — ~50k valid English words
- `rankings/` — 90+ JSON files mapping `{word: rank}` per secret word
- `secret-words.json` — available secret words for random selection
