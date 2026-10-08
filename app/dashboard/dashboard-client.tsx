"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { inr, num, pct } from "@/lib/format";
import { platformColor, platformLabel } from "@/lib/platforms";
import { platformPath } from "../platform-icon";
import type { DailyByPlatform, PlatformTotal } from "@/lib/queries";

const GRID = "#e8e8e5";
const INK_MUTED = "#8a8a85";

const axis = {
  stroke: GRID,
  tick: { fill: INK_MUTED, fontSize: 11 },
  tickLine: false,
  axisLine: { stroke: GRID },
};

const shortDay = (iso: string) =>
  new Date(`${iso}T00:00:00`).toLocaleDateString("en-IN", { day: "numeric", month: "short" });

const money = (v: number) =>
  v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${Math.round(v / 1000)}k`;

function Panel({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-neutral-200 bg-white p-5">
      <div className="mb-4">
        <h2 className="text-sm font-semibold text-neutral-900">{title}</h2>
        {note ? <p className="mt-0.5 text-xs text-neutral-500">{note}</p> : null}
      </div>
      {children}
    </section>
  );
}

function Tip({ rows, label }: { label: string; rows: { name: string; value: string; color: string }[] }) {
  return (
    <div className="rounded-lg border border-neutral-200 bg-white px-3 py-2 shadow-sm">
      <div className="text-xs font-medium text-neutral-500">{label}</div>
      {rows.map((r) => (
        <div key={r.name} className="mt-1 flex items-center gap-2">
          <span className="size-2 rounded-full" style={{ background: r.color }} />
          <span className="text-sm font-semibold tabular-nums text-neutral-900">{r.value}</span>
          <span className="text-xs text-neutral-500">{r.name}</span>
        </div>
      ))}
    </div>
  );
}

/**
 * Spend split by platform.
 *
 * A donut is the right form here and almost nowhere else on this page: it is
 * part-to-whole, read at a glance, with two segments. The same chart for 50
 * campaigns would be unreadable — those stay as bars.
 *
 * The figures are also printed beside it, so the answer never depends on
 * judging the angle of an arc.
 */
export function PlatformSplit({ data, total }: { data: PlatformTotal[]; total: number }) {
  if (!data.length) return null;

  return (
    <Panel title="Where the spend goes" note="Share of total by platform.">
      <div className="flex flex-col items-center gap-6 sm:flex-row">
        <ResponsiveContainer width={180} height={180}>
          <PieChart>
            <Pie
              data={data}
              dataKey="spend"
              nameKey="platform"
              innerRadius={48}
              outerRadius={78}
              paddingAngle={2}
              stroke="#fff"
              strokeWidth={2}
              isAnimationActive={false}
            >
              {data.map((d) => (
                <Cell key={d.platform} fill={platformColor(d.platform)} />
              ))}
            </Pie>
            <Tooltip
              content={({ active, payload }) =>
                active && payload?.length ? (
                  <Tip
                    label={platformLabel(String(payload[0].payload.platform))}
                    rows={[
                      {
                        name: `${pct((Number(payload[0].value) / total) * 100)} of total`,
                        value: inr(Number(payload[0].value)),
                        color: platformColor(String(payload[0].payload.platform)),
                      },
                    ]}
                  />
                ) : null
              }
            />
          </PieChart>
        </ResponsiveContainer>

        <div className="w-full flex-1 space-y-3">
          {data.map((d) => (
            <div key={d.platform} className="flex items-baseline justify-between gap-4">
              <div className="flex items-center gap-2">
                <span
                  className="size-2.5 shrink-0 rounded-full"
                  style={{ background: platformColor(d.platform) }}
                />
                <span className="text-sm font-medium text-neutral-800">
                  {platformLabel(d.platform)}
                </span>
                <span className="text-xs text-neutral-400">
                  {num(d.campaigns)} campaign{d.campaigns === 1 ? "" : "s"}
                </span>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold tabular-nums text-neutral-900">
                  {inr(d.spend)}
                </div>
                <div className="text-xs tabular-nums text-neutral-500">
                  {pct((d.spend / total) * 100)} · {num(d.leads)} leads
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Panel>
  );
}

/** Daily spend stacked by platform — the mix over time, on one axis. */
export function DailySplit({ data }: { data: DailyByPlatform[] }) {
  return (
    <Panel title="Spend per day" note="Stacked by platform. Excludes today.">
      <ResponsiveContainer width="100%" height={260}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
          <YAxis {...axis} width={62} tickFormatter={money} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <Tip
                  label={shortDay(String(label))}
                  rows={payload
                    .filter((p) => Number(p.value) > 0)
                    .map((p) => ({
                      name: platformLabel(String(p.dataKey)),
                      value: inr(Number(p.value)),
                      color: platformColor(String(p.dataKey)),
                    }))}
                />
              ) : null
            }
          />
          <Legend
            iconType="circle"
            iconSize={8}
            formatter={(v) => <span className="text-xs text-neutral-600">{platformLabel(v)}</span>}
          />
          {/* 2px white gap between stacked segments keeps the boundary readable. */}
          <Bar dataKey="META" stackId="s" fill={platformColor("META")} isAnimationActive={false} maxBarSize={30} />
          <Bar
            dataKey="GOOGLE"
            stackId="s"
            fill={platformColor("GOOGLE")}
            radius={[4, 4, 0, 0]}
            isAnimationActive={false}
            maxBarSize={30}
          />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export type TopRow = { id: string; name: string; platform: string; spend: number; leads: number };

/** Top campaigns, each bar wearing its platform's colour. */
export function TopCampaignsByPlatform({ data }: { data: TopRow[] }) {
  function middleTruncate(name: string, max = 30) {
    if (name.length <= max) return name;
    const head = Math.ceil((max - 1) * 0.55);
    return `${name.slice(0, head).trimEnd()}…${name.slice(-(max - 1 - head)).trimStart()}`;
  }

  const platformOf = new Map(data.map((d) => [d.name, d.platform]));

  /**
   * Axis label: platform mark, then the campaign name, reading left to right.
   *
   * Recharts draws ticks inside the chart's own SVG, so a React component
   * cannot be nested — the logo is a scaled <path> in the same coordinate space.
   *
   * The band runs from -AXIS_W to 0 relative to the tick anchor, and anything
   * outside it is clipped. Laying the row out from the left edge inward (rather
   * than right-aligning the text and pushing the logo off the end) keeps the
   * mark inside the band and lines every label up on a common left margin.
   */
  const AXIS_W = 210;
  const LOGO = 12;
  const LOGO_X = -AXIS_W + 6; // 6px inset from the band's left edge
  const TEXT_X = LOGO_X + LOGO + 7;

  function Tick({ x, y, payload }: { x?: number; y?: number; payload?: { value?: string } }) {
    const name = String(payload?.value ?? "");
    const platform = platformOf.get(name) ?? "";
    const d = platformPath(platform);

    return (
      <g transform={`translate(${x ?? 0},${y ?? 0})`}>
        {d ? (
          <path
            d={d}
            fill={platformColor(platform)}
            transform={`translate(${LOGO_X}, ${-LOGO / 2}) scale(${LOGO / 24})`}
          />
        ) : null}
        <text x={TEXT_X} y={0} dy={4} textAnchor="start" fill="#52514e" fontSize={12}>
          {middleTruncate(name, 26)}
        </text>
      </g>
    );
  }

  return (
    <Panel title="Top campaigns" note="By spend, coloured by platform.">
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 38)}>
        <BarChart data={data} layout="vertical" margin={{ top: 0, right: 16, bottom: 0, left: 4 }} barCategoryGap={6}>
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis type="number" {...axis} tickFormatter={money} />
          <YAxis type="category" dataKey="name" {...axis} width={210} tick={<Tick />} interval={0} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <Tip
                  label={String(payload[0].payload.name)}
                  rows={[
                    {
                      name: `${platformLabel(String(payload[0].payload.platform))} · ${num(
                        Number(payload[0].payload.leads)
                      )} leads`,
                      value: inr(Number(payload[0].payload.spend)),
                      color: platformColor(String(payload[0].payload.platform)),
                    },
                  ]}
                />
              ) : null
            }
          />
          <Bar dataKey="spend" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
            {data.map((d) => (
              <Cell key={d.id} fill={platformColor(d.platform)} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
