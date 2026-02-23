interface RoomCodeProps {
  code: string;
  size?: 'sm' | 'lg';
}

export default function RoomCode({ code, size = 'lg' }: RoomCodeProps) {
  const isLarge = size === 'lg';

  return (
    <div className="text-center">
      <p className={`text-white/50 ${isLarge ? 'text-sm' : 'text-xs'} uppercase tracking-widest mb-1`}>
        Room Code
      </p>
      <div className={`font-mono font-bold tracking-[0.3em] ${isLarge ? 'text-6xl' : 'text-2xl'} text-accent`}>
        {code}
      </div>
      {isLarge && (
        <p className="text-white/30 text-sm mt-2">
          Join at <span className="text-white/50">{window.location.origin}/play</span>
        </p>
      )}
    </div>
  );
}
