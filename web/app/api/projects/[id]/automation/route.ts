import { ApiError, apiRoute, readJson, toId } from "@/lib/api";
import { getAutomation, saveAutomation, toView } from "@/lib/automation-config";
import type { KiwiApi } from "@/lib/kiwi/types";
import type { Viewer } from "@/lib/session";
import { canSeeProject, projectOwner, sameUser, visibleSet } from "@/lib/visibility";

/** Configurar a automação: dono do projeto ou admin. Quem não vê o projeto recebe 404. */
async function requireProjectEditable(kiwi: KiwiApi, viewer: Viewer, productId: number) {
  const product = (await kiwi.products()).find((p) => p.id === productId);
  if (!product || !canSeeProject(await visibleSet(kiwi, viewer), productId)) throw new ApiError("Projeto não encontrado", 404);
  if (!viewer.isAdmin && !sameUser(projectOwner(product), viewer.username)) throw new ApiError("Só quem criou o projeto (ou um admin) pode configurar a automação", 403);
  return product;
}

/** Configuração de automação do projeto (sem a senha). */
export const GET = apiRoute<{ id: string }>(async ({ kiwi, viewer }, _req, { id }) => {
  const product = await requireProjectEditable(kiwi, viewer, toId(id));
  const config = await getAutomation(product.id);
  return { automation: config ? toView(config) : null };
});

/** Salva: { baseUrl, folder, login: { path, userLabel, passwordLabel, submitLabel, successUrl }, user, password? }. */
export const PUT = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const product = await requireProjectEditable(kiwi, viewer, toId(id));
  const saved = await saveAutomation(product.id, await readJson(req), viewer.username);
  return { automation: toView(saved) };
});
