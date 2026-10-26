import { ApiError, apiRoute, toId } from "@/lib/api";
import { AzureError, azureConfig, getStory } from "@/lib/azure";
import { findGeneration, startGeneration, type GenerationJob } from "@/lib/generation-jobs";
import { generateCasesViaN8n } from "@/lib/n8n";
import { planCardId } from "@/lib/plan-task";
import { requirePlanEditable } from "@/lib/visibility";

/** O que o diálogo recebe ao iniciar e a cada consulta. */
const view = (job: GenerationJob) => ({
  job: job.id,
  status: job.status,
  story: job.story,
  elapsed: Math.round(((job.finishedAt ?? Date.now()) - job.startedAt) / 1000),
  ...(job.status === "done" ? { cases: job.cases } : {}),
  ...(job.status === "error" ? { error: job.error } : {}),
});

/**
 * "Gerar casos da história": lê o card do plano no Azure e inicia, em segundo
 * plano, o pedido ao n8n (Dado/Quando/Então). Responde na hora com o id do job;
 * o diálogo consulta o GET até terminar. Nada é salvo aqui: a pessoa revisa no
 * diálogo e só então os casos são criados.
 */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const plan = await requirePlanEditable(kiwi, viewer, toId(id));
  const cardId = planCardId(plan);
  if (!cardId) throw new ApiError("O plano não está ligado a um card do Azure (azure-N)");
  if (!azureConfig()) throw new ApiError("Azure DevOps não configurado (AZURE_DEVOPS_URL e AZURE_DEVOPS_PAT)");
  if (!process.env.N8N_WEBHOOK_URL || !process.env.N8N_WEBHOOK_SECRET) throw new ApiError("Geração por IA não configurada: defina N8N_WEBHOOK_URL e N8N_WEBHOOK_SECRET.");

  let story;
  try {
    story = await getStory(cardId);
  } catch (e) {
    throw new ApiError(e instanceof AzureError ? e.message : `Não foi possível ler o card no Azure: ${(e as Error).message}`, 502);
  }
  if (!story.description && !story.acceptanceCriteria) {
    throw new ApiError(`O card azure-${cardId} não tem descrição nem critérios de aceite para basear os casos.`);
  }

  const existing = await kiwi.cases({ plan: plan.id });
  const key = `azure-${cardId}`;
  const job = startGeneration({ planId: plan.id, owner: viewer.username, story: { key, title: story.title, type: story.type } }, () =>
    generateCasesViaN8n({
      story: { key, title: story.title, description: story.description, acceptanceCriteria: story.acceptanceCriteria },
      format: "gherkin",
      language: "pt-BR",
      existingCases: existing.map((c) => c.summary),
    }),
  );
  return view(job);
});

/** Andamento da geração: ?job=<id>. */
export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const plan = await requirePlanEditable(kiwi, viewer, toId(id));
  const jobId = new URL(req.url).searchParams.get("job") ?? "";
  const job = findGeneration(jobId, plan.id, viewer.username);
  if (!job) throw new ApiError("Geração não encontrada (o QA Hub pode ter reiniciado). Clique em Gerar de novo.", 404);
  return view(job);
});
