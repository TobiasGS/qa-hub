import "server-only";
import type { KiwiApi } from "./kiwi/types";
import { outcomeOf } from "./metrics";
import { COMPLETED_WORK_FIELD, setPlanTaskState, TASK_STATES } from "./plan-task";
import { durationOf, kiwiDate } from "./timer";

// Estado do run: concluído quando nenhum caso está pendente, reaberto se algum
// voltar a pendente. A tarefa "Plano de Teste" no Azure acompanha o run mais
// recente do plano: Em Teste → Testado / Teste Recusado.

/** O run é o mais recente do plano? (só ele move a tarefa no Azure) */
async function isLatestRun(kiwi: KiwiApi, planId: number, runId: number) {
  const runs = await kiwi.runs({ plan: planId });
  return runs.every((r) => r.id <= runId);
}

/** Horas de teste do plano: soma do tempo efetivo de todas as execuções de todos os runs (mínimo 0,25 h). */
async function planHours(kiwi: KiwiApi, planId: number): Promise<number> {
  const runs = await kiwi.runs({ plan: planId });
  const executions = runs.length ? await kiwi.executions({ run__in: runs.map((r) => r.id) }) : [];
  const seconds = executions.reduce((sum, e) => sum + (durationOf(e) ?? 0), 0);
  return Math.max(0.25, Math.round((seconds / 3600) * 100) / 100);
}

/** Run novo ou re-teste: a tarefa do plano vai para "Em Teste". */
export async function markRunStarted(kiwi: KiwiApi, planId: number): Promise<void> {
  await setPlanTaskState(kiwi, planId, TASK_STATES.testing);
}

/**
 * Recalcula o run depois de uma mudança de execução. Devolve o que aconteceu,
 * para a tela avisar ("run concluído").
 */
export async function syncRunState(kiwi: KiwiApi, runId: number): Promise<"closed" | "reopened" | null> {
  const [[run], executions, statuses] = await Promise.all([kiwi.runs({ id: runId }), kiwi.executions({ run: runId }), kiwi.statuses()]);
  if (!run || !executions.length) return null;
  const outcomes = executions.map((e) => outcomeOf(e.status, statuses));
  const pending = outcomes.includes("pending");

  if (!pending && !run.stop_date) {
    await kiwi.updateRun(runId, { stop_date: kiwiDate(new Date()) });
    if (await isLatestRun(kiwi, run.plan, runId)) {
      const failed = outcomes.some((o) => o === "failed" || o === "blocked");
      await setPlanTaskState(kiwi, run.plan, failed ? TASK_STATES.failed : TASK_STATES.passed, { [COMPLETED_WORK_FIELD]: await planHours(kiwi, run.plan) });
    }
    return "closed";
  }
  if (pending && run.stop_date) {
    await kiwi.updateRun(runId, { stop_date: null });
    if (await isLatestRun(kiwi, run.plan, runId)) await setPlanTaskState(kiwi, run.plan, TASK_STATES.testing);
    return "reopened";
  }
  return null;
}
