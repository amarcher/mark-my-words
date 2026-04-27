interface SessionConflictModalProps {
  roomCode: string;
  onTakeOver: () => void;
  onCancel: () => void;
}

export default function SessionConflictModal({ roomCode, onTakeOver, onCancel }: SessionConflictModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="card max-w-sm w-full mx-4 text-center">
        <p className="text-xl font-bold mb-2">Already open elsewhere</p>
        <p className="text-white/60 mb-6">
          Room <span className="font-mono font-bold text-white">{roomCode}</span> is open in another tab or window.
          Continue here to take over — the other tab will be disconnected.
        </p>
        <div className="space-y-2">
          <button onClick={onTakeOver} className="btn-primary w-full">
            Use here
          </button>
          <button onClick={onCancel} className="btn-secondary w-full">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
