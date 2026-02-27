import { useState, useRef, useCallback, useEffect } from 'react';
import type { GuessResult, Accolade } from '@mmw/shared';

export interface RevealSequenceState {
  /** -1 = not started, 0..N-1 = player reveals, N = accolades phase */
  step: number;
  /** Guesses in randomized reveal order */
  shuffledGuesses: GuessResult[];
  /** All guesses revealed so far (for the guess history pane) */
  previousGuesses: GuessResult[];
  /** Current guess being revealed (null during accolades) */
  currentGuess: GuessResult | null;
  /** Whether we're in the accolades display step */
  showingAccolades: boolean;
  /** Whether the entire sequence is complete */
  done: boolean;
  /** Accolades data */
  accolades: Accolade[];
  /** Advance to the next step */
  advance: () => void;
}

function shuffle<T>(arr: T[]): T[] {
  const result = [...arr];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

/**
 * Manages the step-by-step reveal sequence during ROUND_REVEALING.
 * Both host and player views use this to stay in sync.
 */
export function useRevealSequence(
  isRevealing: boolean,
  revealedGuesses: GuessResult[] | undefined,
  accolades: Accolade[] | undefined,
): RevealSequenceState {
  const [step, setStep] = useState(-1);
  const shuffledRef = useRef<GuessResult[]>([]);
  const accoladesRef = useRef<Accolade[]>([]);
  const initializedRef = useRef(false);

  // Initialize on first entry to ROUND_REVEALING
  useEffect(() => {
    if (isRevealing && revealedGuesses && revealedGuesses.length > 0 && !initializedRef.current) {
      initializedRef.current = true;
      // Sort by rank descending (worst first = most dramatic order, best reveal last)
      const sorted = [...revealedGuesses].sort((a, b) => b.rank - a.rank);
      shuffledRef.current = sorted;
      accoladesRef.current = accolades ?? [];
      setStep(0);
    }

    // Reset when leaving ROUND_REVEALING
    if (!isRevealing) {
      initializedRef.current = false;
      shuffledRef.current = [];
      accoladesRef.current = [];
      setStep(-1);
    }
  }, [isRevealing, revealedGuesses, accolades]);

  const totalSteps = shuffledRef.current.length;
  const showingAccolades = step === totalSteps && totalSteps > 0;
  const done = step > totalSteps;

  const currentGuess = step >= 0 && step < totalSteps ? shuffledRef.current[step] : null;

  // All guesses revealed before the current step
  const previousGuesses = step > 0 ? shuffledRef.current.slice(0, step) : [];

  const advance = useCallback(() => {
    setStep(prev => prev + 1);
  }, []);

  return {
    step,
    shuffledGuesses: shuffledRef.current,
    previousGuesses,
    currentGuess,
    showingAccolades,
    done,
    accolades: accoladesRef.current,
    advance,
  };
}
