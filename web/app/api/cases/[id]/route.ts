import { apiRoute, readJson, toId } from "@/lib/api";
import { requireCaseEditable } from "@/lib/visibility";
import { casePatch } from "@/lib/validation";

/** Edita o caso. Desativar é mudar o `case_status` para DISABLED. */
export const PATCH = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  await requireCaseEditable(kiwi, viewer, toId(id));
  const updated = await kiwi.updateCase(toId(id), casePatch(await readJson(req)));
  return { case: updated };
});
