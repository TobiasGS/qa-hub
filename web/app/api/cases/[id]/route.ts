import { apiRoute, readJson, toId } from "@/lib/api";
import { casePatch } from "@/lib/validation";

/** Edita o caso. Desativar é mudar o `case_status` para DISABLED. */
export const PATCH = apiRoute<{ id: string }>(async ({ kiwi }, req, { id }) => {
  const updated = await kiwi.updateCase(toId(id), casePatch(await readJson(req)));
  return { case: updated };
});
