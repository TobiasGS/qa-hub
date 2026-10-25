import { apiRoute, readJson, toId } from "@/lib/api";
import { requirePlanEditable } from "@/lib/visibility";
import { caseInput } from "@/lib/validation";

/** Cria um caso e já o adiciona ao plano. */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const planId = toId(id);
  await requirePlanEditable(kiwi, viewer, planId);
  const created = await kiwi.createCase(caseInput(await readJson(req)));
  await kiwi.addCaseToPlan(planId, created.id);
  return { case: created };
});
