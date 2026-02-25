# Hint Reveal Flow Implementation Plan

## Overview

Add an interactive hint request/voting UI during the round reveal phase, and insert a dedicated "hint reveal" step when a hint is granted before transitioning to the next round.

## Current Behavior

- Hints are requested/voted on during **ROUND_ACTIVE** only
- Hints are granted silently at `endRound()` and appear in guess history
- No dedicated phase or visual moment to showcase the hint
- Phase flow: `ROUND_REVEALING → ROUND_ACCOLADES → ROUND_SCOREBOARD → next round`

## Proposed Changes

### Phase Flow (When Hint Is Granted)

```
ROUND_REVEALING (8s)
  ├─ Shows guesses ranked by quality
  ├─ Leader/players can request/vote for hint during this phase
  └─ At phase end: check if hint was requested/vote passed
       ↓
ROUND_HINT_REVEAL (4s) ← NEW (only if hint granted)
  ├─ Announces hint was granted/voted for
  └─ Reveals the hint word with dramatic effect
       ↓
ROUND_ACCOLADES (8s) → ROUND_SCOREBOARD (6s) → next round
```

If no hint is granted, skip straight from ROUND_REVEALING → ROUND_ACCOLADES (current behavior).

---

## Implementation Steps

### Step 1: Extend Shared Types

**File: `shared/src/gameState.ts`**

1. Add `'ROUND_HINT_REVEAL'` to `GamePhase` union type
2. Add new state interface:
   ```typescript
   export interface RoundHintRevealState extends BaseState {
     phase: 'ROUND_HINT_REVEAL';
     round: RoundData;
     hintWord: string;
     hintRank: number;
     previousTeamBest: number;
     scoreboard: ScoreEntry[];
     phaseTimeRemaining: number;
     phaseTotalTime: number;
   }
   ```
3. Add `RoundHintRevealState` to `GameState` union

**File: `shared/src/constants.ts`**

1. Add `HINT_REVEAL_DISPLAY_TIME = 4` constant

### Step 2: Extend Revealing State for Hint UI

**File: `shared/src/gameState.ts`**

1. Add hint-related fields to `RoundRevealingState`:
   ```typescript
   export interface RoundRevealingState extends BaseState {
     // ... existing fields
     hintAvailable: boolean;
     hintMode: HintMode;
     hintApproved: boolean;
     hintVote?: {
       votesNeeded: number;
       currentVotes: number;
       voterIds: string[];
     };
   }
   ```

### Step 3: Update Server Game Logic

**File: `server/src/game/GameRoom.ts`**

1. **Move hint granting from `endRound()` to `advancePhase()`**:
   - Remove `shouldGiveHint` logic from `endRound()`
   - In `advancePhase()` when transitioning from `ROUND_REVEALING`:
     - Check if hint should be granted (host approved or vote passed)
     - If yes: give hint, transition to `ROUND_HINT_REVEAL`
     - If no: transition to `ROUND_ACCOLADES` (current behavior)

2. **Allow hint requests during ROUND_REVEALING**:
   - Modify `approveHint()` to accept phase `ROUND_REVEALING` (not just `ROUND_ACTIVE`)
   - Modify `voteForHint()` to accept phase `ROUND_REVEALING`

3. **Store previous teamBest before hint**:
   - Track `previousTeamBest` before calling `giveHint()` for display purposes

4. **Add new phase to `advancePhase()`**:
   ```typescript
   case 'ROUND_REVEALING': {
     const shouldGiveHint = this.shouldGrantHint();
     if (shouldGiveHint && this.isHintAvailable()) {
       this.previousTeamBest = this.teamBest;
       this.giveHint();
       this.phase = 'ROUND_HINT_REVEAL';
       this.startPhaseTimer(HINT_REVEAL_DISPLAY_TIME);
     } else {
       this.phase = 'ROUND_ACCOLADES';
       // ... existing accolades logic
     }
     break;
   }

   case 'ROUND_HINT_REVEAL': {
     this.phase = 'ROUND_ACCOLADES';
     // ... existing accolades logic
     break;
   }
   ```

5. **Add `getState()` case for `ROUND_HINT_REVEAL`**:
   - Return hint details (word, rank, previousTeamBest, etc.)

6. **Include hint UI fields in `ROUND_REVEALING` state**:
   - Add `hintAvailable`, `hintMode`, `hintApproved`, `hintVote` to revealing state

### Step 4: Update Socket Handlers

**File: `server/src/socket/handlers.ts`**

1. No changes needed - existing `game:hint` handler delegates to `room.approveHint()` / `room.voteForHint()` which will now accept ROUND_REVEALING phase

### Step 5: Create Client Hint Reveal Components

**File: `client/src/screens/player/PlayerHintReveal.tsx`** (new)

```typescript
// Displays:
// - "A hint has been granted!" or "The team voted for a hint!"
// - Animated reveal of hint word with golden glow effect
// - Rank badge showing the hint rank
// - Progress bar countdown
```

**File: `client/src/screens/host/HostHintReveal.tsx`** (new)

```typescript
// Large TV display version:
// - Dramatic announcement
// - Large animated hint word with particle effects
// - Rank zone indicator (e.g., "ORANGE ZONE")
// - Phase progress bar
```

### Step 6: Add Hint Request UI to Revealing Phase

