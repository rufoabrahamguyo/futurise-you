/**
 * Small single-series SVG charts. Each one has a hover/focus readout and a
 * table alternative, so no value is reachable only by pointer or by color.
 */
import { useId, useState, type KeyboardEvent } from "react";

const SERIES = "#005b96"; // pine-600
const GRID = "#b3cde0"; // line

interface Point {
  label: string;
  value: number;
}

export function DataTable({
  caption,
  points,
  valueLabel,
}: {
  caption: string;
  points: Point[];
  valueLabel: string;
}) {
  return (
    <details className="mt-3 text-sm">
      <summary className="text-ink-500 hover:text-ink-900 cursor-pointer text-xs font-medium">
        View as table
      </summary>
      <table className="mt-2 w-full text-left text-xs">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="text-ink-500">
            <th scope="col" className="py-1 font-medium">
              Period
            </th>
            <th scope="col" className="py-1 text-right font-medium">
              {valueLabel}
            </th>
          </tr>
        </thead>
        <tbody>
          {points.map((p) => (
            <tr key={p.label} className="border-line border-t">
              <td className="text-ink-700 py-1">{p.label}</td>
              <td className="text-ink-900 py-1 text-right tabular-nums">{p.value}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </details>
  );
}

function useActiveIndex(length: number) {
  const [active, setActive] = useState<number | null>(null);
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "ArrowRight") setActive((i) => Math.min((i ?? -1) + 1, length - 1));
    else if (event.key === "ArrowLeft") setActive((i) => Math.max((i ?? length) - 1, 0));
    else return;
    event.preventDefault();
  }
  return { active, setActive, onKeyDown };
}

/** Line + area wash with a crosshair readout. */
export function Sparkline({
  points,
  label,
  valueLabel,
  height = 64,
}: {
  points: Point[];
  label: string;
  valueLabel: string;
  height?: number;
}) {
  const width = 280;
  const pad = 6;
  const max = Math.max(1, ...points.map((p) => p.value));
  const step = points.length > 1 ? (width - pad * 2) / (points.length - 1) : 0;
  const x = (i: number) => pad + i * step;
  const y = (v: number) => height - pad - (v / max) * (height - pad * 2);
  const line = points.map((p, i) => `${i === 0 ? "M" : "L"}${x(i)},${y(p.value)}`).join(" ");
  const area = `${line} L${x(points.length - 1)},${height - pad} L${x(0)},${height - pad} Z`;
  const { active, setActive, onKeyDown } = useActiveIndex(points.length);
  const shown = active ?? points.length - 1;
  const current = points[shown];

  return (
    <figure>
      <div className="mb-2 flex items-baseline justify-between text-xs" aria-live="polite">
        <span className="text-ink-500">{current?.label}</span>
        <span className="text-ink-900 font-semibold">
          {current?.value ?? 0} {valueLabel}
        </span>
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-16 w-full touch-none overflow-visible"
        role="img"
        aria-label={`${label}. Use left and right arrow keys to read each day.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          const ratio = (e.clientX - rect.left) / rect.width;
          setActive(Math.round(Math.min(1, Math.max(0, ratio)) * (points.length - 1)));
        }}
      >
        <line
          x1={pad}
          x2={width - pad}
          y1={height - pad}
          y2={height - pad}
          stroke={GRID}
          strokeWidth={1}
        />
        <path d={area} fill={SERIES} fillOpacity={0.1} />
        <path
          d={line}
          fill="none"
          stroke={SERIES}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {active !== null ? (
          <line
            x1={x(active)}
            x2={x(active)}
            y1={pad}
            y2={height - pad}
            stroke={GRID}
            strokeWidth={1}
          />
        ) : null}
        {current ? (
          <circle
            cx={x(shown)}
            cy={y(current.value)}
            r={4}
            fill={SERIES}
            stroke="#fff"
            strokeWidth={2}
          />
        ) : null}
      </svg>
      <DataTable caption={label} points={points} valueLabel={valueLabel} />
    </figure>
  );
}

/** Horizontal bars for a short list of categories, value at the bar tip. */
export function BarList({
  points,
  label,
  valueLabel,
}: {
  points: Point[];
  label: string;
  valueLabel: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const id = useId();
  return (
    <figure aria-labelledby={id}>
      <figcaption id={id} className="sr-only">
        {label}
      </figcaption>
      <ul className="space-y-2.5">
        {points.map((p) => (
          <li key={p.label} className="grid grid-cols-[7rem_1fr] items-center gap-3 text-sm">
            <span className="text-ink-700 truncate">{p.label}</span>
            <span
              className="flex items-center gap-2"
              title={`${p.label}: ${p.value} ${valueLabel}`}
            >
              <span
                className="h-4 max-h-6 rounded-r-[4px]"
                style={{
                  width: `${(p.value / max) * 85}%`,
                  minWidth: p.value ? 4 : 0,
                  backgroundColor: SERIES,
                }}
                aria-hidden="true"
              />
              <span className="text-ink-900 tabular-nums">
                {p.value}
                <span className="sr-only"> {valueLabel}</span>
              </span>
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

/** Vertical columns over time with a per-column hover/focus readout. */
export function ColumnChart({
  points,
  label,
  valueLabel,
  height = 160,
}: {
  points: Point[];
  label: string;
  valueLabel: string;
  height?: number;
}) {
  const width = 600;
  const padBottom = 22;
  const padTop = 8;
  const max = Math.max(1, ...points.map((p) => p.value));
  const band = width / Math.max(1, points.length);
  const barW = Math.min(24, band - 4);
  const plotH = height - padBottom - padTop;
  const { active, setActive, onKeyDown } = useActiveIndex(points.length);
  const current = active !== null ? points[active] : null;
  const tickEvery = Math.ceil(points.length / 6);

  return (
    <figure>
      <div className="mb-2 h-4 text-xs" aria-live="polite">
        {current ? (
          <span>
            <span className="text-ink-900 font-semibold">
              {current.value} {valueLabel}
            </span>{" "}
            <span className="text-ink-500">· {current.label}</span>
          </span>
        ) : (
          <span className="text-ink-500">Hover or use arrow keys to read values</span>
        )}
      </div>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full"
        role="img"
        aria-label={`${label}. Use left and right arrow keys to read each period.`}
        tabIndex={0}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
        onPointerLeave={() => setActive(null)}
      >
        {[0.5, 1].map((f) => (
          <line
            key={f}
            x1={0}
            x2={width}
            y1={padTop + plotH * (1 - f)}
            y2={padTop + plotH * (1 - f)}
            stroke={GRID}
            strokeWidth={1}
          />
        ))}
        <text x={0} y={padTop + 10} className="fill-ink-500 text-[11px]">
          {max}
        </text>
        <line
          x1={0}
          x2={width}
          y1={padTop + plotH}
          y2={padTop + plotH}
          stroke="#cfc9bb"
          strokeWidth={1}
        />
        {points.map((p, i) => {
          const h = (p.value / max) * plotH;
          const cx = i * band + band / 2;
          const top = padTop + plotH - h;
          const r = Math.min(4, h);
          const x0 = cx - barW / 2;
          const path =
            h > 0
              ? `M${x0},${padTop + plotH} V${top + r} Q${x0},${top} ${x0 + r},${top} H${x0 + barW - r} Q${x0 + barW},${top} ${x0 + barW},${top + r} V${padTop + plotH} Z`
              : "";
          return (
            <g key={p.label} onPointerEnter={() => setActive(i)}>
              <rect x={i * band} y={0} width={band} height={height} fill="transparent" />
              {path ? (
                <path d={path} fill={SERIES} opacity={active === null || active === i ? 1 : 0.55} />
              ) : null}
              {i % tickEvery === 0 ? (
                <text
                  x={cx}
                  y={height - 6}
                  textAnchor="middle"
                  className="fill-ink-500 text-[11px]"
                >
                  {p.label}
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <DataTable caption={label} points={points} valueLabel={valueLabel} />
    </figure>
  );
}
