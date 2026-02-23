import type { Accolade } from '@mmw/shared';

interface AccoladeCardProps {
  accolade: Accolade;
  index: number;
}

export default function AccoladeCard({ accolade, index }: AccoladeCardProps) {
  return (
    <div
      className={`card max-w-md mx-auto animate-bounce-in ${
        accolade.isPositive ? 'border-rank-green/20' : 'border-rank-red/20'
      }`}
      style={{ animationDelay: `${index * 300}ms` }}
    >
      <div className="text-center">
        <span className="text-4xl block mb-2">{accolade.icon}</span>
        <h3
          className={`text-xl font-bold mb-2 ${
            accolade.isPositive ? 'text-rank-green' : 'text-rank-red'
          }`}
        >
          {accolade.title}
        </h3>
        <p className="text-white/60 font-medium">{accolade.playerName}</p>
        <p className="text-white/40 text-sm mt-2 italic">{accolade.description}</p>
      </div>
    </div>
  );
}
