import { Ban, CheckCircle2, CircleDashed, XCircle } from "lucide-react";
import { OUTCOME_LABEL, type Outcome, type Summary } from "@/lib/metrics";
import { cn } from "./ui";

const ICON = { passed: CheckCircle2, failed: XCircle, blocked: Ban, pending: CircleDashed } as const;
const TEXT = { passed: "text-passed", failed: "text-failed", blocked: "text-blocked", pending: "text-muted" } as const;
export const FILL = { passed: "bg-passed", failed: "bg-failed", blocked: "bg-blocked", pending: "bg-pending" } as const;

/** Status sempre com ícone + rótulo, nunca só cor. */
export function StatusBadge({ outcome, label, className }: { outcome: Outcome; label?: string; className?: string }) {
  const Icon = ICON[outcome];
  return (
    <span className={cn("inline-flex items-center gap-1.5 text-xs font-medium", className)}>
      <Icon className={cn("size-4 shrink-0", TEXT[outcome])} aria-hidden />
      <span className="text-fg-2">{label ?? OUTCOME_LABEL[outcome]}</span>
    </span>
  );
}

const ORDER: Outcome[] = ["passed", "failed", "blocked", "pending"];

/** Barra empilhada de progresso de um run (HTML puro, com 2px entre segmentos). */
export function ProgressBar({ summary, className }: { summary: Summary; className?: string }) {
  if (!summary.total) return <div className={cn("h-2 rounded-full bg-surface-2", className)} />;
  return (
    <div className={cn("flex h-2 gap-0.5", className)} role="img" aria-label={ORDER.map((o) => `${OUTCOME_LABEL[o]}: ${summary[o]}`).join(", ")}>
      {ORDER.filter((o) => summary[o] > 0).map((o) => (
        <div
          key={o}
          title={`${OUTCOME_LABEL[o]}: ${summary[o]} de ${summary.total}`}
          className={cn("h-full first:rounded-l-full last:rounded-r-full", FILL[o])}
          style={{ width: `${(summary[o] / summary.total) * 100}%` }}
        />
      ))}
    </div>
  );
}

export function OutcomeLegend() {
  return (
    <div className="flex flex-wrap gap-x-4 gap-y-1">
      {ORDER.map((o) => (
        <StatusBadge key={o} outcome={o} />
      ))}
    </div>
  );
}

export function formatRate(rate: number | null) {
  return rate === null ? "—" : `${rate.toLocaleString("pt-BR", { maximumFractionDigits: 1 })}%`;
}
