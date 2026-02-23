import type { Accolade, Player } from '@mmw/shared';

interface AccoladeCardProps {
  accolade: Accolade;
  index: number;
  players?: Player[];
}

export default function AccoladeCard({ accolade, index, players }: AccoladeCardProps) {
  const playerColor = players?.find(p => p.id === accolade.playerId)?.color;
  const tilt = index % 2 === 0 ? -2 : 3;
  const isPositive = accolade.isPositive;

  return (
    <div
      className="animate-shake opacity-0"
      style={{
        animationDelay: `${index * 300}ms`,
        animationFillMode: 'forwards',
      }}
    >
      <div
        className="rounded-full px-8 py-5 text-center"
        style={{
          transform: `rotate(${tilt}deg)`,
          boxShadow: isPositive
            ? '0 0 30px rgba(34, 197, 94, 0.3), 0 0 60px rgba(34, 197, 94, 0.1)'
            : '0 0 30px rgba(239, 68, 68, 0.3), 0 0 60px rgba(239, 68, 68, 0.1)',
        }}
      >
        <p className="text-sm text-white/50 mb-1">
          {accolade.icon} {accolade.title}
        </p>
        <p
          className="text-3xl font-bold"
          style={{ color: playerColor || 'rgba(255,255,255,0.7)' }}
        >
          {accolade.playerName}
        </p>
      </div>
    </div>
  );
}
