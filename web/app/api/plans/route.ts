import { apiRoute, readJson } from "@/lib/api";
import { hubOrigin } from "@/lib/origin";
import { ensurePlanTask } from "@/lib/plan-task";
import { planInput } from "@/lib/validation";

/** Cria o plano e, se ele aponta para um card do Azure, a tarefa "Plano de Teste" filha do card. */
export const POST = apiRoute(async ({ kiwi }, req) => {
  const plan = await kiwi.createPlan(await planInput(kiwi, await readJson(req)));
  const azureTask = await ensurePlanTask(kiwi, plan, hubOrigin(req));
  return { plan, azureTask };
});
