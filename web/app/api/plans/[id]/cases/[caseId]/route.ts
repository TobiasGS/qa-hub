import { apiRoute, toId } from "@/lib/api";

/** Tira o caso do plano. O caso e o histórico de execuções continuam no Kiwi. */
export const DELETE = apiRoute<{ id: string; caseId: string }>(async ({ kiwi }, _req, { id, caseId }) => {
  await kiwi.removeCaseFromPlan(toId(id), toId(caseId, "caseId"));
});
