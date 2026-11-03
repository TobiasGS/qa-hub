import { ApiError, readJson } from "@/lib/api";
import { executionFor } from "@/lib/automation";
import { automationRoute } from "@/lib/automation-auth";
import { updateLive } from "@/lib/live";

const MAX_FRAME = 400 * 1024;

/**
 * Automação ao vivo: { run, caseId?, title?, step?, event?: "begin" | "end", status?, image? (JPEG base64) }.
 * Guarda só o último quadro. No início de um caso, marca a execução como "Em execução".
 */
export const POST = automationRoute(async ({ kiwi }, req) => {
  const raw = await readJson(req);
  const runId = Number(raw.run);
  if (!Number.isInteger(runId) || runId <= 0) throw new ApiError("Campo inválido: run");
  const caseId = Number(raw.caseId) || null;
  let frame: Buffer | undefined;
  if (typeof raw.image === "string" && raw.image) {
    frame = Buffer.from(raw.image, "base64");
    if (frame.length > MAX_FRAME) throw new ApiError("Quadro grande demais (máx. 400 KB)", 413);
    if (frame[0] !== 0xff || frame[1] !== 0xd8) throw new ApiError("O quadro precisa ser JPEG");
  }
  updateLive(runId, {
    ...(caseId ? { caseId } : {}),
    ...(typeof raw.title === "string" ? { title: raw.title.slice(0, 300) } : {}),
    ...(typeof raw.step === "string" ? { step: raw.step.slice(0, 300) } : {}),
    status: typeof raw.status === "string" ? raw.status.slice(0, 20) : null,
    ...(frame ? { frame } : {}),
  });
  // Caso começou: "Em execução" na tabela do run (o resultado final chega em /results).
  if (raw.event === "begin" && caseId) {
    const execution = await executionFor(kiwi, runId, caseId);
    const running = (await kiwi.statuses()).find((s) => s.name === "RUNNING");
    if (execution && running && execution.status !== running.id) await kiwi.updateExecution(execution.id, { status: running.id });
  }
  return { ok: true };
});
