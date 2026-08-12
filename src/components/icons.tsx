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
export function EditIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M11 2l2.5 2.5M3 12H2v-1l7.5-7.5a1 1 0 0 1 1.415 0l2.07 2.07a1 1 0 0 1 0 1.415L5.5 14H3" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  );
}

export function MinusIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M3 8h10" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M2.5 4.5h11M6 4.5V3a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v1.5M6.5 7.5v4M9.5 7.5v4M3.5 4.5l.6 8.4a1 1 0 0 0 1 .9h5.8a1 1 0 0 0 1-.9l.6-8.4" />
    </svg>
  );
}

export function EyeIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  );
}

export function EyeOffIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M1.5 8S4 3.5 8 3.5 14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8Z" />
      <circle cx="8" cy="8" r="2" />
      <path d="M2.5 13.5l11-11" />
    </svg>
  );
}

/** Crosshair — "locate this in the graph". */
export function LocateIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v2.3M8 12.2v2.3M1.5 8h2.3M12.2 8h2.3" />
    </svg>
  );
}

/** Two branch lanes with an arrow crossing into the right one — "switch to
 * this ref". */
export function CheckoutIcon({ className }: IconProps) {
  return (
    <svg {...ICON_PROPS} className={className}>
      <path d="M3 2.5v11M11.5 2.5v4M7 8l4.5 0M8.5 5.5L11.5 8l-3 2.5" />
    </svg>
  );
}