interface RoomClosedModalProps {
  message: string;
  onDismiss: () => void;
}

export default function RoomClosedModal({ message, onDismiss }: RoomClosedModalProps) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70">
      <div className="card max-w-sm w-full mx-4 text-center">
        <p className="text-xl font-bold mb-2">Room Closed</p>
        <p className="text-white/60 mb-6">{message}</p>
        <button onClick={onDismiss} className="btn-primary w-full">
          OK
        </button>
      </div>
    </div>
  );
}
