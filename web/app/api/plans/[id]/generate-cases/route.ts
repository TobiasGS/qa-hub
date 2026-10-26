import { ApiError, apiRoute, toId } from "@/lib/api";
import { AzureError, azureConfig, getStory } from "@/lib/azure";
import { generateCasesViaN8n } from "@/lib/n8n";
import { planCardId } from "@/lib/plan-task";
import { requirePlanEditable } from "@/lib/visibility";

/**
 * "Gerar casos da história": lê o card do plano no Azure e pede ao n8n uma
 * proposta de casos (Dado/Quando/Então). Nada é salvo aqui: a pessoa revisa
 * no diálogo e só então os casos são criados.
 */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const plan = await requirePlanEditable(kiwi, viewer, toId(id));
  const cardId = planCardId(plan);
  if (!cardId) throw new ApiError("O plano não está ligado a um card do Azure (azure-N)");
  if (!azureConfig()) throw new ApiError("Azure DevOps não configurado (AZURE_DEVOPS_URL e AZURE_DEVOPS_PAT)");

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
  const cases = await generateCasesViaN8n({
    story: { key, title: story.title, description: story.description, acceptanceCriteria: story.acceptanceCriteria },
    format: "gherkin",
    language: "pt-BR",
    existingCases: existing.map((c) => c.summary),
  });
  return { story: { key, title: story.title, type: story.type }, cases };
});
