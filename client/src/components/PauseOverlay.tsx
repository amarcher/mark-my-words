interface Props {
  paused: boolean;
  afkCountdown: number | null;
  onPause: () => void;
  onResume: () => void;
  onLeave: () => void;
  onEndGame: () => void;
  extraControls?: React.ReactNode;
}

export default function PauseOverlay({ paused, afkCountdown, onPause, onResume, onLeave, onEndGame, extraControls }: Props) {
  return (
    <>
      {/* Floating controls */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        {extraControls}
        <button
          onClick={paused ? onResume : onPause}
          className="bg-bg-card/80 backdrop-blur border border-white/10 rounded-lg px-4 py-2 text-sm hover:bg-bg-card transition-colors"
        >
          {paused ? 'Resume' : 'Pause'}
        </button>
        <button
          onClick={onEndGame}
          className="bg-bg-card/80 backdrop-blur border border-amber-500/20 rounded-lg px-4 py-2 text-sm text-amber-400 hover:bg-amber-500/10 transition-colors"
        >
          End Game
        </button>
        <button
          onClick={onLeave}
          className="bg-bg-card/80 backdrop-blur border border-rank-red/20 rounded-lg px-4 py-2 text-sm text-rank-red hover:bg-rank-red/10 transition-colors"
        >
          Exit
        </button>
      </div>

      {/* Paused overlay */}
      {paused && (
        <div className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm flex items-center justify-center">
          <div className="text-center">
            {afkCountdown !== null ? (
              <>
                <p className="text-white/50 text-lg uppercase tracking-widest mb-2">No guesses received</p>
                <h2 className="text-7xl font-bold text-amber-400 font-mono mb-2">{afkCountdown}</h2>
                <p className="text-white/40 text-sm mb-6">Room closing in {afkCountdown}s</p>
              </>
            ) : (
              <h2 className="text-6xl font-bold text-white/80 mb-4">PAUSED</h2>
            )}
            <button
              onClick={onResume}
              className="btn-primary text-lg px-12"
            >
              Resume
            </button>
          </div>
        </div>
      )}
    </>
  );
}
