import React from 'react';

interface HapvidaLogoProps {
  className?: string;
  showText?: boolean;
  textSize?: 'sm' | 'md' | 'lg' | 'xl';
  animated?: boolean;
}

export default function HapvidaLogo({
  className = '',
  showText = true,
  textSize = 'md',
  animated = false,
}: HapvidaLogoProps) {
  const textSizes = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-2xl',
    xl: 'text-3xl',
  };

  const flowerSize = {
    sm: 'w-6 h-6',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  return (
    <div className={`flex items-center gap-2 select-none ${className}`}>
      {/* 6-Petal Flower Symbol */}
      <svg
        className={`${flowerSize[textSize]} shrink-0 ${animated ? 'animate-pulse' : ''}`}
        viewBox="0 0 100 100"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        {/* Top vertical - Red */}
        <path
          d="M50 47 C44 37, 43 24, 50 10 C57 24, 56 37, 50 47 Z"
          fill="#ED1C24"
          transform="rotate(0, 50, 50)"
        />
        {/* Top-right - Orange */}
        <path
          d="M50 47 C44 37, 43 24, 50 10 C57 24, 56 37, 50 47 Z"
          fill="#FA541C"
          transform="rotate(60, 50, 50)"
        />
        {/* Bottom-right - Amber-Orange */}
        <path
          d="M50 47 C44 37, 43 24, 50 10 C57 24, 56 37, 50 47 Z"
          fill="#FF9E00"
          transform="rotate(120, 50, 50)"
        />
        {/* Bottom vertical - Yellow */}
        <path
          d="M50 47 C44 37, 43 24, 50 10 C57 24, 56 37, 50 47 Z"
          fill="#FFD400"
          transform="rotate(180, 50, 50)"
        />
        {/* Bottom-left - Amber-Yellow */}
        <path
          d="M50 47 C44 37, 43 24, 50 10 C57 24, 56 37, 50 47 Z"
          fill="#FFC000"
          transform="rotate(240, 50, 50)"
        />
        {/* Top-left - Orange-Red */}
        <path
          d="M50 47 C44 37, 43 24, 50 10 C57 24, 56 37, 50 47 Z"
          fill="#FA541C"
          transform="rotate(300, 50, 50)"
        />
      </svg>

      {/* Styled wordmark next to symbol */}
      {showText && (
        <span
          className={`font-black italic tracking-tighter text-[#1035B4] [font-family:'Inter',_sans-serif] ${textSizes[textSize]}`}
        >
          Hapvida
        </span>
      )}
    </div>
  );
}
