const base = {
  fill: 'none',
  stroke: 'currentColor',
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
  'aria-hidden': true,
} as const;

export const ArrowRight = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </svg>
);

export const Check = ({ size = 22, width = 2.5 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={width} {...base}>
    <path d="M5 12l5 5 9-10" />
  </svg>
);

export const Equal = ({ size = 34 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.5} {...base}>
    <path d="M5 9h14M5 15h14" />
  </svg>
);

export const Copy = ({ size = 18 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <rect x="9" y="9" width="11" height="11" rx="2" />
    <path d="M5 15V5a2 2 0 0 1 2-2h10" />
  </svg>
);

export const Plus = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.4} {...base}>
    <path d="M12 5v14M5 12h14" />
  </svg>
);

export const Shuffle = ({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2} {...base}>
    <path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
  </svg>
);

export const Stop =({ size = 16 }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" strokeWidth={2.2} {...base}>
    <rect x="6" y="6" width="12" height="12" rx="2" />
  </svg>
);
