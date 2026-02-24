import type { GuessResult } from '@mmw/shared';
import { getRankColor } from '@mmw/shared';

interface Props {
  secretWord: string;
  guesses: GuessResult[];
  wordBridges: Record<string, string[]>;
}

export default function WordConnections({ secretWord, guesses, wordBridges }: Props) {
  // Deduplicate by word, keep best rank, filter to those with bridge data
  const seen = new Map<string, GuessResult>();
  for (const g of guesses) {
    if (!wordBridges[g.word]) continue;
    const existing = seen.get(g.word);
    if (!existing || g.rank < existing.rank) seen.set(g.word, g);
  }

  // Sort by rank (best first), take top 10
  const entries = Array.from(seen.values())
    .sort((a, b) => a.rank - b.rank)
    .slice(0, 10);

  if (entries.length === 0) return null;

  return (
    <div className="space-y-1.5">
      {entries.map((guess, i) => {
        const color = getRankColor(guess.rank);
        const bridges = wordBridges[guess.word];

        return (
          <div
            key={guess.word}
            className="flex items-start gap-3 px-3 py-2 rounded-lg bg-white/[0.03] animate-slide-up"
            style={{ animationDelay: `${i * 80}ms` }}
          >
            <span
              className="font-mono font-bold text-sm min-w-[3.5rem] text-right shrink-0 mt-0.5"
              style={{ color }}
            >
              {guess.rank === 1 ? '★' : `#${guess.rank.toLocaleString()}`}
            </span>
            <div className="min-w-0">
              <p className="font-mono font-medium text-sm text-white/80 truncate">{guess.word}</p>
              <p className="text-white/30 text-xs truncate">
                via {bridges.join(' · ')}
              </p>
            </div>
          </div>
        );
      })}
    </div>
  );
}
