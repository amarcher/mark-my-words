import type { GuessResult } from '@mmw/shared';
import { getRankColor, RANK_ZONES } from '@mmw/shared';

interface WordCloudProps {
  guesses: GuessResult[];
  maxWords?: number;
}

function hashWord(word: string): number {
  let hash = 0;
  for (let i = 0; i < word.length; i++) {
    hash = ((hash << 5) - hash + word.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

function deterministicShuffle(guesses: GuessResult[]): GuessResult[] {
  const arr = [...guesses];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = hashWord(arr[i].word) % (i + 1);
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

const MIN_SIZE = 1.25; // rem
const MAX_SIZE = 4.5;  // rem
const LOG_MAX = Math.log10(50000);

function getFontSize(rank: number): number {
  const t = Math.max(0, Math.min(1, 1 - Math.log10(Math.max(rank, 1)) / LOG_MAX));
  return MIN_SIZE + (MAX_SIZE - MIN_SIZE) * t;
}

export default function WordCloud({ guesses, maxWords = 30 }: WordCloudProps) {
  if (guesses.length === 0) {
    return (
      <div className="flex items-center justify-center h-full text-white/20 text-sm">
        Words will appear after round 1
      </div>
    );
  }

  const top = guesses.slice(0, maxWords);
  const shuffled = deterministicShuffle(top);

  return (
    <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 p-4">
      {shuffled.map((guess) => {
        const isWin = guess.rank <= 1;
        const color = isWin ? RANK_ZONES.WIN.color : getRankColor(guess.rank);
        const fontSize = getFontSize(guess.rank);

        return (
          <span
            key={`${guess.word}-${guess.playerId}`}
            className={`font-bold leading-tight transition-none select-none ${
              isWin ? 'drop-shadow-[0_0_8px_rgba(251,191,36,0.5)]' : ''
            }`}
            style={{
              fontSize: `${fontSize}rem`,
              color,
              opacity: 0.7 + 0.3 * ((fontSize - MIN_SIZE) / (MAX_SIZE - MIN_SIZE)),
            }}
          >
            {guess.word}
          </span>
        );
      })}
    </div>
  );
}
