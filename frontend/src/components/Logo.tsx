export function Logo({
  inverted = false,
  className = "",
}: {
  inverted?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <img
      src={inverted ? "/logo-light.png" : "/logo.png"}
      alt="KaziTrail"
      className={`h-auto w-52${className ? ` ${className}` : ""}`}
    />
  );
}
