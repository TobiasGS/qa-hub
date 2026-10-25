import { apiRoute, readJson, toId } from "@/lib/api";
import { requirePlanEditable } from "@/lib/visibility";
import { planPatch } from "@/lib/validation";

/** Edita o plano. Arquivar/restaurar é `{ is_active: false | true }`: o Kiwi não apaga planos pela API. */
export const PATCH = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  await requirePlanEditable(kiwi, viewer, toId(id));
  const plan = await kiwi.updatePlan(toId(id), await planPatch(kiwi, await readJson(req)));
  return { plan };
});
