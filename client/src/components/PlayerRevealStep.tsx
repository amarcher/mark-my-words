import { useState, useEffect, useRef, useCallback } from 'react';
import type { GuessResult, Player } from '@mmw/shared';
import { getRankColor } from '@mmw/shared';
import OdometerRank from './OdometerRank';

interface PlayerRevealStepProps {
  guess: GuessResult;
  previousGuesses: GuessResult[];
  players: Player[];
  onComplete: () => void;
  /** Compact mode for player phone view (no guess history pane) */
  compact?: boolean;
}

const ROW_HEIGHT = 40; // px per row in the guess history
const ODOMETER_DURATION = 4000; // ms
const POST_REVEAL_PAUSE = 1500; // ms after odometer before advancing

/** Animated guess history with items that reorder as odometer ticks */
function AnimatedGuessHistory({
  previousGuesses,
  currentGuess,
  currentOdometerValue,
  odometerDone,
  players,
}: {
  previousGuesses: GuessResult[];
  currentGuess: GuessResult;
  currentOdometerValue: number;
  odometerDone: boolean;
  players: Player[];
}) {
  const playerColorMap = new Map(players.map(p => [p.id, p.color]));

  // Build full list: previous guesses + mystery entry
  const mysteryRank = odometerDone ? currentGuess.rank : currentOdometerValue;
  const allItems = [
    ...previousGuesses.map(g => ({ ...g, isMystery: false })),
    { ...currentGuess, rank: mysteryRank, isMystery: true },
  ];

  // Sort by rank ascending (best first)
  allItems.sort((a, b) => a.rank - b.rank);

  const containerRef = useRef<HTMLDivElement>(null);
  const mysteryIndex = allItems.findIndex(item => item.isMystery);

  // Auto-scroll to keep mystery entry visible
  useEffect(() => {
    if (containerRef.current && mysteryIndex >= 0) {
      const targetTop = mysteryIndex * ROW_HEIGHT;
      const container = containerRef.current;
      const containerHeight = container.clientHeight;
      const scrollTarget = targetTop - containerHeight / 2 + ROW_HEIGHT / 2;
      container.scrollTo({ top: Math.max(0, scrollTarget), behavior: 'smooth' });
    }
  }, [mysteryIndex]);

  return (
    <div
      ref={containerRef}
      className="overflow-y-auto rounded-xl bg-bg-card/30 border border-white/5"
      style={{ maxHeight: '70vh' }}
    >
      <div className="relative" style={{ height: allItems.length * ROW_HEIGHT }}>
        {allItems.map((item, sortedIndex) => {
          const color = getRankColor(item.rank);
          const playerColor = playerColorMap.get(item.playerId);
          const isMystery = item.isMystery;

          return (
            <div
              key={item.playerId}
              className={`absolute left-0 right-0 flex items-center gap-3 px-3 ${
                isMystery
                  ? 'bg-accent/10 border-y border-accent/20'
                  : ''
              }`}
              style={{
                height: ROW_HEIGHT,
                top: sortedIndex * ROW_HEIGHT,
                transition: 'top 0.3s ease',
              }}
            >
              {/* Rank */}
              <span
                className="font-mono font-bold text-sm min-w-[3.5rem] text-right"
                style={{ color: isMystery && !odometerDone ? '#6c63ff' : color }}
              >
                {isMystery && !odometerDone ? '#????' : `#${item.rank.toLocaleString()}`}
              </span>

              {/* Color bar */}
              <div
                className="w-1 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: isMystery && !odometerDone ? '#6c63ff' : color }}
              />

              {/* Word */}
              <span className="font-mono text-sm flex-1 truncate">
                {item.word}
              </span>

              {/* Player */}
              <span className="flex items-center gap-1 text-xs truncate max-w-[7rem]">
                {playerColor && (
                  <span
                    className="w-2 h-2 rounded-full flex-shrink-0"
                    style={{ backgroundColor: playerColor }}
                  />
                )}
                <span
                  className="truncate"
                  style={{ color: playerColor || 'rgba(255,255,255,0.4)' }}
                >
                  {item.playerName}
                </span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default function PlayerRevealStep({
  guess,
  previousGuesses,
  players,
  onComplete,
  compact = false,
}: PlayerRevealStepProps) {
  const [odometerDone, setOdometerDone] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const [odometerValue, setOdometerValue] = useState(50000);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const playerColor = players.find(p => p.id === guess.playerId)?.color;

  const handleOdometerComplete = useCallback(() => {
    setOdometerDone(true);
    setShowPoints(true);
    // Pause briefly after reveal, then advance
    setTimeout(() => {
      onCompleteRef.current();
    }, POST_REVEAL_PAUSE);
  }, []);

  // Track odometer value for the animated history (host view only)
  useEffect(() => {
    if (compact) return;
    const startTime = Date.now() + 200; // account for odometer start delay
    let raf: number;

    const update = () => {
      const elapsed = Date.now() - startTime;
      const progress = Math.min(Math.max(elapsed / ODOMETER_DURATION, 0), 1);
      // Mirror the odometer's easing
      const eased = 1 - Math.pow(1 - progress, 4);
      const range = 50000 - guess.rank;
      const value = 50000 - range * eased;
      setOdometerValue(Math.max(guess.rank, Math.round(value)));

      if (progress < 1) {
        raf = requestAnimationFrame(update);
      }
    };

    raf = requestAnimationFrame(update);
    return () => cancelAnimationFrame(raf);
  }, [guess.rank, compact]);

  if (compact) {
    // Player phone view: single column, centered
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] animate-fade-in px-4">
        {/* Player name */}
        <p
          className="text-lg font-semibold mb-1"
          style={{ color: playerColor || 'white' }}
        >
          {guess.playerName}
        </p>

        {/* Guessed word */}
        <p className="text-3xl font-bold font-mono mb-6 text-white/90">
          "{guess.word}"
        </p>

        {/* Odometer */}
        <OdometerRank
          targetRank={guess.rank}
          duration={ODOMETER_DURATION}
          onComplete={handleOdometerComplete}
        />

        {/* Points badge */}
        {showPoints && (
          <div className="mt-4 animate-scale-in">
            <span className="text-2xl font-bold font-mono text-accent">
              +{guess.points} pts
            </span>
          </div>
        )}
      </div>
    );
  }

  // Host TV view: two-pane layout
  return (
    <div className="flex gap-8 w-full max-w-5xl mx-auto animate-fade-in" style={{ minHeight: '70vh' }}>
      {/* Left pane: player reveal */}
      <div className="flex-1 flex flex-col items-center justify-center">
        {/* Player name */}
        <p
          className="text-2xl font-semibold mb-2"
          style={{ color: playerColor || 'white' }}
        >
          {guess.playerName}
        </p>

        {/* Guessed word */}
        <p className="text-5xl font-bold font-mono mb-8 text-white/90">
          "{guess.word}"
        </p>

        {/* Odometer - dominant visual element */}
        <OdometerRank
          targetRank={guess.rank}
          duration={ODOMETER_DURATION}
          onComplete={handleOdometerComplete}
        />

        {/* Points badge */}
        {showPoints && (
          <div className="mt-6 animate-scale-in">
            <span className="text-3xl font-bold font-mono text-accent">
              +{guess.points} pts
            </span>
          </div>
        )}
      </div>

      {/* Right pane: animated guess history */}
      {(previousGuesses.length > 0 || true) && (
        <div className="flex-1 flex flex-col">
          <h3 className="text-sm text-white/40 uppercase tracking-wider text-center mb-3">
            All Guesses
          </h3>
          <AnimatedGuessHistory
            previousGuesses={previousGuesses}
            currentGuess={guess}
            currentOdometerValue={odometerValue}
            odometerDone={odometerDone}
            players={players}
          />
        </div>
      )}
    </div>
  );
}
