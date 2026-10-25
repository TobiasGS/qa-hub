import { apiRoute, readJson, toId } from "@/lib/api";
import { caseInput } from "@/lib/validation";

/** Cria um caso e já o adiciona ao plano. */
export const POST = apiRoute<{ id: string }>(async ({ kiwi }, req, { id }) => {
  const planId = toId(id);
  const created = await kiwi.createCase(caseInput(await readJson(req)));
  await kiwi.addCaseToPlan(planId, created.id);
  return { case: created };
});
