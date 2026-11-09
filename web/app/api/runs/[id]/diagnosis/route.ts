import { ApiError, apiRoute, toId } from "@/lib/api";
import { failureSignals } from "@/lib/diagnosis";
import { latestJob } from "@/lib/jobs";
import { aiConfigured, readDiagnosis, startDiagnosis, type DiagnosisJob, type SavedDiagnosis } from "@/lib/run-diagnosis";
import { canEditPlan, requireRunVisible } from "@/lib/visibility";

const jobView = (job: DiagnosisJob | null) =>
  job && {
    status: job.status,
    elapsed: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
    ...(job.status === "error" ? { error: job.error } : {}),
  };

/** Diagnóstico de falhas do run: sinais (histórico), análise salva e a análise em andamento. */
export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const runId = toId(id);
  await requireRunVisible(kiwi, viewer, runId);
  const [run] = await kiwi.runs({ id: runId });
  if (!run) throw new ApiError("Run não encontrado", 404);
  const [plan] = await kiwi.plans({ id: run.plan });
  return {
    signals: await failureSignals(kiwi, run),
    saved: readDiagnosis(run.notes),
    job: jobView(latestJob<SavedDiagnosis, null>("diagnosis", run.id)),
    canAnalyze: !!plan && canEditPlan(viewer, plan) && aiConfigured(),
    configured: aiConfigured(),
  };
});

/** (Re)analisa as falhas com a IA: dono do plano ou admin. */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const runId = toId(id);
  await requireRunVisible(kiwi, viewer, runId);
  const [run] = await kiwi.runs({ id: runId });
  if (!run) throw new ApiError("Run não encontrado", 404);
  const [plan] = await kiwi.plans({ id: run.plan });
  if (!plan || !canEditPlan(viewer, plan)) throw new ApiError("Só quem criou o plano (ou um admin) pode pedir uma nova análise", 403);
  if (!aiConfigured()) throw new ApiError("IA não configurada: defina ANTHROPIC_API_KEY (Claude) ou N8N_WEBHOOK_URL e N8N_WEBHOOK_SECRET (n8n).");
  const job = await startDiagnosis(kiwi, run, viewer.username);
  if (!job) throw new ApiError("Este run não tem falhas para analisar.");
  return { job: jobView(job) };
});
