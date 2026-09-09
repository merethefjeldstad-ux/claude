// Enkle strek-SVG-ikoner (ingen emoji, ingen ikonbibliotek), hentet 1:1 fra
// skissen (claude.ai-artifakt "Middagsplan skisse").

export function MenuIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke={color} strokeWidth={1.6}>
      <rect x="3" y="3" width="14" height="14" rx="2" />
      <line x1="6" y1="7.5" x2="14" y2="7.5" />
      <line x1="6" y1="10.5" x2="14" y2="10.5" />
      <line x1="6" y1="13.5" x2="11" y2="13.5" />
    </svg>
  );
}

export function ChecklistIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" width={18} height={18} fill="none" stroke={color} strokeWidth={1.6}>
      <rect x="4" y="3" width="12" height="14" rx="2" />
      <path d="M7 9.5l2 2 4-4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

export function TagIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" width={11} height={11} fill="none" stroke={color} strokeWidth={1.6}>
      <path d="M3 10.5V4.5a1 1 0 0 1 1-1h6l7 7-7 7-7-7z" strokeLinejoin="round" />
      <circle cx="7" cy="7" r="1" fill={color} stroke="none" />
    </svg>
  );
}

export function ClockIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" width={11} height={11} fill="none" stroke={color} strokeWidth={1.6}>
      <circle cx="10" cy="10" r="7.5" />
      <path d="M10 6v4l3 2" strokeLinecap="round" />
    </svg>
  );
}

export function PlusIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" width={16} height={16} fill="none" stroke={color} strokeWidth={1.8}>
      <line x1="10" y1="4" x2="10" y2="16" strokeLinecap="round" />
      <line x1="4" y1="10" x2="16" y2="10" strokeLinecap="round" />
    </svg>
  );
}

export function CheckCircleIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" width={20} height={20} fill={color} stroke="none">
      <circle cx="10" cy="10" r="9" />
      <path
        d="M6.5 10.2l2.3 2.3 4.7-4.7"
        stroke="white"
        strokeWidth={1.6}
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

export function CircleIcon({ color }: { color: string }) {
  return (
    <svg viewBox="0 0 20 20" width={20} height={20} fill="none" stroke={color} strokeWidth={1.6}>
      <circle cx="10" cy="10" r="9" />
    </svg>
  );
}
