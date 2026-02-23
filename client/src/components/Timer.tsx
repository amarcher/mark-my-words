import { useState, useEffect } from 'react';

interface TimerProps {
  timeRemaining: number;
  totalTime: number;
  size?: 'sm' | 'lg';
}

export default function Timer({ timeRemaining, totalTime, size = 'lg' }: TimerProps) {
  const percentage = (timeRemaining / totalTime) * 100;
  const isUrgent = timeRemaining <= 10;
  const isLarge = size === 'lg';

  // Defer transition until after first paint so the bar doesn't animate rightward on mount.
  // Double-rAF ensures the browser has actually painted the initial width before enabling transition.
  const [enableTransition, setEnableTransition] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => {
      requestAnimationFrame(() => setEnableTransition(true));
    });
    return () => cancelAnimationFrame(id);
  }, []);

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
          className={`h-full rounded-full ${
            enableTransition ? 'transition-all duration-1000 ease-linear' : ''
          } ${isUrgent ? 'bg-rank-red' : 'bg-accent'}`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  );
}
