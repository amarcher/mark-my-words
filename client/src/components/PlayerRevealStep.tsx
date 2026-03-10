import { useState, useRef, useCallback } from 'react';
import type { GuessResult, Player } from '@mmw/shared';
import { getRankColor } from '@mmw/shared';
import OdometerRank from './OdometerRank';

interface PlayerRevealStepProps {
  guess: GuessResult;
  players: Player[];
  onComplete: () => void;
  /** Compact mode for player phone view */
  compact?: boolean;
}

const ODOMETER_DURATION = 1500; // ms
const POST_REVEAL_PAUSE = 500; // ms after odometer before advancing

export default function PlayerRevealStep({
  guess,
  players,
  onComplete,
  compact = false,
}: PlayerRevealStepProps) {
  const [odometerDone, setOdometerDone] = useState(false);
  const [showPoints, setShowPoints] = useState(false);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  const playerColor = players.find(p => p.id === guess.playerId)?.color;

  const handleOdometerComplete = useCallback(() => {
    setOdometerDone(true);
    setShowPoints(true);
    setTimeout(() => {
      onCompleteRef.current();
    }, POST_REVEAL_PAUSE);
  }, []);

  return (
    <div
      className={`flex items-center gap-3 rounded-xl border-2 animate-slide-up ${
        compact ? 'px-3 py-2' : 'px-5 py-3'
      }`}
      style={{
        borderColor: `${getRankColor(odometerDone ? guess.rank : 50000)}40`,
        backgroundColor: `${getRankColor(odometerDone ? guess.rank : 50000)}08`,
        boxShadow: odometerDone ? `0 0 20px ${getRankColor(guess.rank)}15` : undefined,
      }}
    >
      {/* Player color dot + name */}
      <div className="flex items-center gap-2 min-w-0 shrink-0">
        {playerColor && (
          <span
            className={`rounded-full flex-shrink-0 ${compact ? 'w-2.5 h-2.5' : 'w-3 h-3'}`}
            style={{ backgroundColor: playerColor }}
          />
        )}
        <span
          className={`font-semibold truncate ${compact ? 'text-sm max-w-[5rem]' : 'text-lg max-w-[8rem]'}`}
          style={{ color: playerColor || 'white' }}
        >
          {guess.playerName}
        </span>
      </div>

      {/* Word */}
      <span className={`font-mono text-white/80 truncate ${compact ? 'text-sm' : 'text-xl'}`}>
        &ldquo;{guess.word}&rdquo;
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Odometer */}
      <OdometerRank
        targetRank={guess.rank}
        duration={ODOMETER_DURATION}
        onComplete={handleOdometerComplete}
        size="sm"
      />

      {/* Points */}
      <span
        className={`font-mono font-bold shrink-0 transition-opacity duration-200 ${
          compact ? 'text-sm' : 'text-lg'
        } ${showPoints ? 'opacity-100' : 'opacity-0'}`}
        style={{ color: '#6c63ff', minWidth: compact ? '3rem' : '4rem', textAlign: 'right' }}
      >
        +{guess.points}
      </span>
    </div>
  );
}
