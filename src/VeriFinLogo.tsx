import React from 'react';

interface VeriFinLogoProps {
  className?: string;
  size?: number;
}

export function VeriFinLogo({ className = "w-8 h-8", size }: VeriFinLogoProps) {
  const sizeStyle = size ? { width: size, height: size } : undefined;

  return (
    <svg
      className={className}
      style={sizeStyle}
      viewBox="0 0 100 120"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      aria-label="VeriFin Pro Logo"
    >
      <defs>
        {/* Navy Blue Gradient for Left Shield */}
        <linearGradient id="vf-shield-navy" x1="15" y1="12" x2="50" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="40%" stopColor="#1D4ED8" />
          <stop offset="100%" stopColor="#0F172A" />
        </linearGradient>

        {/* Cyan / Teal Gradient for Right Shield & Checkmark */}
        <linearGradient id="vf-shield-cyan" x1="50" y1="12" x2="85" y2="108" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#22D3EE" />
          <stop offset="50%" stopColor="#06B6D4" />
          <stop offset="100%" stopColor="#0891B2" />
        </linearGradient>

        {/* Golden Gradient for Upward Growth Arrow */}
        <linearGradient id="vf-arrow-gold" x1="42" y1="78" x2="88" y2="28" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE68A" />
          <stop offset="35%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>

        {/* Subtle drop shadow for depth */}
        <filter id="vf-glow" x="-10%" y="-10%" width="120%" height="120%" filterUnits="userSpaceOnUse">
          <feDropShadow dx="0" dy="2" stdDeviation="3" floodColor="#06B6D4" floodOpacity="0.3" />
        </filter>
      </defs>

      {/* ==================================================== */}
      {/* 1. OUTER SHIELD: LEFT HALF (NAVY BLUE)               */}
      {/* ==================================================== */}
      <path
        d="M50 14 L24 23 C23 23 23 24 23 25 V45 C23 46 24 47 25 47 H31 C32 47 33 46 33 45 V32 L50 24 V14 Z"
        fill="url(#vf-shield-navy)"
      />
      <path
        d="M23 52 V60 C23 78 34 94 50 106 V96 C39 85 32 72 32 60 V53 C32 52 31 52 30 52 H24 C23 52 23 52 23 52 Z"
        fill="url(#vf-shield-navy)"
      />

      {/* ==================================================== */}
      {/* 2. OUTER SHIELD: RIGHT HALF (CYAN / TURQUOISE)       */}
      {/* ==================================================== */}
      <path
        d="M50 14 L76 23 C77 23 77 24 77 25 V45 C77 46 76 47 75 47 H69 C68 47 67 46 67 45 V32 L50 24 V14 Z"
        fill="url(#vf-shield-cyan)"
      />
      <path
        d="M77 52 V60 C77 78 66 94 50 106 V96 C61 85 68 72 68 60 V53 C68 52 69 52 70 52 H76 C77 52 77 52 77 52 Z"
        fill="url(#vf-shield-cyan)"
      />

      {/* ==================================================== */}
      {/* 3. INNER SHIELD CONTOUR                              */}
      {/* ==================================================== */}
      <path
        d="M50 27 L33 34 V58 C33 71 40 83 50 90 C60 83 67 71 67 58 V34 L50 27 Z"
        stroke="url(#vf-shield-cyan)"
        strokeWidth="3.2"
        strokeLinejoin="round"
        fill="none"
        opacity="0.85"
      />

      {/* ==================================================== */}
      {/* 4. FINANCIAL BAR CHART (3 BARS RISING)               */}
      {/* ==================================================== */}
      <rect x="53" y="66" width="5.5" height="19" rx="1.5" fill="#06B6D4" />
      <rect x="60.5" y="56" width="5.5" height="29" rx="1.5" fill="#0891B2" />
      <rect x="68" y="46" width="5.5" height="39" rx="1.5" fill="#22D3EE" />

      {/* ==================================================== */}
      {/* 5. VERIFICATION CHECKMARK (CYAN / TEAL)              */}
      {/* ==================================================== */}
      <path
        d="M39 52 L47.5 62 L63 41"
        stroke="#22D3EE"
        strokeWidth="5.5"
        strokeLinecap="round"
        strokeLinejoin="round"
        filter="url(#vf-glow)"
      />

      {/* ==================================================== */}
      {/* 6. GOLDEN UPWARD GROWTH ARROW (SWOOPING UP-RIGHT)    */}
      {/* ==================================================== */}
      {/* Curved Growth Trajectory */}
      <path
        d="M44 76 C52 73 59 66 68 55 L79 40"
        stroke="url(#vf-arrow-gold)"
        strokeWidth="4"
        strokeLinecap="round"
      />
      {/* Arrowhead */}
      <polygon
        points="78,31 87,40 73,43"
        fill="url(#vf-arrow-gold)"
      />
    </svg>
  );
}

export default VeriFinLogo;
