// Small line icons for navigation (24px grid, drawn with currentColor). Decorative only:
// every icon sits next to a text label, so they are aria-hidden.
import type { ReactNode } from 'react';

const PATHS: Record<string, ReactNode> = {
  home: <path d="M4 11.5 12 5l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-7.5Z" />,
  tasks: (
    <>
      <path d="m4.5 7 1.8 1.8L9.5 5.5" />
      <path d="m4.5 15 1.8 1.8 3.2-3.3" />
      <path d="M12.5 7.5H20M12.5 15.5H20" />
    </>
  ),
  chat: <path d="M5 5h14a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H10l-4 3.5V16H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1Z" />,
  boards: (
    <>
      <rect x="4" y="5" width="4.5" height="14" rx="1" />
      <rect x="10.25" y="5" width="4.5" height="9" rx="1" />
      <rect x="16.5" y="5" width="3.5" height="11" rx="1" />
    </>
  ),
  inbox: (
    <>
      <path d="M4 13h4l2 3h4l2-3h4" />
      <path d="M5.5 6.5 4 13v5a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-5l-1.5-6.5A2 2 0 0 0 16.6 5H7.4a2 2 0 0 0-1.9 1.5Z" />
    </>
  ),
  clients: (
    <>
      <path d="M5 20V7a1 1 0 0 1 1-1h7a1 1 0 0 1 1 1v13" />
      <path d="M14 10h4a1 1 0 0 1 1 1v9M3.5 20h17M8 9.5h3M8 13h3M8 16.5h3" />
    </>
  ),
  billing: (
    <>
      <rect x="3.5" y="6" width="17" height="12" rx="1.5" />
      <path d="M3.5 10h17M7 14.5h3" />
    </>
  ),
  planner: (
    <>
      <rect x="4" y="5.5" width="16" height="14" rx="1.5" />
      <path d="M4 10h16M8.5 3.5v3.5M15.5 3.5v3.5" />
    </>
  ),
  capacity: <path d="M4.5 19.5V13M9.5 19.5V9M14.5 19.5v-4M19.5 19.5V5.5" />,
  leave: (
    <>
      <path d="M12 4v1.5M12 18.5V20M4 12h1.5M18.5 12H20M6.3 6.3l1.1 1.1M16.6 16.6l1.1 1.1M6.3 17.7l1.1-1.1M16.6 7.4l1.1-1.1" />
      <circle cx="12" cy="12" r="3.5" />
    </>
  ),
  search: (
    <>
      <circle cx="11" cy="11" r="6" />
      <path d="m15.5 15.5 4 4" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.6-3 2.8-4.5 5.5-4.5s4.9 1.5 5.5 4.5M15.5 6.2a3 3 0 0 1 0 5.6M17.5 14.8c1.6.6 2.6 2 3 4.2" />
    </>
  ),
  teams: (
    <>
      <circle cx="12" cy="7.5" r="2.5" />
      <circle cx="5.5" cy="16" r="2.2" />
      <circle cx="18.5" cy="16" r="2.2" />
      <path d="M12 10v3M12 13l-5 1.5M12 13l5 1.5" />
    </>
  ),
  pipelines: <path d="M4 7h6l2 5h8M4 17h6l2-5" />,
  packages: (
    <>
      <path d="m12 3.5 8 4v9l-8 4-8-4v-9l8-4Z" />
      <path d="m4 7.5 8 4 8-4M12 11.5v9" />
    </>
  ),
  mail: (
    <>
      <rect x="3.5" y="5.5" width="17" height="13" rx="1.5" />
      <path d="m4 7 8 6 8-6" />
    </>
  ),
  audit: (
    <>
      <path d="M12 3.5 19 6v5.5c0 4.2-3 7.5-7 9-4-1.5-7-4.8-7-9V6l7-2.5Z" />
      <path d="m9 12 2 2 4-4" />
    </>
  ),
  bell: <path d="M6.5 16.5V11a5.5 5.5 0 0 1 11 0v5.5l1.5 1.5H5l1.5-1.5ZM10 20.5h4" />,
  settings: (
    <>
      <circle cx="12" cy="12" r="3" />
      <path d="M12 3.5v2.2M12 18.3v2.2M3.5 12h2.2M18.3 12h2.2M6 6l1.6 1.6M16.4 16.4 18 18M6 18l1.6-1.6M16.4 7.6 18 6" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M9.6 9.5a2.5 2.5 0 1 1 3.4 2.3c-.6.3-1 .8-1 1.5v.7M12 17h.01" />
    </>
  ),
  eye: (
    <>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12Z" />
      <circle cx="12" cy="12" r="2.8" />
    </>
  ),
  logout: <path d="M14 5h4a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1h-4M10 16l-4-4 4-4M6 12h9" />,
  menu: <path d="M4 7h16M4 12h16M4 17h16" />,
};

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, className }: { name: IconName; size?: number; className?: string }) {
  return (
    <svg
      aria-hidden
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      {PATHS[name]}
    </svg>
  );
}
