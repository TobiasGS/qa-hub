"use client";

import { Loader2, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { send } from "@/lib/client-api";
import { Badge, Button, Card, cn } from "./ui";

interface Group {
  title: string;
  category: string;
  confidence: string;
  executions: number[];
  evidence: string;
  action: string;
}
interface Saved {
  summary: string;
  groups: Group[];
  at: string;
  by: string;
}
interface JobView {
  status: "running" | "done" | "error";
  elapsed: number;
  error?: string;
}
interface DiagnosisView {
  saved: Saved | null;
  job: JobView | null;
}

const CATEGORY: Record<string, string> = {
  produto: "Defeito no produto",
  ambiente: "Ambiente",
  dados: "Dados de teste",
  caso_desatualizado: "Caso desatualizado",
  instavel: "Teste instável",
};
const POLL_MS = 3000;
const when = (iso: string) => new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
const formatElapsed = (s: number) => (s < 60 ? `${s}s` : `${Math.floor(s / 60)}min ${String(s % 60).padStart(2, "0")}s`);

/**
 * Cartão "Diagnóstico de falhas": a análise da IA salva no run, o andamento de uma
 * análise em curso (consulta a cada 3 s) e o botão para analisar de novo.
 */
export function RunDiagnosis({
  runId,
  initial,
  cases,
  canAnalyze,
  configured,
}: {
  runId: number;
  initial: DiagnosisView;
  /** Execução → posição na tela de execução e título do caso, para os links. */
  cases: Record<number, { index: number; title: string }>;
  canAnalyze: boolean;
  configured: boolean;
}) {
  const [view, setView] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const alive = useRef(true);
  useEffect(() => () => void (alive.current = false), []);

  const poll = useCallback(async () => {
    while (alive.current) {
      await new Promise((ok) => setTimeout(ok, POLL_MS));
      if (!alive.current) return;
      const next = await send<DiagnosisView>(`/api/runs/${runId}/diagnosis`, "GET").catch(() => null);
      if (!next) continue;
      setView(next);
      if (next.job?.status !== "running") return;
    }
  }, [runId]);

  // Análise automática que começou ao concluir o run: acompanha até terminar.
  useEffect(() => {
    if (initial.job?.status === "running") poll();
  }, [initial.job?.status, poll]);

  async function analyze() {
    setError(null);
    try {
      const { job } = await send<{ job: JobView }>(`/api/runs/${runId}/diagnosis`, "POST");
      setView((v) => ({ ...v, job }));
      poll();
    } catch (e) {
      setError((e as Error).message);
    }
  }

  const running = view.job?.status === "running";
  const failed = view.job?.status === "error" ? view.job.error : null;
  const d = view.saved;

  return (
    <Card className="mb-3 p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Sparkles className="size-4 text-accent" aria-hidden /> Diagnóstico de falhas
          </h2>
          <p className="mt-0.5 text-xs text-muted">
            {d ? `Análise da IA em ${when(d.at)} (pedida por ${d.by}). Revise antes de agir: é uma sugestão.` : "A IA agrupa as falhas por causa provável e sugere o que fazer."}
          </p>
        </div>
        {canAnalyze && !running && (
          <Button onClick={analyze}>
            {d || failed ? <RotateCcw className="size-4" /> : <Sparkles className="size-4" />} {d ? "Analisar de novo" : failed ? "Tentar de novo" : "Analisar falhas"}
          </Button>
        )}
      </div>

      {running && (
        <p className="mt-4 flex items-center gap-2 text-sm text-fg-2">
          <Loader2 className="size-4 animate-spin" /> Analisando as falhas… <span className="tabular text-muted">{formatElapsed(view.job!.elapsed)}</span>
        </p>
      )}
      {(failed || error) && (
        <p className="mt-4 rounded-lg bg-failed/10 px-3 py-2 text-sm text-failed">
          {d ? "A última análise não terminou" : "Não foi possível analisar"}: {error ?? failed}
          {d && " Abaixo, a análise anterior."}
        </p>
      )}
      {!d && !running && !failed && !error && (
        <p className="mt-4 text-sm text-muted">
          {configured ? "Ainda sem análise. Ela roda sozinha quando o run é concluído com falhas." : "IA não configurada (n8n): os sinais na tabela abaixo continuam valendo."}
        </p>
      )}

      {d && (
        <div className={cn("mt-4 space-y-3", running && "opacity-60")}>
          {d.summary && <p className="text-sm leading-relaxed">{d.summary}</p>}
          <ul className="grid gap-3 md:grid-cols-2">
            {d.groups.map((g, i) => (
              <li key={i} className="rounded-lg border border-border p-4">
                <div className="flex flex-wrap items-center gap-1.5">
                  <Badge className={g.category === "produto" ? "bg-failed/15 text-failed" : g.category === "instavel" ? "bg-accent/15 text-accent" : "bg-blocked/20"}>{CATEGORY[g.category] ?? g.category}</Badge>
                  <Badge>confiança {g.confidence}</Badge>
                </div>
                <h3 className="mt-2 text-sm font-semibold">{g.title}</h3>
                {g.evidence && <p className="mt-1 text-sm text-fg-2">{g.evidence}</p>}
                {g.action && (
                  <p className="mt-2 text-sm">
                    <b>O que fazer:</b> {g.action}
                  </p>
                )}
                <p className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs">
                  {g.executions.map((id) =>
                    cases[id] ? (
                      <Link key={id} href={`/runs/${runId}/execute?i=${cases[id].index}`} className="text-accent hover:underline">
                        {cases[id].title}
                      </Link>
                    ) : null,
                  )}
                </p>
              </li>
            ))}
          </ul>
        </div>
      )}
    </Card>
  );
}
