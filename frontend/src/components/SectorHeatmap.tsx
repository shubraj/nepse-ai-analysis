import { ResponsiveContainer, Tooltip, Treemap } from "recharts";
import type { SectorPerformanceItem } from "../types/company";

interface TreemapDatum {
  name: string;
  size: number;
  avgPctChange: number;
  stocksUp: number;
  stocksDown: number;
  count: number;
  [key: string]: string | number;
}

// Real NEPSE sector moves rarely exceed ~1.5% in a day, so the color scale
// is tuned to that range rather than the +-3% used by US-market heatmaps.
const SCALE_MAX = 1.5;

const LEGEND_STOPS: { label: string; pct: number }[] = [
  { label: `<= -${SCALE_MAX}`, pct: -SCALE_MAX },
  { label: `-${SCALE_MAX / 2}`, pct: -SCALE_MAX / 2 },
  { label: "0", pct: 0 },
  { label: `+${SCALE_MAX / 2}`, pct: SCALE_MAX / 2 },
  { label: `>= +${SCALE_MAX}`, pct: SCALE_MAX },
];

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function interpolate(c1: string, c2: string, t: number): string {
  const [r1, g1, b1] = hexToRgb(c1);
  const [r2, g2, b2] = hexToRgb(c2);
  const r = Math.round(r1 + (r2 - r1) * t);
  const g = Math.round(g1 + (g2 - g1) * t);
  const b = Math.round(b1 + (b2 - b1) * t);
  return `rgb(${r}, ${g}, ${b})`;
}

// Deep red -> neutral stone -> deep green, matching Yahoo/US-market sector maps.
const RED_DEEP = "#7f1d1d";
const RED = "#dc2626";
const MID = "#d6d3d1";
const GREEN = "#059669";
const GREEN_DEEP = "#065f46";

export function colorForPct(pct: number): string {
  const clamped = Math.max(-SCALE_MAX, Math.min(SCALE_MAX, pct));
  const t = clamped / SCALE_MAX; // -1..1
  if (t >= 0) {
    return t < 0.5 ? interpolate(MID, GREEN, t / 0.5) : interpolate(GREEN, GREEN_DEEP, (t - 0.5) / 0.5);
  }
  const at = -t;
  return at < 0.5 ? interpolate(MID, RED, at / 0.5) : interpolate(RED, RED_DEEP, (at - 0.5) / 0.5);
}

function textColorForPct(pct: number): string {
  const clamped = Math.abs(Math.max(-SCALE_MAX, Math.min(SCALE_MAX, pct)));
  return clamped >= SCALE_MAX * 0.35 ? "#ffffff" : "#292524";
}

/** Rough width of one character at a given font size, for bold sans-serif. */
function charWidth(fontSize: number): number {
  return fontSize * 0.58;
}

function wrapLines(name: string, maxWidth: number, fontSize: number, maxLines: number): string[] {
  const words = name.split(" ");
  const maxChars = Math.max(1, Math.floor(maxWidth / charWidth(fontSize)));
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (candidate.length <= maxChars) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
      if (lines.length >= maxLines) break;
    }
  }
  if (current && lines.length < maxLines) lines.push(current);

  if (lines.length === maxLines) {
    const last = lines[maxLines - 1];
    const consumedWords = lines.join(" ").split(" ").length;
    const isTruncated = consumedWords < words.length;
    if (isTruncated && last.length > 1) {
      lines[maxLines - 1] = `${last.slice(0, Math.max(1, maxChars - 1))}…`;
    }
  }
  return lines;
}

