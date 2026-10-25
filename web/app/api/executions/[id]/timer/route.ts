import { ApiError, apiRoute, readJson, toId } from "@/lib/api";
import { requireExecutionVisible } from "@/lib/visibility";
import { kiwiDate, timerComment, type TimerEvent } from "@/lib/timer";

const EVENTS: TimerEvent[] = ["start", "pause", "resume"];

/**
 * Registra início, pausa e retomada do cronômetro. Também é chamado por
 * navigator.sendBeacon quando a página fecha.
 *   RUNNING: start_date = agora − acumulado (o tempo corre a partir dele)
 *   PAUSED:  start_date/stop_date guardam o acumulado (stop − start)
 */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const raw = await readJson(req);
  const event = raw.event as TimerEvent;
  const elapsed = Math.max(0, Math.min(12 * 3600, Math.round(Number(raw.elapsed) || 0)));
  if (!EVENTS.includes(event)) throw new ApiError("Evento inválido");

  const [[execution], statuses] = await Promise.all([kiwi.executions({ id: executionId }), kiwi.statuses()]);
  if (!execution) throw new ApiError("Execução não encontrada", 404);
  // Execução já finalizada não volta para "em execução" por um evento atrasado.
  if ((statuses.find((s) => s.id === execution.status)?.weight ?? 0) !== 0) return { execution };

  const target = statuses.find((s) => s.name === (event === "pause" ? "PAUSED" : "RUNNING"));
  const now = new Date();
  const start = kiwiDate(new Date(now.getTime() - elapsed * 1000));
  const updated = await kiwi.updateExecution(executionId, {
    ...(target ? { status: target.id } : {}),
    start_date: start,
    ...(event === "pause" ? { stop_date: kiwiDate(now) } : {}),
  });
  await kiwi.addComment(executionId, timerComment(event, elapsed));
  return { execution: updated };
});
