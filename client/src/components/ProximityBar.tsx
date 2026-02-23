import { getRankColor } from '@mmw/shared';

interface ProximityBarProps {
  rank: number;
  maxRank?: number;
  showLabel?: boolean;
  animate?: boolean;
}

export default function ProximityBar({ rank, maxRank = 50000, showLabel = true, animate = true }: ProximityBarProps) {
  // Log scale to make the bar more meaningful
  const logRank = Math.log10(Math.max(rank, 1));
  const logMax = Math.log10(maxRank);
  const percentage = Math.max(0, Math.min(100, (1 - logRank / logMax) * 100));
  const color = getRankColor(rank);

  return (
    <div className="w-full">
      <div className="h-3 bg-white/5 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full ${animate ? 'transition-all duration-1000 ease-out' : ''}`}
          style={{
            width: `${percentage}%`,
            backgroundColor: color,
            boxShadow: `0 0 10px ${color}60`,
          }}
        />
      </div>
      {showLabel && (
        <div className="flex justify-between mt-1 text-xs text-white/30">
          <span>Cold</span>
          <span style={{ color }} className="font-mono font-bold">
            #{rank.toLocaleString()}
          </span>
          <span>Hot</span>
        </div>
      )}
    </div>
  );
}