function CellContent(props: {
  x?: number;
  y?: number;
  width?: number;
  height?: number;
  name?: string;
  avgPctChange?: number;
}) {
  const { x = 0, y = 0, width = 0, height = 0, name = "", avgPctChange } = props;
  if (width < 1 || height < 1 || avgPctChange == null) return null;

  const fill = colorForPct(avgPctChange);
  const textColor = textColorForPct(avgPctChange);
  const pad = 6;
  const innerWidth = width - pad * 2;

  const canLabel = width > 44 && height > 26;
  const nameFontSize = Math.max(11, Math.min(16, width / 10));
  const pctFontSize = Math.max(10, Math.min(13, width / 12));
  const maxLines = height > 90 ? 3 : height > 55 ? 2 : 1;

  const nameLines = canLabel ? wrapLines(name, innerWidth, nameFontSize, maxLines) : [];
  const showPct = canLabel && height > nameLines.length * (nameFontSize + 2) + pctFontSize + 4;

  const lineHeight = nameFontSize + 2;
  const blockHeight = nameLines.length * lineHeight + (showPct ? pctFontSize + 6 : 0);
  const startY = y + height / 2 - blockHeight / 2 + lineHeight / 2;

  return (
    <g>
      <rect
        x={x}
        y={y}
        width={width}
        height={height}
        shapeRendering="crispEdges"
        style={{ fill, stroke: "#fff", strokeWidth: 2 }}
      />
      {nameLines.map((line, i) => (
        <text
          key={i}
          x={x + width / 2}
          y={startY + i * lineHeight}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          stroke="none"
          fontSize={nameFontSize}
          fontWeight={700}
        >
          {line}
        </text>
      ))}
      {showPct && (
        <text
          x={x + width / 2}
          y={startY + nameLines.length * lineHeight + pctFontSize / 2 + 2}
          textAnchor="middle"
          dominantBaseline="middle"
          fill={textColor}
          stroke="none"
          fontSize={pctFontSize}
          fontWeight={500}
        >
          {avgPctChange >= 0 ? "+" : ""}
          {avgPctChange.toFixed(2)}%
        </text>
      )}
    </g>
  );
}

function HeatmapTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: TreemapDatum }[];
}) {
  if (!active || !payload || payload.length === 0) return null;
  const d = payload[0].payload;
  return (
    <div className="rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm shadow-md">
      <div className="font-semibold text-stone-800">{d.name}</div>
      <div className={d.avgPctChange >= 0 ? "text-emerald-600" : "text-red-600"}>
        {d.avgPctChange >= 0 ? "+" : ""}
        {d.avgPctChange.toFixed(2)}% avg
      </div>
      <div className="mt-1 text-xs text-stone-500">
        {d.stocksUp} up · {d.stocksDown} down · {d.count} stocks
      </div>
    </div>
  );
}

export function SectorHeatmap({ sectors }: { sectors: SectorPerformanceItem[] }) {
  if (sectors.length === 0) return null;

  const data: TreemapDatum[] = sectors
    .map((s) => ({
      name: s.sector,
      size: Math.max(s.count, 1),
      avgPctChange: s.avg_pct_change,
      stocksUp: s.stocks_up,
      stocksDown: s.stocks_down,
      count: s.count,
    }))
    // Largest sectors first gives the squarify algorithm cleaner, less sliver-prone boxes.
    .sort((a, b) => b.size - a.size);

  return (
    <div>
      <div className="h-[420px] w-full overflow-hidden rounded-lg bg-stone-200 p-0.5">
        <ResponsiveContainer width="100%" height="100%">
          <Treemap
            data={data}
            dataKey="size"
            nameKey="name"
            aspectRatio={4 / 3}
            isAnimationActive={false}
            content={<CellContent />}
          >
            <Tooltip content={<HeatmapTooltip />} />
          </Treemap>
        </ResponsiveContainer>
      </div>
      <div className="mt-4 flex items-center justify-center gap-0.5 overflow-x-auto">
        {LEGEND_STOPS.map((stop) => (
          <div key={stop.label} className="flex flex-col items-center gap-1 px-2">
            <div
              className="h-3 w-10 rounded-sm"
              style={{ background: colorForPct(stop.pct) }}
            />
            <span className="text-[11px] text-stone-500">{stop.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
