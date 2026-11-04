export function Logo({
  inverted = false,
  compact = false,
}: {
  inverted?: boolean;
  compact?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <svg viewBox="0 0 32 32" className="size-8 shrink-0" aria-hidden="true">
        <rect width="32" height="32" rx="8" fill={inverted ? "#f3efe6" : "#173f3a"} />
        <path
          d="M9 11.5 16 8l7 3.5V17c0 4-3 6.6-7 7.5-4-.9-7-3.5-7-7.5z"
          fill="none"
          stroke={inverted ? "#173f3a" : "#f3efe6"}
          strokeWidth="2"
          strokeLinejoin="round"
        />
        <path
          d="m12.5 16 2.5 2.5 4.5-5"
          fill="none"
          stroke={inverted ? "#173f3a" : "#f3efe6"}
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </svg>
      {compact ? null : (
        <span
          className={`font-serif text-xl font-semibold tracking-tight ${inverted ? "text-white" : "text-ink-900"}`}
        >
          ApplyVault
        </span>
      )}
    </span>
  );
}
