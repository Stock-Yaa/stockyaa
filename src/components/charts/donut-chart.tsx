export type Segment = {
  key: string;
  label: string;
  value: number;
  /** Text shown for the value, e.g. a formatted count or amount. */
  display: string;
  /** CSS colour of the segment and its legend dot, e.g. "var(--success)". */
  color: string;
};

const SIZE = 160;
const STROKE = 22;
const RADIUS = (SIZE - STROKE) / 2;
const CIRCUMFERENCE = 2 * Math.PI * RADIUS;
// Surface-coloured space between neighbouring segments.
const GAP = 3;

/**
 * Part-to-whole as a donut with the total in the middle and a legend beside
 * it. The legend names every part with its value and share, so colour is
 * never the only cue; hovering a segment shows its label too.
 */
export function DonutChart({
  segments,
  centerValue,
  centerLabel,
  emptyLabel,
}: {
  segments: Segment[];
  centerValue: string;
  centerLabel: string;
  emptyLabel: string;
}) {
  const total = segments.reduce((sum, s) => sum + s.value, 0);
  const visible = segments.filter((s) => s.value > 0);
  const gap = visible.length > 1 ? GAP : 0;

  const lengths = visible.map((segment) => (segment.value / total) * CIRCUMFERENCE);
  const arcs = visible.map((segment, i) => ({
    segment,
    // Where this segment starts: the sum of the segments before it.
    offset: lengths.slice(0, i).reduce((sum, length) => sum + length, 0),
    length: Math.max(lengths[i] - gap, 0.5),
  }));

  return (
    // Side by side only when the chart's own container is wide enough.
    <div className="@container">
      <div className="flex flex-col items-center gap-6 @sm:flex-row @sm:items-center">
        <div className="relative shrink-0" style={{ width: SIZE, height: SIZE }}>
          <svg
            width={SIZE}
            height={SIZE}
            viewBox={`0 0 ${SIZE} ${SIZE}`}
            className="-rotate-90"
            role="img"
            aria-label={segments.map((s) => `${s.label}: ${s.display}`).join(", ")}
          >
            <circle
              cx={SIZE / 2}
              cy={SIZE / 2}
              r={RADIUS}
              fill="none"
              stroke="var(--muted)"
              strokeWidth={STROKE}
            />
            {arcs.map(({ segment, offset: start, length }) => (
              <circle
                key={segment.key}
                cx={SIZE / 2}
                cy={SIZE / 2}
                r={RADIUS}
                fill="none"
                stroke={segment.color}
                strokeWidth={STROKE}
                strokeDasharray={`${length} ${CIRCUMFERENCE - length}`}
                strokeDashoffset={-start}
                className="transition-opacity hover:opacity-80"
              >
                <title>{`${segment.label}: ${segment.display}`}</title>
              </circle>
            ))}
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
            <span className="max-w-[6.5rem] truncate text-lg font-semibold tabular-nums">
              {centerValue}
            </span>
            <span className="max-w-[6.5rem] truncate text-xs text-muted-foreground">
              {centerLabel}
            </span>
          </div>
        </div>

        {total === 0 ? (
          <p className="text-sm text-muted-foreground">{emptyLabel}</p>
        ) : (
          <ul className="grid w-full min-w-0 flex-1 gap-2.5">
            {segments.map((segment) => (
              <li key={segment.key} className="flex items-center gap-2 text-sm">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: segment.color }}
                />
                <span className="min-w-0 flex-1 truncate text-muted-foreground">
                  {segment.label}
                </span>
                <span className="font-medium tabular-nums">{segment.display}</span>
                <span className="w-10 text-right text-xs text-muted-foreground tabular-nums">
                  {Math.round((segment.value / total) * 100)}%
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
