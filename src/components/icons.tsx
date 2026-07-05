interface IconProps {
  className?: string;
}

const ICON_PROPS = {
  width: 14,
  height: 14,
  viewBox: "0 0 16 16",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.5,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function FetchIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 2v3.2h-3.2" />
    </svg>
  );
}

export function PullIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M8 2v7M5 6l3 3 3-3M3 12h10" />
    </svg>
  );
}

export function PushIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M8 12V5M5 8l3-3 3 3M3 3h10" />
    </svg>
  );
}

export function StashIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="2" y="3" width="12" height="3" rx="0.5" />
      <path d="M3 6.5v6.5a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6.5M6.5 9h3" />
    </svg>
  );
}

export function TerminalIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <rect x="1.5" y="2.5" width="13" height="11" rx="1" />
      <path d="M4 6l2.5 2-2.5 2M8 10h4" />
    </svg>
  );
}

export function HamburgerIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M2 4.5h12M2 8h12M2 11.5h12" />
    </svg>
  );
}
