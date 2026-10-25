import { apiRoute, toId } from "@/lib/api";
import { outcomeOf } from "@/lib/metrics";
import { durationOf, parseTimerComments } from "@/lib/timer";

/**
 * Histórico de um caso: as últimas 10 execuções (run original e re-testes),
 * com resultado, testador, tempo efetivo e a linha do tempo do cronômetro.
 * Uma chamada de comentários por execução: o limite de 10 mantém a rota
 * abaixo do teto de subrequests do Cloudflare Workers.
 */
export const GET = apiRoute<{ id: string }>(async ({ kiwi }, _req, { id }) => {
  const caseId = toId(id);
  const [executions, statuses] = await Promise.all([kiwi.executions({ case: caseId }), kiwi.statuses()]);
  const latest = executions.sort((a, b) => b.id - a.id).slice(0, 10);
  if (!latest.length) return { attempts: [] };

  const [runs, comments] = await Promise.all([kiwi.runs({ id__in: [...new Set(latest.map((e) => e.run))] }), Promise.all(latest.map((e) => kiwi.comments(e.id)))]);

  const attempts = latest.map((e, i) => {
    const run = runs.find((r) => r.id === e.run);
    const outcome = outcomeOf(e.status, statuses);
    return {
      executionId: e.id,
      runId: e.run,
      runSummary: run?.summary ?? `Run #${e.run}`,
      retest: run?.summary.startsWith("Re-teste:") ?? false,
      build: e.build__name,
      status: e.status__name,
      outcome,
      tester: e.tested_by__username ?? e.assignee__username,
      date: e.stop_date ?? e.start_date ?? run?.start_date ?? null,
      duration: outcome === "pending" ? null : durationOf(e),
      timeline: parseTimerComments(comments[i]),
    };
  });
  return { attempts };
});
