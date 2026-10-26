import { ApiError, apiRoute, toId } from "@/lib/api";
import { hubOrigin } from "@/lib/origin";
import { ensurePlanTask, planCardId } from "@/lib/plan-task";
import { requirePlanEditable } from "@/lib/visibility";

/** Botão "Criar tarefa no Azure" (planos criados antes da integração). */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const plan = await requirePlanEditable(kiwi, viewer, toId(id));
  if (!planCardId(plan)) throw new ApiError("O plano não está ligado a um card do Azure (azure-N)");
  const result = await ensurePlanTask(kiwi, plan, hubOrigin(req));
  if (!result.task) throw new ApiError(result.warning ?? "Não foi possível criar a tarefa no Azure", 502);
  return result;
});
