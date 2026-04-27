import { useEffect, useState } from 'react';

/**
 * Tracks document visibility. Returns true when the tab is foregrounded.
 * Used to suspend AudioContexts, drop queued audio, and pause idle timers
 * that would otherwise continue running on a backgrounded tab.
 */
export function usePageVisibility(): boolean {
  const [isVisible, setIsVisible] = useState<boolean>(
    typeof document !== 'undefined' ? !document.hidden : true,
  );

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const onChange = () => setIsVisible(!document.hidden);
    document.addEventListener('visibilitychange', onChange);
    return () => document.removeEventListener('visibilitychange', onChange);
  }, []);

  return isVisible;
}
