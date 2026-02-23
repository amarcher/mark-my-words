interface Props {
  paused: boolean;
  onPause: () => void;
  onResume: () => void;
  onLeave: () => void;
}

export default function PauseOverlay({ paused, onPause, onResume, onLeave }: Props) {
  return (
    <>
      {/* Floating controls */}
      <div className="fixed top-4 right-4 z-50 flex gap-2">
        <button
          onClick={paused ? onResume : onPause}
          className="bg-bg-card/80 backdrop-blur border border-white/10 rounded-lg px-4 py-2 text-sm hover:bg-bg-card transition-colors"
        >
          {paused ? 'Resume' : 'Pause'}
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
            <h2 className="text-6xl font-bold text-white/80 mb-4">PAUSED</h2>
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
