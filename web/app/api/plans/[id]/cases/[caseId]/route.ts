import { apiRoute, toId } from "@/lib/api";
import { requirePlanEditable } from "@/lib/visibility";

/** Tira o caso do plano. O caso e o histórico de execuções continuam no Kiwi. */
export const DELETE = apiRoute<{ id: string; caseId: string }>(async ({ kiwi, viewer }, _req, { id, caseId }) => {
  await requirePlanEditable(kiwi, viewer, toId(id));
  await kiwi.removeCaseFromPlan(toId(id), toId(caseId, "caseId"));
});
