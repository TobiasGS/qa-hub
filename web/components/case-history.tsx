"use client";

import { ChevronRight, History, Loader2, RotateCcw } from "lucide-react";
import Link from "next/link";
import { useEffect, useState } from "react";
import { send } from "@/lib/client-api";
import type { Outcome } from "@/lib/metrics";
import { formatDuration, parseKiwiDate, type TimerEntry } from "@/lib/timer";
import { StatusBadge } from "./status";
import { cn } from "./ui";

interface Attempt {
  executionId: number;
  runId: number;
  runSummary: string;
  retest: boolean;
  build: string;
  status: string;
  outcome: Outcome;
  tester: string | null;
  date: string | null;
  duration: number | null;
  timeline: TimerEntry[];
}

const EVENT_LABEL: Record<TimerEntry["event"], string> = { start: "Iniciou", pause: "Pausou", resume: "Retomou", finish: "Finalizou" };
const pausesLabel = (n: number) => (n === 0 ? "linha do tempo" : n === 1 ? "1 pausa" : `${n} pausas`);
const time = (iso: string) => new Date(parseKiwiDate(iso)).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

/** Tentativas anteriores do caso (run original e re-testes), com tempos e pausas. */
export function CaseHistory({ caseId, currentExecutionId, refreshKey }: { caseId: number; currentExecutionId: number; refreshKey: string }) {
  const [open, setOpen] = useState(false);
  const [attempts, setAttempts] = useState<Attempt[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null);
    send<{ attempts: Attempt[] }>(`/api/cases/${caseId}/history`, "GET").then(
      (r) => setAttempts(r.attempts),
      (e) => setError((e as Error).message),
    );
  }, [open, caseId, refreshKey]);

  return (
    <div className="mt-4 rounded-lg border border-border">
      <button onClick={() => setOpen((o) => !o)} className="flex w-full items-center gap-2 px-3 py-2.5 text-left text-sm font-medium hover:bg-surface-2" aria-expanded={open}>
        <History className="size-4 text-muted" aria-hidden />
        Histórico de execuções e tempo
        <ChevronRight className={cn("ml-auto size-4 text-muted transition", open && "rotate-90")} aria-hidden />
      </button>
      {open && (
        <div className="border-t border-border px-3 py-2">
          {error && <p className="py-2 text-sm text-failed">{error}</p>}
          {!attempts && !error && (
            <p className="flex items-center gap-2 py-2 text-sm text-muted">
              <Loader2 className="size-4 animate-spin" /> Carregando…
            </p>
          )}
          {attempts && attempts.length === 0 && <p className="py-2 text-sm text-muted">Nenhuma execução ainda.</p>}
          {attempts && attempts.length > 0 && (
            <ul className="divide-y divide-border">
              {attempts.map((a) => (
                <li key={a.executionId} className="py-2">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm">
                    <StatusBadge outcome={a.outcome} className="w-24 shrink-0" />
                    <span className="min-w-0 flex-1">
                      <Link href={`/runs/${a.runId}`} className="hover:underline">
                        {a.retest && <RotateCcw className="mr-1 inline size-3.5 text-muted" aria-label="Re-teste" />}
                        {a.runSummary}
                      </Link>
                      {a.executionId === currentExecutionId && <span className="ml-2 text-xs text-accent">(atual)</span>}
                      <span className="block text-xs text-muted">
                        build {a.build} · {a.tester ?? "—"}
                        {a.date && ` · ${time(a.date)}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-xs font-medium tabular">{a.duration !== null ? formatDuration(a.duration) : "—"}</span>
                    {a.timeline.length > 0 && (
                      <button onClick={() => setExpanded(expanded === a.executionId ? null : a.executionId)} className="text-xs text-muted hover:text-fg">
                        {expanded === a.executionId ? "ocultar" : pausesLabel(a.timeline.filter((t) => t.event === "pause").length)}
                      </button>
                    )}
                  </div>
                  {expanded === a.executionId && (
                    <ol className="ml-24 mt-2 space-y-1 border-l border-border pl-3 text-xs text-fg-2">
                      {a.timeline.map((t, i) => (
                        <li key={i} className="tabular">
                          {time(t.at)} · {EVENT_LABEL[t.event]}
                          {t.status && ` (${t.status})`} · {formatDuration(t.elapsed)}
                          {t.user && <span className="text-muted"> · {t.user}</span>}
                        </li>
                      ))}
                    </ol>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
