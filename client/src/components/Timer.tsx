interface TimerProps {
  timeRemaining: number;
  totalTime: number;
  size?: 'sm' | 'lg';
}

export default function Timer({ timeRemaining, totalTime, size = 'lg' }: TimerProps) {
  const percentage = (timeRemaining / totalTime) * 100;
  const isUrgent = timeRemaining <= 10;
  const isLarge = size === 'lg';

  return (
    <div className="text-center">
      <div
        className={`font-mono font-bold ${isLarge ? 'text-5xl' : 'text-2xl'} ${
          isUrgent ? 'text-rank-red animate-pulse' : 'text-white/80'
        }`}
      >
        {timeRemaining}s
      </div>
      <div className={`${isLarge ? 'w-48' : 'w-32'} h-1.5 bg-white/10 rounded-full mx-auto mt-2 overflow-hidden`}>
        <div
          className={`h-full rounded-full transition-all duration-1000 ease-linear ${
            isUrgent ? 'bg-rank-red' : 'bg-accent'
          }`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
