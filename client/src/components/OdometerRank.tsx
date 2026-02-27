import { useEffect, useRef, useState, useCallback } from 'react';
import { getRankColor } from '@mmw/shared';

interface OdometerRankProps {
  targetRank: number;
  duration?: number; // ms, default 2500
  onComplete?: () => void;
}

const START_VALUE = 50000;
const DIGIT_COUNT = 5; // enough for 50,000

/** Exponential ease-out: fast start, dramatic slow finish */
function easeOutExpo(t: number): number {
  if (t >= 1) return 1;
  // First 40% of time covers ~95% of distance
  // Using a custom curve: steep early, gentle late
  return 1 - Math.pow(1 - t, 4);
}

function formatDigits(value: number): string[] {
  const clamped = Math.max(1, Math.round(value));
  const str = clamped.toString().padStart(DIGIT_COUNT, '0');
  return str.split('');
}

/** Single rolling digit column */
function DigitColumn({ digit, transitioning }: { digit: string; transitioning: boolean }) {
  const numDigit = parseInt(digit, 10);

  return (
    <span
      className="relative inline-block overflow-hidden"
      style={{ width: '0.65em', height: '1.15em' }}
    >
      <span
        className="absolute left-0 flex flex-col"
        style={{
          top: 0,
          transform: `translateY(${-numDigit * 1.15}em)`,
          transition: transitioning ? 'transform 0.15s ease-out' : 'none',
        }}
      >
        {[0, 1, 2, 3, 4, 5, 6, 7, 8, 9].map(d => (
          <span
            key={d}
            className="block text-center"
            style={{ height: '1.15em', lineHeight: '1.15em' }}
          >
            {d}
          </span>
        ))}
      </span>
    </span>
  );
}

export default function OdometerRank({ targetRank, duration = 2500, onComplete }: OdometerRankProps) {
  const [currentValue, setCurrentValue] = useState(START_VALUE);
  const [done, setDone] = useState(false);
  const rafRef = useRef<number | null>(null);
  const startTimeRef = useRef<number | null>(null);
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;

  // Has animation been running long enough for digit transitions to look good
  const [transitioning, setTransitioning] = useState(false);

  useEffect(() => {
    // Small delay before starting for dramatic effect
    const startDelay = setTimeout(() => {
      setTransitioning(true);
      startTimeRef.current = null;

      const animate = (timestamp: number) => {
        if (startTimeRef.current === null) {
          startTimeRef.current = timestamp;
        }

        const elapsed = timestamp - startTimeRef.current;
        const progress = Math.min(elapsed / duration, 1);
        const easedProgress = easeOutExpo(progress);

        // Interpolate from START_VALUE down to targetRank
        const range = START_VALUE - targetRank;
        const value = START_VALUE - range * easedProgress;
        setCurrentValue(value);

        if (progress < 1) {
          rafRef.current = requestAnimationFrame(animate);
        } else {
          setCurrentValue(targetRank);
          setDone(true);
        }
      };

      rafRef.current = requestAnimationFrame(animate);
    }, 200);

    return () => {
      clearTimeout(startDelay);
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [targetRank, duration]);

  useEffect(() => {
    if (done) {
      onCompleteRef.current?.();
    }
  }, [done]);

  const displayValue = Math.max(1, Math.round(currentValue));
  const digits = formatDigits(displayValue);
  const color = getRankColor(displayValue);

  // Insert commas: for a 5-digit number like 50000 → 50,000
  const withCommas: (string | 'comma')[] = [];
  const len = digits.length;
  for (let i = 0; i < len; i++) {
    withCommas.push(digits[i]);
    const posFromRight = len - 1 - i;
    if (posFromRight > 0 && posFromRight % 3 === 0) {
      withCommas.push('comma');
    }
  }

  // Hide leading zeros
  let seenNonZero = false;

  return (
    <div
      className="inline-flex items-center font-mono font-bold transition-colors duration-300 rounded-2xl px-6 py-3"
      style={{
        fontSize: 'clamp(2.5rem, 6vw, 4rem)',
        backgroundColor: `${color}15`,
        color: color,
        border: `2px solid ${color}30`,
      }}
    >
      <span className="mr-2 opacity-50" style={{ fontSize: '0.6em' }}>#</span>
      {done && targetRank === 1 ? (
        <span className="animate-bounce-in">★</span>
      ) : (
        withCommas.map((item, i) => {
          if (item === 'comma') {
            return (
              <span key={`comma-${i}`} className="opacity-40" style={{ width: '0.3em', textAlign: 'center' }}>
                ,
              </span>
            );
          }
          // Hide leading zeros
          if (!seenNonZero && item === '0') {
            return (
              <span key={i} style={{ width: '0.65em', display: 'inline-block' }} />
            );
          }
          seenNonZero = true;
          return <DigitColumn key={i} digit={item} transitioning={transitioning} />;
        })
      )}
    </div>
  );
}
