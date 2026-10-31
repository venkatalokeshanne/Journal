import type { ReactNode } from 'react';

const I = ({ d }: { d: string }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
    <path d={d} />
  </svg>
);

export const ICONS: Record<string, ReactNode> = {
  home: <I d="M3 10.5 12 3l9 7.5V20a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z" />,
  trades: <I d="M4 6h16M4 12h16M4 18h10" />,
  calendar: <I d="M4 5h16v16H4zM4 9h16M8 3v4M16 3v4" />,
  journal: <I d="M5 4h11a3 3 0 0 1 3 3v13H8a3 3 0 0 1-3-3zM5 17a3 3 0 0 1 3-3h11M9 8h6" />,
  reports: <I d="M4 20V10M10 20V4M16 20v-7M22 20H2" />,
  playbook: <I d="M12 3 3 8l9 5 9-5zM3 13l9 5 9-5" />,
  plan: <I d="M9 4h6a1 1 0 0 1 1 1v1H8V5a1 1 0 0 1 1-1zM8 6H6a1 1 0 0 0-1 1v13a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1V7a1 1 0 0 0-1-1h-2M9 12l2 2 4-4M9 17h6" />,
  import: <I d="M12 3v12m0 0-4-4m4 4 4-4M4 17v3h16v-3" />,
  more: <I d="M5 12h.01M12 12h.01M19 12h.01" />,
};

export const MAIN = [
  { href: '/', label: 'Home', icon: 'home' },
  { href: '/plan', label: 'Plan', icon: 'plan' },
  { href: '/trades', label: 'Trades', icon: 'trades' },
  { href: '/calendar', label: 'Calendar', icon: 'calendar' },
];
export const EXTRA = [
  { href: '/journal', label: 'Journal', icon: 'journal' },
  { href: '/reports', label: 'Reports', icon: 'reports' },
  { href: '/playbook', label: 'Playbook', icon: 'playbook' },
  { href: '/import', label: 'Sync & Import', icon: 'import' },
];

export const EXTRA_LINKS = EXTRA;
