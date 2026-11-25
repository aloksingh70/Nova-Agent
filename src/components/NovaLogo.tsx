import React from 'react';

interface NovaLogoProps {
  compact?: boolean;
}

export const NovaLogo: React.FC<NovaLogoProps> = ({ compact = false }) => {
  return (
    <span className="inline-flex items-center gap-2 sm:gap-2.5 whitespace-nowrap shrink-0 select-none">
      <svg
        width="27"
        height="27"
        viewBox="0 0 28 28"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
        className="shrink-0"
      >
        <defs>
          <linearGradient id="novaMarkGrad" x1="2" y1="2" x2="26" y2="26" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stopColor="#ffb347" />
            <stop offset="38%" stopColor="#ff8a3d" />
            <stop offset="68%" stopColor="#ff5a5f" />
            <stop offset="100%" stopColor="#ff3d8b" />
          </linearGradient>
        </defs>
        {/* Rounded-square C-shape outline stroked with brand gradient */}
        <path
          d="M23.5 9.2V7.5C23.5 5.29 21.71 3.5 19.5 3.5H8.5C6.29 3.5 4.5 5.29 4.5 7.5V20.5C4.5 22.71 6.29 24.5 8.5 24.5H19.5C21.71 24.5 23.5 22.71 23.5 20.5V18.8"
          stroke="url(#novaMarkGrad)"
          strokeWidth="2.4"
          strokeLinecap="round"
        />
        {/* Two dark robot eyes */}
        <circle cx="11.5" cy="14" r="1.9" fill="#141414" />
        <circle cx="17.3" cy="13.6" r="1.9" fill="#141414" />
      </svg>
      {!compact && (
        <span className="text-[14px] sm:text-[18px] font-medium tracking-[-0.02em] text-[#141414] leading-none">
          NOVA AGENT
        </span>
      )}
    </span>
  );
};
