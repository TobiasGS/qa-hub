import { ApiError, apiRoute, toId } from "@/lib/api";
import { requireExecutionVisible } from "@/lib/visibility";
import { saveEvidence } from "@/lib/evidence/save";
import { EVIDENCE_PATH, evidencePath, isEvidence } from "@/lib/evidence/shared";
import { isValidKey, storage } from "@/lib/evidence/storage";

/**
 * Envia uma evidência. O corpo é o arquivo cru (não multipart), para ir em
 * stream até o armazenamento sem carregar tudo na memória.
 *   PUT /api/executions/12/evidence?name=print.png
 */
export const PUT = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const name = new URL(req.url).searchParams.get("name")?.trim() ?? "";
  const origin = process.env.QA_HUB_URL ?? new URL(req.url).origin;
  const link = await saveEvidence(kiwi, executionId, { name, body: req.body, size: Number(req.headers.get("content-length")) }, origin);
  return { link };
});

/** Remove a evidência: o arquivo e o link na execução.  DELETE ...?link=<id> */
export const DELETE = apiRoute<{ id: string }>(async ({ kiwi, viewer }, req, { id }) => {
  const executionId = toId(id);
  await requireExecutionVisible(kiwi, viewer, executionId);
  const linkId = toId(new URL(req.url).searchParams.get("link"), "link");
  const [link] = await kiwi.links({ id: linkId, execution: executionId });
  if (!link || !isEvidence(link)) throw new ApiError("Evidência não encontrada", 404);

  const key = evidencePath(link).slice(EVIDENCE_PATH.length);
  if (isValidKey(key)) await storage().delete(key);
  await kiwi.removeLink(link.id);
});