**File: `client/src/screens/player/PlayerResults.tsx`**

1. In the `ROUND_REVEALING` section, add hint request UI:
   - **Host mode**: Leader sees "Grant Hint" button
   - **Vote mode**: All players see "Vote for Hint (x/y)" button
   - Button disabled if hint already approved, not available, or player already voted

**File: `client/src/screens/host/HostRoundResults.tsx`**

1. In revealing phase, show hint voting status if `hintMode !== 'none'`:
   - Display vote count or "Leader deciding..." indicator
   - No interactive buttons (host is passive display)

### Step 7: Update Phase Routing

**File: `client/src/screens/player/PlayerScreen.tsx`**

```typescript
case 'ROUND_HINT_REVEAL':
  return <PlayerHintReveal state={gameState} game={game} />;
```

**File: `client/src/screens/host/HostScreen.tsx`**

```typescript
case 'ROUND_HINT_REVEAL':
  return <HostHintReveal state={gameState} />;
```

### Step 8: Add Hint Reveal Animations

**File: `client/src/index.css`**

1. Add dramatic hint reveal animation:
   ```css
   @keyframes hint-reveal-glow {
     0% { opacity: 0; transform: scale(0.8); }
     50% { opacity: 1; transform: scale(1.05); }
     100% { opacity: 1; transform: scale(1); }
   }

   .hint-reveal-animation {
     animation: hint-reveal-glow 0.8s ease-out forwards;
   }
   ```

---

## State Machine Changes Summary

### Before
```
endRound() {
  giveHint() if approved  // Silent
  phase = ROUND_REVEALING
}

advancePhase() {
  ROUND_REVEALING → ROUND_ACCOLADES
}
```

### After
```
endRound() {
  // Don't give hint here
  phase = ROUND_REVEALING
}

advancePhase() {
  ROUND_REVEALING → {
    if (shouldGrantHint()) {
      giveHint()
      → ROUND_HINT_REVEAL (4s)
    } else {
      → ROUND_ACCOLADES
    }
  }

  ROUND_HINT_REVEAL → ROUND_ACCOLADES
}
```

---

## UI/UX Details

### Hint Request During Reveal (Player View)

**Host Mode (Leader)**:
- Shows subtle button below the revealed guesses: "💡 Grant Hint for Next Round"
- After clicking: Button shows "Hint Queued ✓" (disabled)
- Tooltip: "Give the team a helping word for the next round"

**Vote Mode (All Players)**:
- Shows voting button: "💡 Vote for Hint (1/3 needed)"
- After voting: "Voted ✓ (2/3 needed)"
- When passed: "Hint Approved! ✓"

### Hint Reveal Phase (New)

**Player Screen**:
- Centered card with golden border/glow
- Header: "🎁 Hint Granted!" or "🗳️ Team Voted for a Hint!"
- Large hint word with rank badge
- Brief explanation: "This word is closer to the secret word"
- Phase countdown bar at bottom

**Host/TV Screen**:
- Full-screen dramatic reveal
- Large animated word with golden shimmer
- Rank zone badge (e.g., "ORANGE ZONE" with color indicator)
- Timer bar at bottom

---

## Edge Cases

1. **Hint not available** (teamBest already very close): Hide hint UI entirely
2. **No players connected during reveal**: Handled by existing AFK detection
3. **Paused during hint reveal**: Timer pauses, hint stays displayed
4. **Game ended during reveal**: Transitions to GAME_OVER (existing logic)
5. **Vote passes exactly at phase transition**: Handle in advancePhase() check

---

## Testing Checklist

- [ ] Host mode: Leader can grant hint during ROUND_REVEALING
- [ ] Host mode: Non-leader cannot see/use grant button
- [ ] Vote mode: All players can vote during ROUND_REVEALING
- [ ] Vote mode: Vote count updates in real-time
- [ ] Vote mode: Hint approved when majority reached
- [ ] Hint reveal phase shows when hint granted
- [ ] Hint reveal skipped when no hint granted
- [ ] Phase timers work correctly
- [ ] Pause/resume works during hint reveal
- [ ] Host screen shows hint reveal properly
- [ ] Player screen shows hint reveal properly
- [ ] Hint word appears in guess history after reveal
- [ ] teamBest updates correctly after hint

---

## Files to Modify

| File | Changes |
|------|---------|
| `shared/src/gameState.ts` | Add `ROUND_HINT_REVEAL` phase, state interface |
| `shared/src/constants.ts` | Add `HINT_REVEAL_DISPLAY_TIME` constant |
| `server/src/game/GameRoom.ts` | Move hint grant to advancePhase, add new phase handling |
| `client/src/screens/player/PlayerResults.tsx` | Add hint request UI to revealing phase |
| `client/src/screens/player/PlayerHintReveal.tsx` | New file - hint reveal display |
| `client/src/screens/player/PlayerScreen.tsx` | Add route for ROUND_HINT_REVEAL |
| `client/src/screens/host/HostRoundResults.tsx` | Add hint status display |
| `client/src/screens/host/HostHintReveal.tsx` | New file - TV hint reveal display |
| `client/src/screens/host/HostScreen.tsx` | Add route for ROUND_HINT_REVEAL |
| `client/src/index.css` | Add hint reveal animations |
