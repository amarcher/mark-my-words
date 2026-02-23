# Mark My Words

A multiplayer word-similarity guessing game. Players compete to find a secret word by submitting guesses that are ranked by semantic similarity — the closer your guess is in meaning, the lower the rank. The first player to guess the secret word (rank #1) wins the round.

**Live at [contexto-multiplayer.fly.dev](https://contexto-multiplayer.fly.dev)**

## How to Play

1. **Host a game** — Open the app on a shared screen (TV, projector, laptop) and click "Host a Game." This creates a room with a 4-letter code and QR code.
2. **Players join** — Each player opens the app on their phone, enters the room code (or scans the QR), and picks a display name.
3. **Leader starts** — The first player to join becomes the "leader" and can start the game once 2+ players have joined.
4. **Guess the word** — Each round, players submit guesses trying to find the secret word. After each guess you see your rank (how semantically close you are) and points earned. Points are based on advancement — bringing the team closer to the secret word earns more. Equal proportional improvements (e.g. 10x closer) always earn the same points regardless of absolute rank.
5. **Round ends** — A round ends when someone finds the secret word, all players submit, or time runs out. Results are revealed with all players' submissions ranked, accolades are awarded alongside round results, and the scoreboard updates.
6. **Final scores** — After all rounds, the player with the most points wins. The leader can start a new game or close the room; other players can leave.

### Roles

- **Host screen** (`/host`) — A passive display for a shared TV. Shows the room code, QR, incoming guesses, reveals, and scores. Can pause/resume and end the game early. Cannot play.
- **Leader** — The first player to join. Can start the game, kick players, end the game early, close the room, and trigger "Play Again."
- **Players** — Everyone who joins via `/play`. Submits guesses and sees personal feedback (rank, points, guess history). Between rounds, players see all submissions stack-ranked with their own entry highlighted. Game over screen shows final standings and all guesses, with the option to leave.

## Local Development

### Prerequisites

- Node.js 22+
- npm 9+

### Setup

```bash
git clone https://github.com/amarcher/mark-my-words.git
cd mark-my-words
npm install
```

### Run

```bash
npm run dev
```

This starts both the server (`:3001`) and client (`:5173`) concurrently. Open `http://localhost:5173` in your browser.

To test multiplayer locally, open `/host` in one tab and `/play` in two other tabs.

### Build

```bash
npm run build
```

Builds all three workspaces in order: `shared` → `server` → `client`.

If you change types in `shared/`, rebuild it before the server or client can see the changes:

```bash
npm run build:shared
```

### Type-check

```bash
# Server
npx tsc --noEmit -p server/tsconfig.json

# Client
npx tsc --noEmit -p client/tsconfig.json
```

### Project Structure

```
shared/     — TypeScript types, constants, and advancement scoring (used by both server and client)
server/     — Express + Socket.io game server
  src/game/ — GameRoom (phase state machine) and RoomManager (room lifecycle)
  data/     — Word rankings (~405MB of precomputed semantic similarity data)
client/     — React + Vite + Tailwind frontend
  src/screens/host/   — TV display screens
  src/screens/player/ — Phone player screens
```

### Deployment

The app is deployed to [Fly.io](https://fly.io). In production, the server serves the built client as static files on a single port.

```bash
fly deploy
```
