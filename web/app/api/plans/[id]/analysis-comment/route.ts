import { ApiError, apiRoute, readJson, toId } from "@/lib/api";
import { analysisHtml, type CasesResult } from "@/lib/ai/parse";
import { addWorkItemComment, AzureError, azureConfig } from "@/lib/azure";
import { findJob } from "@/lib/jobs";
import { planCardId } from "@/lib/plan-task";
import { requirePlanEditable } from "@/lib/visibility";

/**
 * "Enviar análise ao card": publica a análise da geração de casos como comentário no card
 * do Azure do plano, para o PO ver as ambiguidades. Corpo: { job } (a geração já concluída;
 * a análise vem do servidor, não do navegador).
 */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const plan = await requirePlanEditable(kiwi, viewer, toId(id));
  const cardId = planCardId(plan);
  if (!cardId) throw new ApiError("O plano não está ligado a um card do Azure (azure-N)");
  if (!azureConfig()) throw new ApiError("Azure DevOps não configurado (AZURE_DEVOPS_URL e AZURE_DEVOPS_PAT)");
  const raw = await readJson(req);
  const job = findJob<CasesResult, unknown>("cases", String(raw.job ?? ""), plan.id, viewer.username);
  const analysis = job?.status === "done" ? job.result?.analysis : null;
  if (!analysis) throw new ApiError("Análise não encontrada (o QA Hub pode ter reiniciado). Gere os casos de novo.", 404);
  try {
    await addWorkItemComment(cardId, analysisHtml(analysis, viewer.username));
  } catch (e) {
    throw new ApiError(e instanceof AzureError ? e.message : `Não foi possível comentar no card: ${(e as Error).message}`, 502);
  }
  return { ok: true, card: `azure-${cardId}` };
});
