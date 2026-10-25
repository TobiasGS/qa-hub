import { ApiError, apiRoute, readJson, toId, toText } from "@/lib/api";
import { requireExecutionVisible } from "@/lib/visibility";
import { AzureError, createBug, reproStepsHtml, SEVERITIES } from "@/lib/azure";
import { AZURE_NOT_CONFIGURED, bugContext, reproData } from "@/lib/bug";
import { parseRequirements } from "@/lib/requirements";

/**
 * Abre o bug de uma execução.
 *   { url }                        → só vincula um bug que já existe
 *   { title, severity, notes }     → cria no destino do card do plano:
 *       card AB#n → Bug no Azure DevOps, filho do card;  outros → Bug.report do Kiwi
 */
export const POST = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const raw = await readJson(req).catch(() => ({}) as Record<string, unknown>);

  if (raw.url) {
    const url = toText(raw.url, "URL", { max: 1024 });
    if (!/^https?:\/\//i.test(url)) throw new ApiError("URL inválida");
    const name = parseRequirements(url).keys[0] ?? url.split(/[/=]/).filter(Boolean).pop() ?? "bug";
    return { link: await kiwi.addLink(executionId, { url, name, is_defect: true }) };
  }

  const ctx = await bugContext(kiwi, executionId);
  const origin = (process.env.QA_HUB_URL ?? new URL(req.url).origin).replace(/\/$/, "");

  if (ctx.destination === "azure") {
    const title = toText(raw.title, "título", { required: true });
    const severity = SEVERITIES.includes(raw.severity as (typeof SEVERITIES)[number]) ? String(raw.severity) : "3 - Medium";
    const notes = toText(raw.notes, "observações", { max: 5000 });

    // Nunca simula: um número inventado viraria um link quebrado no Azure de verdade.
    if (!ctx.azureConfigured) throw new ApiError(AZURE_NOT_CONFIGURED);
    const data = await reproData(kiwi, ctx, origin);
    let bug: { id: number; url: string };
    try {
      bug = await createBug({
        parentId: ctx.azureParentId!,
        title,
        severity,
        foundIn: ctx.execution.build__name,
        hyperlink: data.link,
        reproHtml: reproStepsHtml({ ...data, notes }),
      });
    } catch (e) {
      throw new ApiError(e instanceof AzureError ? e.message : `Falha ao criar o bug no Azure: ${(e as Error).message}`, 502);
    }
    const link = await kiwi.addLink(executionId, { url: bug.url, name: `AB#${bug.id}`, is_defect: true });
    return { link, parent: ctx.cardKey };
  }

  const trackerId = Number(process.env.KIWI_BUG_TRACKER_ID);
  if (!trackerId) throw new ApiError("Nenhum bug tracker configurado (KIWI_BUG_TRACKER_ID)");
  const bugUrl = await kiwi.reportBug(executionId, trackerId);
  // O Kiwi já cria o link de defeito; buscamos para devolver o registro completo.
  const [link] = await kiwi.links({ execution: executionId, url: bugUrl });
  return { link: link ?? { id: Date.now(), execution: executionId, url: bugUrl, name: bugUrl.split("/").pop(), is_defect: true, created_on: new Date().toISOString() } };
});
