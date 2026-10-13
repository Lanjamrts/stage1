import React, { useState } from 'react';

const PRESETS = { sm: 32, md: 48, lg: 64 };
const TEXT_SIZE = { sm: 'text-base', md: 'text-lg', lg: 'text-[22px]' };

// Official emblem of the Ministry. If the image cannot load, a "MEF" badge is shown
// instead, so the site never displays a broken image.
export default function Logo({ size = 'md', withText = false, variant = 'dark', className = '' }) {
  const [failed, setFailed] = useState(false);
  const px = typeof size === 'number' ? size : PRESETS[size] || PRESETS.md;
  const textSize = typeof size === 'number' ? 'text-lg' : TEXT_SIZE[size] || TEXT_SIZE.md;
  const textColor = variant === 'light' ? 'text-white' : 'text-[#0B2A4A]';
  const label = "Ministère de l'Économie et des Finances";

  return (
    <div className={`inline-flex items-center gap-3 ${className}`}>
      {failed ? (
        <div
          role="img"
          aria-label={label}
          style={{ width: px, height: px }}
          className="shrink-0 rounded-full bg-[#0B2A4A] text-white ring-2 ring-[#B7791F] flex items-center justify-center text-[11px] font-bold"
        >
          MEF
        </div>
      ) : (
        <img
          src="/emblem-128.png"
          srcSet="/emblem-128.png 1x, /emblem-256.png 2x"
          alt={label}
          width={px}
          height={px}
          decoding="async"
          onError={() => setFailed(true)}
          className="shrink-0 object-contain"
          style={{ width: px, height: px }}
        />
      )}
      {withText && (
        <span className={`font-semibold tracking-tight ${textSize} ${textColor}`}>SIGBD</span>
      )}
    </div>
  );
}