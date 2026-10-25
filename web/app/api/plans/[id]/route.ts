import { apiRoute, readJson, toId } from "@/lib/api";
import { planPatch } from "@/lib/validation";

/** Edita o plano. Arquivar/restaurar é `{ is_active: false | true }`: o Kiwi não apaga planos pela API. */
export const PATCH = apiRoute<{ id: string }>(async ({ kiwi }, req, { id }) => {
  const plan = await kiwi.updatePlan(toId(id), await planPatch(kiwi, await readJson(req)));
  return { plan };
});
