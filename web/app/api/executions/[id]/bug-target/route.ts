import { apiRoute, toId } from "@/lib/api";
import { getWorkItem } from "@/lib/azure";
import { AZURE_NOT_CONFIGURED, bugContext } from "@/lib/bug";

/** Para onde o bug desta execução vai (mostrado no diálogo "Abrir bug"). */
export const GET = apiRoute<{ id: string }>(async ({ kiwi }, _req, { id }) => {
  const ctx = await bugContext(kiwi, toId(id));
  const base = { destination: ctx.destination, card: ctx.cardKey, caseTitle: ctx.execution.case__summary };
  if (ctx.destination !== "azure") return base;

  if (!ctx.azureConfigured) {
    return { ...base, blocked: true, warning: AZURE_NOT_CONFIGURED };
  }
  try {
    const parent = await getWorkItem(ctx.azureParentId!);
    return { ...base, parentTitle: parent.title, parentType: parent.type };
  } catch (e) {
    // Sem acesso ao card (rede, PAT ou permissão): não deixa criar um bug órfão.
    return { ...base, blocked: true, warning: (e as Error).message };
  }
});
