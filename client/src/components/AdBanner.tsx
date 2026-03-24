import { useEffect, useRef } from 'react';

// Replace with your actual AdSense publisher ID
const AD_CLIENT = import.meta.env.VITE_ADSENSE_CLIENT || 'ca-pub-0897728874858477';

interface AdBannerProps {
  /** AdSense ad slot ID */
  slot: string;
  /** Ad format — defaults to 'auto' (responsive) */
  format?: 'auto' | 'horizontal' | 'vertical' | 'rectangle';
  /** CSS class for the container div */
  className?: string;
}

declare global {
  interface Window {
    adsbygoogle: unknown[];
  }
}

export default function AdBanner({ slot, format = 'auto', className = '' }: AdBannerProps) {
  const adRef = useRef<HTMLModElement>(null);
  const pushed = useRef(false);

  useEffect(() => {
    if (pushed.current) return;
    try {
      (window.adsbygoogle = window.adsbygoogle || []).push({});
      pushed.current = true;
    } catch {
      // AdSense not loaded (blocked, dev mode, etc.) — fail silently
    }
  }, []);

  return (
    <div className={`ad-container ${className}`}>
      <ins
        ref={adRef}
        className="adsbygoogle"
        style={{ display: 'block' }}
        data-ad-client={AD_CLIENT}
        data-ad-slot={slot}
        data-ad-format={format}
        data-full-width-responsive="true"
      />
    </div>
  );
}
