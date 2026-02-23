import { getRankColor, getRankZone } from '@mmw/shared';

interface RankBadgeProps {
  rank: number;
  size?: 'sm' | 'md' | 'lg';
}

export default function RankBadge({ rank, size = 'md' }: RankBadgeProps) {
  const color = getRankColor(rank);
  const zone = getRankZone(rank);

  const sizeClasses = {
    sm: 'text-sm px-2 py-0.5 min-w-[3rem]',
    md: 'text-lg px-3 py-1 min-w-[4rem]',
    lg: 'text-3xl px-4 py-2 min-w-[5rem]',
  };

  return (
    <span
      className={`inline-flex items-center justify-center font-mono font-bold rounded-lg ${sizeClasses[size]}`}
      style={{
        backgroundColor: `${color}20`,
        color: color,
        border: `1px solid ${color}40`,
      }}
    >
      {rank === 1 ? '★' : `#${rank.toLocaleString()}`}
    </span>
  );
}
