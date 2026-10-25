"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";

interface Point {
  /** Rótulo curto no eixo (build ou semana). */
  label: string;
  /** Título no tooltip ("Build 1.8.0", "Semana de 07/07"). */
  title: string;
  passRate: number | null;
  executed: number;
  failed: number;
}

/** Taxa de sucesso por build (ou semana): uma série, sem legenda (o título do card a nomeia). */
export function TrendChart({ data }: { data: Point[] }) {
  return (
    <div className="h-56 w-full">
      <ResponsiveContainer>
        <LineChart data={data} margin={{ top: 12, right: 16, bottom: 0, left: -12 }}>
          <CartesianGrid vertical={false} stroke="var(--grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={{ stroke: "var(--grid)" }} tick={{ fill: "var(--muted)", fontSize: 12 }} />
          <YAxis
            domain={[0, 100]}
            ticks={[0, 25, 50, 75, 100]}
            tickFormatter={(v) => `${v}%`}
            tickLine={false}
            axisLine={false}
            tick={{ fill: "var(--muted)", fontSize: 12 }}
          />
          <Tooltip
            cursor={{ stroke: "var(--muted)", strokeDasharray: "3 3" }}
            content={({ active, payload }) => {
              const p = active && payload?.[0]?.payload as Point | undefined;
              if (!p) return null;
              return (
                <div className="rounded-lg border border-border bg-surface px-3 py-2 text-xs shadow-sm">
                  <div className="font-semibold text-fg">{p.title}</div>
                  <div className="mt-1 text-fg-2 tabular">Taxa de sucesso: {p.passRate === null ? "—" : `${p.passRate}%`}</div>
                  <div className="text-fg-2 tabular">Executados: {p.executed}</div>
                  <div className="text-fg-2 tabular">Falhas/bloqueios: {p.failed}</div>
                </div>
              );
            }}
          />
          <Line
            type="monotone"
            dataKey="passRate"
            stroke="var(--accent)"
            strokeWidth={2}
            dot={{ r: 4, fill: "var(--accent)", stroke: "var(--surface)", strokeWidth: 2 }}
            activeDot={{ r: 6, stroke: "var(--surface)", strokeWidth: 2 }}
            connectNulls
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}
