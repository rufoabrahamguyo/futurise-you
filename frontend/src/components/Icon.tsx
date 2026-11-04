/** Inline stroke icons (24px grid). Decorative unless a `label` is given. */

const PATHS = {
  dashboard: "M4 13h6V4H4zm10 7h6v-9h-6zM4 20h6v-4H4zm10-11h6V4h-6z",
  briefcase:
    "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2m-11 0h16a1 1 0 0 1 1 1v10a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a1 1 0 0 1 1-1m-1 5h18",
  folder: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z",
  calendar:
    "M7 3v3m10-3v3M4 9h16M5 5h14a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1",
  chart: "M4 20V10m6 10V4m6 16v-7m4 7H3",
  settings:
    "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6m7.4-3a7.4 7.4 0 0 0-.1-1.2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-2-1.2L14.5 3h-5l-.4 2.6a7 7 0 0 0-2 1.2l-2.4-1-2 3.4 2 1.6a7.4 7.4 0 0 0 0 2.4l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 2 1.2l.4 2.6h5l.4-2.6a7 7 0 0 0 2-1.2l2.4 1 2-3.4-2-1.6c.1-.4.1-.8.1-1.2",
  bell: "M6 16V11a6 6 0 1 1 12 0v5l2 2H4zm4 3a2 2 0 0 0 4 0",
  search: "m20 20-4.5-4.5M11 18a7 7 0 1 1 0-14 7 7 0 0 1 0 14",
  plus: "M12 5v14M5 12h14",
  logout: "M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3M10 16l-4-4 4-4m-4 4h10",
  check: "m5 12.5 4.5 4.5L19 7.5",
  x: "M6 6l12 12M18 6 6 18",
  lock: "M7 11V8a5 5 0 0 1 10 0v3M6 11h12a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1",
  file: "M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8zm0 0v5h5M9 13h6m-6 4h4",
  upload: "M12 16V4m0 0-4 4m4-4 4 4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  download: "M12 4v12m0 0-4-4m4 4 4-4M4 16v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3",
  eye: "M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12m10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  clock: "M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  alert:
    "M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0",
  info: "M12 16v-5m0-3h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  chevronDown: "m6 9 6 6 6-6",
  chevronLeft: "m15 18-6-6 6-6",
  chevronRight: "m9 18 6-6-6-6",
  grip: "M9 6h.01M15 6h.01M9 12h.01M15 12h.01M9 18h.01M15 18h.01",
  menu: "M4 6h16M4 12h16M4 18h16",
  sparkles:
    "M12 3l1.8 4.7L18.5 9.5l-4.7 1.8L12 16l-1.8-4.7L5.5 9.5l4.7-1.8zM19 15l.8 2.2L22 18l-2.2.8L19 21l-.8-2.2L16 18l2.2-.8z",
  trash: "M4 7h16M10 11v6m4-6v6M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V4h6v3",
  refresh: "M20 11a8 8 0 0 0-14.9-4M4 4v4h4m-4 5a8 8 0 0 0 14.9 4M20 20v-4h-4",
  note: "M5 4h10l4 4v12H5zm4 7h6m-6 4h6",
  link: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1",
  table: "M3 5h18v14H3zm0 5h18M9 10v9",
  board: "M4 4h4v16H4zm6 0h4v10h-4zm6 0h4v13h-4z",
  history: "M3 12a9 9 0 1 0 3-6.7M3 4v4h4m5-1v5l3 2",
  shield: "M12 3 5 6v6c0 4.4 3 8 7 9 4-1 7-4.6 7-9V6z",
  question: "M9.1 9a3 3 0 0 1 5.8 1c0 2-3 3-3 3m.1 4h.01M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0",
  archive: "M3 5h18v4H3zm2 4v10h14V9m-9 4h4",
  mail: "M4 6h16v12H4zm0 0 8 7 8-7",
  pencil: "M4 20h4L19 9l-4-4L4 16zm9-13 4 4",
  arrowLeft: "M19 12H5m6-6-6 6 6 6",
  user: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8m-7 9a7 7 0 0 1 14 0",
} as const;

export type IconName = keyof typeof PATHS;

interface IconProps {
  name: IconName;
  className?: string;
  label?: string;
}

export function Icon({ name, className = "", label }: IconProps) {
  // Keep a default size unless the caller sets one.
  const classes = /(^|\s)size-/.test(className) ? className : `size-4 ${className}`;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={classes}
      role={label ? "img" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
      focusable="false"
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
