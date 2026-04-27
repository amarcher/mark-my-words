interface Props {
  hostConnected: boolean;
}

/**
 * Subtle "Host offline" badge for player screens. When the host's TV display
 * tab is closed, host-only controls (pause, end-game from host UI) won't
 * work; the leader can still take game-level actions. Renders nothing when
 * the host is connected.
 */
export default function HostStatusBadge({ hostConnected }: Props) {
  if (hostConnected) return null;
  return (
    <div className="text-xs text-amber-300/80 border border-amber-400/20 bg-amber-500/5 rounded-full px-3 py-1 inline-flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
      Host offline
    </div>
  );
}
