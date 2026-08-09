/**
 * The icon set, drawn here rather than pulled from a library: nothing is
 * fetched, everything is one stroke weight, and the shapes are specific to a
 * railway rather than generic glyphs.
 */
export type IconName =
  | 'rail'
  | 'erase'
  | 'raise'
  | 'lower'
  | 'tunnel'
  | 'tree'
  | 'water'
  | 'station'
  | 'play'
  | 'pause'
  | 'undo'
  | 'redo'
  | 'hint'
  | 'clear'
  | 'sun'
  | 'moon'
  | 'menu'
  | 'close'
  | 'grow'
  | 'panel'
  | 'west'
  | 'home'
  | 'east'
  | 'train'
  | 'people'
  | 'coin'
  | 'clinic'

const PATHS: Record<IconName, React.ReactNode> = {
  rail: (
    <>
      <path d="M6 3v18M18 3v18" />
      <path d="M3 7h18M3 12h18M3 17h18" />
    </>
  ),
  erase: (
    <>
      <path d="M4 16 14 6l5 5-10 10H4z" />
      <path d="M9 21h11" />
    </>
  ),
  raise: (
    <>
      <path d="M12 4v11" />
      <path d="m7 9 5-5 5 5" />
      <path d="M3 20h18" />
    </>
  ),
  lower: (
    <>
      <path d="M12 16V5" />
      <path d="m7 11 5 5 5-5" />
      <path d="M3 20h18" />
    </>
  ),
  tunnel: (
    <>
      <path d="M3 20V12a9 9 0 0 1 18 0v8" />
      <path d="M9 20v-7a3 3 0 0 1 6 0v7" />
    </>
  ),
  tree: (
    <>
      <path d="m12 3 5 7h-3l4 6H6l4-6H7z" />
      <path d="M12 16v5" />
    </>
  ),
  water: (
    <>
      <path d="M3 8c2.5-2 4.5-2 7 0s4.5 2 7 0 2.5-1 4-1" />
      <path d="M3 14c2.5-2 4.5-2 7 0s4.5 2 7 0 2.5-1 4-1" />
      <path d="M3 20c2.5-2 4.5-2 7 0s4.5 2 7 0 2.5-1 4-1" />
    </>
  ),
  station: (
    <>
      <path d="M5 20V9l7-5 7 5v11" />
      <path d="M2 20h20" />
      <path d="M10 20v-5h4v5" />
    </>
  ),
  play: <path d="M7 4.5 19 12 7 19.5z" />,
  pause: (
    <>
      <path d="M8 5v14M16 5v14" />
    </>
  ),
  undo: (
    <>
      <path d="M4 10h10a5 5 0 0 1 0 10H8" />
      <path d="m8 6-4 4 4 4" />
    </>
  ),
  redo: (
    <>
      <path d="M20 10H10a5 5 0 0 0 0 10h6" />
      <path d="m16 6 4 4-4 4" />
    </>
  ),
  hint: (
    <>
      <path d="M9 18h6" />
      <path d="M10 21h4" />
      <path d="M12 3a6 6 0 0 0-3.5 10.9c.5.4.8 1 .8 1.6v.5h5.4v-.5c0-.6.3-1.2.8-1.6A6 6 0 0 0 12 3z" />
    </>
  ),
  clear: (
    <>
      <path d="M4 7h16" />
      <path d="M9 7V4h6v3" />
      <path d="M6 7v13h12V7" />
    </>
  ),
  sun: (
    <>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M2 12h2M20 12h2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4" />
    </>
  ),
  moon: <path d="M20 14.5A8.5 8.5 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />,
  menu: (
    <>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </>
  ),
  close: <path d="M6 6l12 12M18 6L6 18" />,
  grow: (
    <>
      <path d="M12 21c0-6 3-9 8-10-1 6-4 9-8 10z" />
      <path d="M12 21c0-5-2.5-7.5-7-8.5.8 5 3.5 7.5 7 8.5z" />
      <path d="M12 21v-6" />
    </>
  ),
  panel: (
    <>
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M10 4v16" />
    </>
  ),
  west: <path d="m14 5-7 7 7 7" />,
  home: (
    <>
      <path d="m3 11 9-7 9 7" />
      <path d="M6 10v10h12V10" />
    </>
  ),
  east: <path d="m10 5 7 7-7 7" />,
  train: (
    <>
      <rect x="5" y="4" width="14" height="12" rx="3" />
      <path d="M5 11h14" />
      <path d="m6 20 2-3M18 20l-2-3" />
      <circle cx="9" cy="14" r="1" />
      <circle cx="15" cy="14" r="1" />
    </>
  ),
  people: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20a6 6 0 0 1 12 0" />
      <path d="M16 6a3 3 0 0 1 0 6" />
      <path d="M17 14a6 6 0 0 1 4 6" />
    </>
  ),
  coin: (
    <>
      <circle cx="12" cy="12" r="8" />
      <path d="M12 8v8M9.5 9.8h4a1.7 1.7 0 0 1 0 3.4h-3a1.7 1.7 0 0 0 0 3.4h4" />
    </>
  ),
  clinic: (
    <>
      <rect x="4" y="6" width="16" height="14" rx="2" />
      <path d="M12 10v6M9 13h6" />
      <path d="M9 6V4h6v2" />
    </>
  ),
}

export function Icon({ name, size = 20 }: { name: IconName; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={name === 'play' || name === 'moon' ? 'currentColor' : 'none'}
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  )
}
