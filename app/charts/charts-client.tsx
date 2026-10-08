"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import type { DailyPoint } from "@/lib/queries";
import { inr, num } from "@/lib/format";

/**
 * Chart colours.
 *
 * Every chart here plots a SINGLE series, so each one gets one hue rather than a
 * palette — a value-ramp across nominal campaigns would double-encode bar length
 * as colour and tell the reader nothing the bar does not already say.
 *
 * Spend and leads deliberately use different hues so the two time-series are not
 * mistaken for the same measure. They are separate charts on separate axes: two
 * scales on one plot invents a correlation that is not in the data.
 */
const SPEND = "#2a78d6"; // sequential blue, step 450
const LEADS = "#1baf7a"; // aqua, distinct from spend without reading as status
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

function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note?: string;
  children: React.ReactNode;
}) {
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

/** Shared tooltip. Values wear ink colours; the swatch carries the identity. */
function TipBox({
  label,
  rows,
}: {
  label: string;
  rows: { name: string; value: string; color: string }[];
}) {
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

export function SpendOverTime({ data }: { data: DailyPoint[] }) {
  return (
    <Panel title="Spend per day" note="Meta only. Excludes today.">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
          <YAxis
            {...axis}
            width={62}
            tickFormatter={(v: number) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v / 1000}k`)}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipBox
                  label={shortDay(String(label))}
                  rows={[{ name: "spent", value: inr(Number(payload[0].value)), color: SPEND }]}
                />
              ) : null
            }
          />
          {/* 4px rounded data-end, square against the baseline. Animation off:
              the page re-renders on every filter change, and replaying a grow-in
              each time just delays reading the number. */}
          <Bar dataKey="spend" fill={SPEND} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export function LeadsOverTime({ data }: { data: DailyPoint[] }) {
  return (
    <Panel title="Leads per day" note="Meta-reported lead actions.">
      <ResponsiveContainer width="100%" height={240}>
        <BarChart data={data} margin={{ top: 4, right: 4, bottom: 0, left: 4 }}>
          <CartesianGrid stroke={GRID} vertical={false} />
          <XAxis dataKey="day" tickFormatter={shortDay} {...axis} minTickGap={24} />
          <YAxis {...axis} width={42} allowDecimals={false} />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload, label }) =>
              active && payload?.length ? (
                <TipBox
                  label={shortDay(String(label))}
                  rows={[{ name: "leads", value: num(Number(payload[0].value)), color: LEADS }]}
                />
              ) : null
            }
          />
          <Bar dataKey="leads" fill={LEADS} radius={[4, 4, 0, 0]} maxBarSize={28} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}

export type CampaignBar = { id: string; name: string; spend: number; leads: number };

/**
 * Shorten from the MIDDLE, keeping both ends.
 *
 * These campaign names share long prefixes and differ at the tail ("Trident
 * Parktown Lookalike – Delhi" vs "… – Panipat & Sonipat"), so clipping the end
 * renders two different campaigns with an identical label. Keeping both ends
 * preserves the part that tells them apart.
 */
function middleTruncate(name: string, max = 34): string {
  if (name.length <= max) return name;
  const head = Math.ceil((max - 1) * 0.55);
  const tail = max - 1 - head;
  return `${name.slice(0, head).trimEnd()}…${name.slice(-tail).trimStart()}`;
}

export function TopCampaigns({ data }: { data: CampaignBar[] }) {
  return (
    <Panel
      title="Where the money went"
      note={`Top ${data.length} campaigns by spend in this period.`}
    >
      <ResponsiveContainer width="100%" height={Math.max(220, data.length * 38)}>
        <BarChart
          data={data}
          layout="vertical"
          margin={{ top: 0, right: 16, bottom: 0, left: 4 }}
          barCategoryGap={6}
        >
          <CartesianGrid stroke={GRID} horizontal={false} />
          <XAxis
            type="number"
            {...axis}
            tickFormatter={(v: number) => (v >= 100000 ? `₹${(v / 100000).toFixed(1)}L` : `₹${v / 1000}k`)}
          />
          <YAxis
            type="category"
            dataKey="name"
            {...axis}
            width={210}
            tickFormatter={(v: string) => middleTruncate(v)}
            tick={{ fill: "#52514e", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ fill: "rgba(0,0,0,0.04)" }}
            content={({ active, payload }) =>
              active && payload?.length ? (
                <TipBox
                  label={String(payload[0].payload.name)}
                  rows={[
                    { name: "spent", value: inr(Number(payload[0].payload.spend)), color: SPEND },
                    { name: "leads", value: num(Number(payload[0].payload.leads)), color: LEADS },
                  ]}
                />
              ) : null
            }
          />
          {/* One hue for every bar, so no per-Cell loop is needed — and no
              duplicate React keys when two campaign names look alike. */}
          <Bar dataKey="spend" fill={SPEND} radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false} />
        </BarChart>
      </ResponsiveContainer>
    </Panel>
  );
}
