import { ApiError, apiRoute, readJson, toId } from "@/lib/api";
import { requireExecutionVisible } from "@/lib/visibility";
import { syncRunState } from "@/lib/run-state";
import { kiwiDate, timerComment } from "@/lib/timer";

/**
 * Grava o resultado de uma execução: { status, comment?, elapsed? }.
 * Com `elapsed` (segundos efetivos do cronômetro), o tempo fica no Kiwi como
 * stop_date = agora e start_date = agora − elapsed, e a linha do tempo ganha o "finish".
 */
export const PATCH = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const raw = await readJson(req);
  const status = toId(raw.status, "status");
  const comment = typeof raw.comment === "string" ? raw.comment.trim() : "";
  const elapsed = raw.elapsed === undefined ? null : Math.round(Number(raw.elapsed));
  if (elapsed !== null && (!Number.isFinite(elapsed) || elapsed < 0)) throw new ApiError("Tempo inválido");

  const now = new Date();
  const timing = elapsed !== null ? { start_date: kiwiDate(new Date(now.getTime() - elapsed * 1000)), stop_date: kiwiDate(now) } : {};
  const execution = await kiwi.updateExecution(executionId, { status, ...timing });
  if (comment) await kiwi.addComment(executionId, comment);
  if (elapsed !== null) await kiwi.addComment(executionId, timerComment("finish", elapsed, execution.status__name));
  // Último caso executado → run concluído (e tarefa do plano no Azure: Testado / Teste Recusado).
  const run = await syncRunState(kiwi, execution.run);
  return { execution, run };
});
