/** Hand-drawn inline icons — no icon package, no network request, no bundle bloat. */
interface IconProps {
  size?: number;
}

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
});

export const CardIcon = ({ size = 44 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <rect x="2.5" y="5.5" width="19" height="13" rx="2.5" />
    <path d="M6 10.5h4M6 14h7" />
    <circle cx="16.5" cy="11" r="1.8" />
  </svg>
);

export const CameraIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M3 8.5A1.5 1.5 0 0 1 4.5 7h2L8 5h8l1.5 2h2A1.5 1.5 0 0 1 21 8.5v9A1.5 1.5 0 0 1 19.5 19h-15A1.5 1.5 0 0 1 3 17.5z" />
    <circle cx="12" cy="12.5" r="3.5" />
  </svg>
);

export const UploadIcon = ({ size = 20 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M12 15.5V4m0 0L8 8m4-4 4 4" />
    <path d="M4 15v3.5A1.5 1.5 0 0 0 5.5 20h13a1.5 1.5 0 0 0 1.5-1.5V15" />
  </svg>
);

export const WhatsAppIcon = ({ size = 21 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
    <path d="M12.04 2c-5.5 0-9.97 4.47-9.97 9.97 0 1.76.46 3.48 1.34 5L2 22l5.16-1.35a9.94 9.94 0 0 0 4.88 1.25h.01c5.5 0 9.97-4.47 9.97-9.97 0-2.66-1.04-5.17-2.92-7.05A9.9 9.9 0 0 0 12.04 2m0 1.83c2.18 0 4.23.85 5.77 2.39a8.1 8.1 0 0 1 2.39 5.76c0 4.5-3.66 8.15-8.16 8.15a8.2 8.2 0 0 1-4.16-1.14l-.3-.18-3.09.81.82-3.01-.2-.31a8.1 8.1 0 0 1-1.27-4.33c0-4.5 3.66-8.14 8.2-8.14m-3.6 4.06c-.17 0-.44.06-.67.31s-.88.86-.88 2.1.9 2.43 1.03 2.6c.13.16 1.77 2.7 4.29 3.79.6.26 1.07.41 1.43.53.6.19 1.15.16 1.58.1.48-.07 1.48-.6 1.69-1.19s.21-1.08.15-1.19c-.06-.1-.23-.16-.48-.29s-1.48-.73-1.71-.81c-.23-.09-.4-.13-.56.12s-.64.81-.79.98c-.14.16-.29.19-.54.06s-1.06-.39-2.01-1.24c-.74-.66-1.25-1.48-1.39-1.73s-.02-.38.11-.51c.11-.11.25-.29.37-.43s.16-.25.25-.41c.08-.17.04-.31-.02-.43s-.56-1.35-.77-1.85c-.2-.48-.4-.42-.55-.42z" />
  </svg>
);

export const CheckIcon = ({ size = 34 }: IconProps) => (
  <svg {...base(size)} strokeWidth={2.2} aria-hidden="true">
    <path d="M4.5 12.5 9.5 17.5 19.5 7" />
  </svg>
);

export const TicksIcon = ({ size = 14 }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 18 12" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
    <path d="M1 6.5 4 9.5 9.5 2.5" />
    <path d="M7.5 6.5 10.5 9.5 16 2.5" />
  </svg>
);

export const AlertIcon = ({ size = 17 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="12" cy="12" r="9.2" />
    <path d="M12 7.5v5.2M12 16.2v.2" />
  </svg>
);

export const GearIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <circle cx="12" cy="12" r="3.2" />
    <path d="M19.4 14.5a1.6 1.6 0 0 0 .32 1.77l.06.06a1.94 1.94 0 1 1-2.75 2.75l-.06-.06a1.6 1.6 0 0 0-1.77-.32 1.6 1.6 0 0 0-.97 1.47V20a1.94 1.94 0 1 1-3.88 0v-.1a1.6 1.6 0 0 0-1.05-1.46 1.6 1.6 0 0 0-1.77.32l-.06.06a1.94 1.94 0 1 1-2.75-2.75l.06-.06a1.6 1.6 0 0 0 .32-1.77 1.6 1.6 0 0 0-1.47-.97H4a1.94 1.94 0 1 1 0-3.88h.1a1.6 1.6 0 0 0 1.46-1.05 1.6 1.6 0 0 0-.32-1.77l-.06-.06a1.94 1.94 0 1 1 2.75-2.75l.06.06a1.6 1.6 0 0 0 1.77.32H9.8a1.6 1.6 0 0 0 .97-1.47V4a1.94 1.94 0 1 1 3.88 0v.1a1.6 1.6 0 0 0 .97 1.47 1.6 1.6 0 0 0 1.77-.32l.06-.06a1.94 1.94 0 1 1 2.75 2.75l-.06.06a1.6 1.6 0 0 0-.32 1.77v.08a1.6 1.6 0 0 0 1.47.97H20a1.94 1.94 0 1 1 0 3.88h-.1a1.6 1.6 0 0 0-1.47.97z" />
  </svg>
);

export const CloseIcon = ({ size = 16 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M6 6l12 12M18 6L6 18" />
  </svg>
);

export const BackIcon = ({ size = 18 }: IconProps) => (
  <svg {...base(size)} aria-hidden="true">
    <path d="M15 5l-7 7 7 7" />
  </svg>
);
