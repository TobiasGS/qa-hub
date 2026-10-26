import { apiRoute, readJson, toId } from "@/lib/api";
import { hubOrigin } from "@/lib/origin";
import { ensurePlanTask, renamePlanTask } from "@/lib/plan-task";
import { requirePlanEditable } from "@/lib/visibility";
import { planPatch } from "@/lib/validation";

/**
 * Edita o plano. Arquivar/restaurar é `{ is_active: false | true }`: o Kiwi não apaga planos pela API.
 * Nome novo → título da tarefa no Azure; card novo (azure-N) → tarefa nova nesse card.
 */
export const PATCH = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const before = await requirePlanEditable(kiwi, viewer, toId(id));
  const plan = await kiwi.updatePlan(toId(id), await planPatch(kiwi, await readJson(req)));
  const azureTask = plan.extra_link !== before.extra_link ? await ensurePlanTask(kiwi, plan, hubOrigin(req)) : undefined;
  if (plan.name !== before.name) await renamePlanTask(kiwi, plan);
  return { plan, azureTask };
});
